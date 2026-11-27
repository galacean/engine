import { WebGLEngine } from "@galacean/engine";
import {
  BoxCollider,
  CharacterController,
  Collider,
  Collision,
  ContactPoint,
  Entity,
  HitResult,
  Layer,
  Logger,
  MeshCollider,
  PhysicsMaterial,
  PhysicsScene,
  PlaneCollider,
  PrimitiveMesh,
  Rigidbody,
  Scene,
  Script,
  SphereCollider
} from "@galacean/engine-core";
import { Ray, Vector3 } from "@galacean/engine-math";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPhysics } from "../../utils/physics";

class TriggerRecorder extends Script {
  readonly enters: [Collider, Collider][] = [];
  readonly stays: [Collider, Collider][] = [];
  readonly exits: [Collider, Collider][] = [];

  override onTriggerEnter(other: Collider, self: Collider): void {
    this.enters.push([other, self]);
  }

  override onTriggerStay(other: Collider, self: Collider): void {
    this.stays.push([other, self]);
  }

  override onTriggerExit(other: Collider, self: Collider): void {
    this.exits.push([other, self]);
  }
}

class ContactRecorder extends Script {
  enterCount = 0;
  exitCount = 0;
  other: Collider | null = null;
  self: Collider | null = null;
  readonly normal = new Vector3();

  override onCollisionEnter(collision: Collision): void {
    this.enterCount++;
    this.other = collision.collider;
    this.self = collision.selfCollider;
    const contacts: ContactPoint[] = [];
    if (collision.getContacts(contacts) > 0) {
      this.normal.copyFrom(contacts[0].normal);
    }
  }

  override onCollisionExit(): void {
    this.exitCount++;
  }
}

/**
 * Acceptance matrix for RFC #3194: Colliders are components, the nearest Rigidbody in the hierarchy owns them.
 */
describe("Rigidbody ownership", () => {
  let engine: WebGLEngine;
  let backend: ReturnType<typeof createPhysics>;
  let physics: PhysicsScene;
  let root: Entity;

  beforeAll(async () => {
    backend = createPhysics();
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: backend });
    physics = engine.sceneManager.activeScene.physics;
  });

  beforeEach(() => {
    root = engine.sceneManager.activeScene.createRootEntity("ownership");
    root.transform.setPosition(0, 1000, 0);
    physics.gravity = new Vector3(0, -9.81, 0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    physics.setColliderLayerCollision(Layer.Layer6, Layer.Layer0, true);
    root.destroy();
    engine.resourceManager.gc();
  });

  afterAll(() => engine.destroy());

  function update(count = 1): void {
    for (let i = 0; i < count; i++) {
      (physics as any)._update(1 / 60);
    }
  }

  function updateFrame(count = 1): void {
    const stepMs = physics.fixedTimeStep * 1000 + 0.001;
    let now = performance.now();
    (engine as any)._time._lastSystemTime = now / 1000;
    const spy = vi.spyOn(performance, "now").mockImplementation(() => {
      now += stepMs;
      return now;
    });
    try {
      for (let i = 0; i < count; i++) {
        engine.update();
      }
    } finally {
      spy.mockRestore();
      (engine as any)._time._lastSystemTime = performance.now() / 1000;
    }
  }

  /** Sorts overlapping collider names to make failed assertions readable. */
  function hits(x: number, y: number, z: number, layer = Layer.Everything): string[] {
    return names(physics.overlapSphereAll(new Vector3(x, y, z), 0.05, layer));
  }

  function names(colliders: Collider[]): string[] {
    return colliders.map((collider) => `${collider.entity.name}:${collider.constructor.name}`).sort();
  }

  function addBody(entity: Entity, kinematic = false, gravity = true): Rigidbody {
    const body = entity.addComponent(Rigidbody);
    body.isKinematic = kinematic;
    body.useGravity = gravity;
    return body;
  }

  describe("static Colliders", () => {
    it("follow the Entity's world position, rotation and scale, including center", () => {
      const parent = root.createChild("parent");
      parent.transform.setPosition(10, 0, 0);
      parent.transform.setScale(2, 2, 2);
      const entity = parent.createChild("box");
      entity.transform.setRotation(0, 90, 0);
      const box = entity.addComponent(BoxCollider);
      box.size = new Vector3(1, 1, 4);
      box.center = new Vector3(1, 0, 0);

      // Local center (1,0,0) is scaled to 2 and rotated by 90 degrees around Y to (0,0,-2)
      expect(hits(10, 1000, -2)).toEqual(names([box]));
      // Box depth 4 scaled to 8 lies along world X after the rotation
      expect(hits(13.9, 1000, -2)).toEqual(names([box]));
      expect(hits(10, 1000, 3)).toEqual([]);

      entity.transform.setRotation(0, 0, 0);
      expect(hits(13.9, 1000, -2)).toEqual([]);
      expect(hits(12, 1000, 3.9)).toEqual(names([box]));

      parent.transform.setPosition(-10, 0, 0);
      expect(hits(-8, 1000, 3.9)).toEqual(names([box]));
      expect(hits(12, 1000, 3.9)).toEqual([]);
    });

    it("are created at the final transform after cloning, never at the origin", () => {
      const source = root.createChild("source");
      source.transform.setPosition(4, 2, 3);
      const box = source.addComponent(BoxCollider);
      const clone = source.clone();
      root.addChild(clone);
      clone.transform.setPosition(-4, 2, 3);

      const cloneBox = clone.getComponent(BoxCollider);
      expect(hits(4, 1002, 3)).toEqual(names([box]));
      expect(hits(-4, 1002, 3)).toEqual(names([cloneBox]));
      expect(hits(0, 1000, 0)).toEqual([]);
      expect(hits(0, 0, 0)).toEqual([]);
    });
  });

  describe("hierarchy ownership", () => {
    it("moves query registration when a disable callback moves the target parent to another scene", () => {
      const source = engine.sceneManager.activeScene;
      const destination = new Scene(engine);
      engine.sceneManager.addScene(destination);
      const moving = source.createRootEntity("moving");
      const driver = source.createRootEntity("driver");
      const target = source.createRootEntity("target");
      moving.addComponent(BoxCollider);
      moving.addComponent(
        class extends Script {
          override onDisable(): void {
            if (target.scene !== destination) destination.addRootEntity(target);
          }
        }
      );
      const moveChild = driver.addComponent(
        class extends Script {
          override onDisable(): void {
            target.addChild(moving);
          }
        }
      );

      const ray = new Ray(new Vector3(0, 4, 0), new Vector3(0, -1, 0));
      try {
        expect(source.physics.raycast(ray, 8)).toBe(true);
        expect(destination.physics.raycast(ray, 8)).toBe(false);

        source.isActive = false;

        expect(moving.scene).toBe(destination);
        expect(moving.parent).toBe(target);
        expect(source.physics.raycast(ray, 8)).toBe(false);
        expect(destination.physics.raycast(ray, 8)).toBe(true);
      } finally {
        moveChild.destroy();
        driver.destroy();
        source.isActive = true;
        destination.destroy();
      }
    });

    it("lets the nearest Rigidbody own Colliders on its Entity and descendants", () => {
      const bodyEntity = root.createChild("body");
      const own = bodyEntity.addComponent(SphereCollider);
      const child = bodyEntity.createChild("child");
      child.transform.setPosition(3, 0, 0);
      const childCollider = child.addComponent(BoxCollider);
      const body = addBody(bodyEntity);

      expect(own.attachedRigidbody).toBe(body);
      expect(childCollider.attachedRigidbody).toBe(body);

      update(30);
      const bodyY = bodyEntity.transform.worldPosition.y;
      expect(bodyY).toBeLessThan(1000);
      expect(child.transform.worldPosition.y).toBeCloseTo(bodyY, 5);
      expect(child.transform.worldPosition.x).toBeCloseTo(3, 5);
      expect(child.transform.position.x).toBeCloseTo(3, 5);
    });

    it("converts Colliders in one batch without creating temporary static actors", () => {
      const createStatic = vi.spyOn(backend, "createStaticActor");

      const bodyEntity = root.createChild("body");
      bodyEntity.addComponent(BoxCollider);
      bodyEntity.createChild("child").addComponent(SphereCollider);
      addBody(bodyEntity, false, false);
      update();

      expect(createStatic).not.toHaveBeenCalled();
    });

    it("makes Colliders static when their Rigidbody is removed", () => {
      const bodyEntity = root.createChild("body");
      const box = bodyEntity.addComponent(BoxCollider);
      const body = addBody(bodyEntity);
      update(10);
      const fallenY = bodyEntity.transform.worldPosition.y;
      expect(fallenY).toBeLessThan(1000);

      body.destroy();
      expect(box.attachedRigidbody).toBe(null);
      update(10);
      expect(bodyEntity.transform.worldPosition.y).toBe(fallenY);
      expect(hits(0, fallenY, 0)).toEqual(names([box]));
    });

    it("removes the whole group from simulation and queries while the Rigidbody is disabled", () => {
      const bodyEntity = root.createChild("body");
      const box = bodyEntity.addComponent(BoxCollider);
      const childCollider = bodyEntity.createChild("child").addComponent(SphereCollider);
      const body = addBody(bodyEntity);
      expect(hits(0, 1000, 0)).toEqual(names([box, childCollider]));

      body.enabled = false;
      expect(hits(0, 1000, 0)).toEqual([]);
      update(10);
      expect(bodyEntity.transform.worldPosition.y).toBe(1000);
      // Disabling the Rigidbody neither changes the Colliders' own state nor the derived ownership
      expect(box.enabled).toBe(true);
      expect(childCollider.enabled).toBe(true);
      expect(box.attachedRigidbody).toBe(body);

      bodyEntity.transform.setPosition(5, 0, 0);
      body.enabled = true;
      expect(hits(5, 1000, 0)).toEqual(names([box, childCollider]));
      update(10);
      expect(bodyEntity.transform.worldPosition.y).toBeLessThan(1000);
    });

    it("transfers a registered collider to a Rigidbody added in the disabled state", () => {
      class DisabledRigidbody extends Rigidbody {
        constructor(entity: Entity) {
          super(entity);
          this.enabled = false;
        }
      }

      const entity = root.createChild("body");
      const box = entity.addComponent(BoxCollider);
      expect(hits(0, 1000, 0)).toEqual(names([box]));

      const body = entity.addComponent(DisabledRigidbody);
      expect(box.attachedRigidbody).toBe(body);
      expect(hits(0, 1000, 0)).toEqual([]);

      body.enabled = true;
      expect(hits(0, 1000, 0)).toEqual(names([box]));
    });

    it("never lets a disabled nested Rigidbody's Colliders fall back to the outer Rigidbody", () => {
      const outerEntity = root.createChild("outer");
      outerEntity.addComponent(BoxCollider);
      const outer = addBody(outerEntity, true);
      const innerEntity = outerEntity.createChild("inner");
      innerEntity.transform.setPosition(5, 0, 0);
      const innerCollider = innerEntity.addComponent(SphereCollider);
      const inner = addBody(innerEntity, true);
      expect(innerCollider.attachedRigidbody).toBe(inner);
      expect(hits(5, 1000, 0)).toEqual(names([innerCollider]));

      inner.enabled = false;
      expect(innerCollider.attachedRigidbody).toBe(inner);
      expect(hits(5, 1000, 0)).toEqual([]);
      outer.move(new Vector3(0, 1001, 0));
      update();
      expect(hits(5, 1001, 0)).toEqual([]);
    });

    it("moves a Collider to the new owner when its Entity is reparented", () => {
      const first = addBody(root.createChild("first"), true);
      const secondEntity = root.createChild("second");
      secondEntity.transform.setPosition(10, 0, 0);
      const second = addBody(secondEntity, true);
      const entity = first.entity.createChild("collider");
      const sphere = entity.addComponent(SphereCollider);
      expect(sphere.attachedRigidbody).toBe(first);
      expect(hits(0, 1000, 0)).toEqual(names([sphere]));

      secondEntity.addChild(entity);
      expect(sphere.attachedRigidbody).toBe(second);
      expect(hits(10, 1000, 0)).toEqual(names([sphere]));
      expect(hits(0, 1000, 0)).toEqual([]);

      root.addChild(entity);
      expect(sphere.attachedRigidbody).toBe(null);
      expect(hits(0, 1000, 0)).toEqual(names([sphere]));
    });

    it("allows only one Rigidbody per Entity", () => {
      const entity = root.createChild("body");
      entity.addComponent(Rigidbody);
      expect(() => entity.addComponent(Rigidbody)).toThrow(/already has a Rigidbody/);
      expect(entity.getComponents(Rigidbody, []).length).toBe(1);
    });
  });

  describe("non-convex MeshCollider", () => {
    // Triangle meshes are hollow surfaces, so queries probe a face at x = 0.5
    function addMesh(entity: Entity): MeshCollider {
      const collider = entity.addComponent(MeshCollider);
      collider.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1, { keepMeshData: true });
      return collider;
    }

    it("is excluded when a non-kinematic Rigidbody is added above it, and joins once kinematic", () => {
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      const entity = root.createChild("mesh");
      const mesh = addMesh(entity);
      expect(hits(0.5, 1000, 0)).toEqual(names([mesh]));

      const body = addBody(entity, false, false);
      expect(hits(0.5, 1000, 0)).toEqual([]);
      expect(errors).toHaveBeenCalledTimes(1);

      body.isKinematic = true;
      expect(hits(0.5, 1000, 0)).toEqual(names([mesh]));
    });

    it("is excluded when reparented under a non-kinematic Rigidbody", () => {
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      const bodyEntity = root.createChild("body");
      bodyEntity.addComponent(BoxCollider);
      addBody(bodyEntity, false, false);
      const entity = root.createChild("mesh");
      entity.transform.setPosition(5, 0, 0);
      const mesh = addMesh(entity);
      expect(hits(5.5, 1000, 0)).toEqual(names([mesh]));

      bodyEntity.addChild(entity);
      expect(hits(5.5, 1000, 0)).toEqual([]);
      expect(errors).toHaveBeenCalledTimes(1);
    });

    it("keeps convex and motion settings while excluding non-convex geometry from a dynamic body", () => {
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      const entity = root.createChild("mesh");
      const mesh = addMesh(entity);
      mesh.convex = true;
      const body = addBody(entity, false, false);
      expect(hits(0.5, 1000, 0)).toEqual(names([mesh]));

      mesh.convex = false;
      expect(mesh.convex).toBe(false);
      expect(hits(0.5, 1000, 0)).toEqual([]);
      expect(errors).toHaveBeenCalledTimes(1);

      body.isKinematic = true;
      expect(hits(0.5, 1000, 0)).toEqual(names([mesh]));
      body.isKinematic = false;
      expect(body.isKinematic).toBe(false);
      expect(hits(0.5, 1000, 0)).toEqual([]);
      expect(errors).toHaveBeenCalledTimes(2);

      mesh.convex = true;
      expect(hits(0.5, 1000, 0)).toEqual(names([mesh]));
    });
  });

  describe("collision layer", () => {
    it("changes in place without repeating Enter, and Exit only when the matrix filters the pair", () => {
      const trigger = root.createChild("trigger").addComponent(BoxCollider);
      trigger.isTrigger = true;
      const probeEntity = root.createChild("probe");
      probeEntity.addComponent(SphereCollider);
      addBody(probeEntity, true);
      const recorder = probeEntity.addComponent(TriggerRecorder);
      update();
      expect(recorder.enters.length).toBe(1);

      const stays = recorder.stays.length;
      trigger.collisionLayer = Layer.Layer5;
      update(2);
      expect(recorder.enters.length).toBe(1);
      expect(recorder.exits.length).toBe(0);
      expect(recorder.stays.length).toBe(stays + 2);
      expect(hits(0, 1000, 0, Layer.Layer5)).toEqual(names([trigger]));

      physics.setColliderLayerCollision(Layer.Layer6, Layer.Layer0, false);
      trigger.collisionLayer = Layer.Layer6;
      update(2);
      expect(recorder.enters.length).toBe(1);
      expect(recorder.exits.length).toBe(1);
    });

    it("is kept when a Collider moves between static and Rigidbody ownership", () => {
      const entity = root.createChild("box");
      const box = entity.addComponent(BoxCollider);
      box.collisionLayer = Layer.Layer3;
      expect(hits(0, 1000, 0, Layer.Layer3)).toEqual(names([box]));

      const body = addBody(entity, true);
      expect(hits(0, 1000, 0, Layer.Layer3)).toEqual(names([box]));
      expect(hits(0, 1000, 0, Layer.Layer0)).toEqual([]);

      body.destroy();
      expect(hits(0, 1000, 0, Layer.Layer3)).toEqual(names([box]));
    });

    it("rejects multi-layer values", () => {
      const box = root.createChild("box").addComponent(BoxCollider);
      expect(() => (box.collisionLayer = Layer.Layer1 | Layer.Layer2)).toThrow(/single layer/);
      expect(box.collisionLayer).toBe(Layer.Layer0);
    });
  });

  describe("events", () => {
    it("passes (other, self) to trigger callbacks on each Collider's Entity", () => {
      const triggerEntity = root.createChild("trigger");
      const trigger = triggerEntity.addComponent(BoxCollider);
      trigger.isTrigger = true;
      const triggerRecorder = triggerEntity.addComponent(TriggerRecorder);
      const probeEntity = root.createChild("probe");
      const probe = probeEntity.addComponent(SphereCollider);
      addBody(probeEntity, true);
      const probeRecorder = probeEntity.addComponent(TriggerRecorder);
      update();

      expect(probeRecorder.enters.length).toBe(1);
      expect(probeRecorder.enters[0][0]).toBe(trigger);
      expect(probeRecorder.enters[0][1]).toBe(probe);
      expect(triggerRecorder.enters.length).toBe(1);
      expect(triggerRecorder.enters[0][0]).toBe(probe);
      expect(triggerRecorder.enters[0][1]).toBe(trigger);
    });

    it("reports the other and receiving Colliders and orients contacts toward the receiver", () => {
      const groundEntity = root.createChild("ground");
      const ground = groundEntity.addComponent(BoxCollider);
      const groundRecorder = groundEntity.addComponent(ContactRecorder);
      const ballEntity = root.createChild("ball");
      ballEntity.transform.setPosition(0, 0.75, 0);
      const ball = ballEntity.addComponent(SphereCollider);
      ball.radius = 0.5;
      addBody(ballEntity, false, false);
      const ballRecorder = ballEntity.addComponent(ContactRecorder);
      update();

      expect(ballRecorder.enterCount).toBe(1);
      expect(ballRecorder.other).toBe(ground);
      expect(ballRecorder.self).toBe(ball);
      expect(groundRecorder.other).toBe(ball);
      expect(groundRecorder.self).toBe(ground);
      // The ball is above the ground: its contact normal points up, the ground's points down
      expect(ballRecorder.normal.y).toBeGreaterThan(0.9);
      expect(groundRecorder.normal.y).toBeLessThan(-0.9);
    });

    it("routes compound child collision events to the owning Rigidbody Entity instead of the child Entity", () => {
      const groundEntity = root.createChild("ground");
      const ground = groundEntity.addComponent(BoxCollider);
      const groundRecorder = groundEntity.addComponent(ContactRecorder);

      const parent = root.createChild("compound-body");
      parent.transform.setPosition(0, 0.75, 0);
      addBody(parent, false, false);
      const parentRecorder = parent.addComponent(ContactRecorder);

      const child = parent.createChild("child-ball");
      const childCollider = child.addComponent(SphereCollider);
      childCollider.radius = 0.5;
      const childRecorder = child.addComponent(ContactRecorder);

      update();

      expect(parentRecorder.enterCount).toBe(1);
      expect(parentRecorder.other).toBe(ground);
      expect(parentRecorder.self).toBe(childCollider);
      expect(parentRecorder.normal.y).toBeGreaterThan(0.9);
      expect(childRecorder.enterCount).toBe(0);
      expect(groundRecorder.enterCount).toBe(1);
      expect(groundRecorder.other).toBe(childCollider);
      expect(groundRecorder.self).toBe(ground);
    });

    it.each([false, true])(
      "routes compound child trigger events to the owning Rigidbody Entity (childIsTrigger=%s)",
      (childIsTrigger) => {
        const zoneEntity = root.createChild("zone");
        const zone = zoneEntity.addComponent(BoxCollider);
        zone.isTrigger = !childIsTrigger;
        const zoneRecorder = zoneEntity.addComponent(TriggerRecorder);

        const parent = root.createChild("compound-trigger-body");
        addBody(parent, true);
        const parentRecorder = parent.addComponent(TriggerRecorder);

        const child = parent.createChild("child-probe");
        const childCollider = child.addComponent(SphereCollider);
        childCollider.isTrigger = childIsTrigger;
        const childRecorder = child.addComponent(TriggerRecorder);

        update(2);
        expect(parentRecorder.enters).toEqual([[zone, childCollider]]);
        expect(childRecorder.enters).toHaveLength(0);
        expect(zoneRecorder.enters).toEqual([[childCollider, zone]]);

        parent.transform.setPosition(10, 0, 0);
        update(2);
        expect(parentRecorder.exits).toEqual([[zone, childCollider]]);
        expect(childRecorder.exits).toHaveLength(0);
        expect(zoneRecorder.exits).toEqual([[childCollider, zone]]);
      }
    );

    it("routes nested Rigidbody child trigger events only to the nearest owning Rigidbody Entity", () => {
      const zone = root.createChild("zone").addComponent(BoxCollider);
      zone.isTrigger = true;

      const outer = root.createChild("outer");
      addBody(outer, true);
      const outerRecorder = outer.addComponent(TriggerRecorder);

      const inner = outer.createChild("inner");
      addBody(inner, true);
      const innerRecorder = inner.addComponent(TriggerRecorder);

      const leaf = inner.createChild("leaf");
      const leafCollider = leaf.addComponent(SphereCollider);
      const leafRecorder = leaf.addComponent(TriggerRecorder);

      update(2);
      expect(innerRecorder.enters).toEqual([[zone, leafCollider]]);
      expect(outerRecorder.enters).toHaveLength(0);
      expect(leafRecorder.enters).toHaveLength(0);
    });

    it("defers Rigidbody destruction across same-frame trigger scripts and transfers ownership after frame end", () => {
      const zoneEntity = root.createChild("zone");
      addBody(zoneEntity, true);
      const zone = zoneEntity.addComponent(BoxCollider);
      zone.isTrigger = true;

      const parent = root.createChild("parent");
      const body = addBody(parent, true);
      let firstCalls = 0;
      let secondCalls = 0;
      let childCalls = 0;
      let pendingInsideFrame = false;

      parent.addComponent(
        class extends Script {
          override onTriggerEnter(): void {
            firstCalls++;
            body.destroy();
            pendingInsideFrame = body.pendingDestroy && !body.destroyed;
          }
        }
      );
      parent.addComponent(
        class extends Script {
          override onTriggerEnter(): void {
            secondCalls++;
          }
        }
      );

      const child = parent.createChild("child");
      child.addComponent(SphereCollider);
      child.addComponent(
        class extends Script {
          override onTriggerEnter(): void {
            childCalls++;
          }
        }
      );

      updateFrame();
      expect(pendingInsideFrame).toBe(true);
      expect(body.destroyed).toBe(true);
      expect(firstCalls).toBe(1);
      expect(secondCalls).toBe(1);
      expect(childCalls).toBe(0);

      updateFrame();
      expect(childCalls).toBe(1);
    });

    it.each([
      { kind: "trigger", action: "disable" },
      { kind: "trigger", action: "destroy" },
      { kind: "collision", action: "disable" },
      { kind: "collision", action: "destroy" }
    ] as const)(
      "does not fall back to the child Entity on a second $kind event after the first callback performs $action",
      ({ kind, action }) => {
        for (let i = 0; i < 2; i++) {
          const target = root.createChild(`target-${i}`);
          target.transform.setPosition(i * 0.25, 0, 0);
          const targetBox = target.addComponent(BoxCollider);
          targetBox.isTrigger = kind === "trigger";
        }

        const parent = root.createChild("compound-body");
        const body = addBody(parent, false, false);
        const child = parent.createChild("child");
        child.addComponent(SphereCollider);

        let parentCalls = 0;
        let childCalls = 0;
        if (kind === "trigger") {
          parent.addComponent(
            class extends Script {
              override onTriggerEnter(): void {
                parentCalls++;
                if (action === "disable") body.enabled = false;
                else body.destroy();
              }
            }
          );
          child.addComponent(
            class extends Script {
              override onTriggerEnter(): void {
                childCalls++;
              }
            }
          );
        } else {
          parent.addComponent(
            class extends Script {
              override onCollisionEnter(): void {
                parentCalls++;
                if (action === "disable") body.enabled = false;
                else body.destroy();
              }
            }
          );
          child.addComponent(
            class extends Script {
              override onCollisionEnter(): void {
                childCalls++;
              }
            }
          );
        }

        if (action === "destroy") updateFrame();
        else update();
        expect(parentCalls).toBe(2);
        expect(childCalls).toBe(0);
        expect(body.destroyed).toBe(action === "destroy");
      }
    );

    it("emits balanced Exit/Enter when an active trigger collider is reparented across bodies", () => {
      const zoneEntity = root.createChild("zone");
      const zone = zoneEntity.addComponent(BoxCollider);
      zone.isTrigger = true;
      const zoneRecorder = zoneEntity.addComponent(TriggerRecorder);

      const entityA = root.createChild("bodyA");
      addBody(entityA, true);
      const recorderA = entityA.addComponent(TriggerRecorder);

      const entityB = root.createChild("bodyB");
      addBody(entityB, true);
      const recorderB = entityB.addComponent(TriggerRecorder);

      const child = entityA.createChild("probe");
      const childCollider = child.addComponent(SphereCollider);
      const childRecorder = child.addComponent(TriggerRecorder);

      update(2);
      expect(recorderA.enters).toEqual([[zone, childCollider]]);
      expect(zoneRecorder.enters).toEqual([[childCollider, zone]]);

      //Case (a): reparent while staying overlapping -> Exit on bodyA, Enter on bodyB
      entityB.addChild(child);
      update();
      expect(recorderA.exits).toEqual([[zone, childCollider]]);
      expect(recorderB.enters).toEqual([[zone, childCollider]]);
      expect(zoneRecorder.enters).toHaveLength(1);
      expect(zoneRecorder.exits).toHaveLength(0);

      update();
      expect(recorderB.stays.length).toBeGreaterThanOrEqual(1);

      //Case (b): reparent back to bodyA and move out in same step -> Exit on bodyB, nothing on bodyA
      recorderA.enters.length = 0;
      recorderA.exits.length = 0;
      recorderB.exits.length = 0;
      entityA.addChild(child);
      entityA.transform.setPosition(20, 0, 0);
      update(2);
      expect(recorderB.exits).toEqual([[zone, childCollider]]);
      expect(recorderA.enters).toHaveLength(0);
      expect(recorderA.exits).toHaveLength(0);
      expect(childRecorder.enters).toHaveLength(0);
      expect(childRecorder.exits).toHaveLength(0);
    });

    it("delivers buffered TriggerEnter to step-start body when onCollisionEnter disables overlapping child collider", () => {
      const zone = root.createChild("zone").addComponent(BoxCollider);
      zone.size.set(2, 2, 2);
      zone.isTrigger = true;

      const obstacle = root.createChild("obstacle");
      obstacle.transform.setPosition(10, 0, 0);
      obstacle.addComponent(BoxCollider);
      addBody(obstacle, false, false);

      const entityA = root.createChild("bodyA");
      addBody(entityA, true, false);
      const bodyBox = entityA.addComponent(BoxCollider);
      bodyBox.center.set(10, 0, 0);
      const recorderA = entityA.addComponent(TriggerRecorder);

      const child = entityA.createChild("probe");
      const probeCollider = child.addComponent(SphereCollider);
      const probeRecorder = child.addComponent(TriggerRecorder);
      let collisions = 0;
      entityA.addComponent(
        class extends Script {
          override onCollisionEnter(): void {
            collisions++;
            probeCollider.enabled = false;
          }
        }
      );

      update(1);
      expect(collisions).toBe(1);
      expect(recorderA.enters).toEqual([[zone, probeCollider]]);
      expect(probeRecorder.enters).toHaveLength(0);
      expect(probeRecorder.exits).toHaveLength(0);
    });

    it.each([false, true])(
      "keeps step-start trigger ownership when onCollisionEnter reparents child to distant body (query=%s)",
      (runQuery) => {
        const zone = root.createChild("zone").addComponent(BoxCollider);
        zone.size.set(2, 2, 2);
        zone.isTrigger = true;

        const obstacle = root.createChild("obstacle");
        obstacle.transform.setPosition(10, 0, 0);
        obstacle.addComponent(BoxCollider);
        addBody(obstacle, false, false);

        const entityA = root.createChild("bodyA");
        addBody(entityA, true, false);
        entityA.addComponent(BoxCollider).center.set(10, 0, 0);
        const recorderA = entityA.addComponent(TriggerRecorder);

        const entityB = root.createChild("bodyB");
        entityB.transform.setPosition(50, 0, 0);
        addBody(entityB, true, false);
        const recorderB = entityB.addComponent(TriggerRecorder);

        const child = entityA.createChild("probe");
        const probeCollider = child.addComponent(SphereCollider);
        const probeRecorder = child.addComponent(TriggerRecorder);
        let collisions = 0;
        entityA.addComponent(
          class extends Script {
            override onCollisionEnter(): void {
              collisions++;
              entityB.addChild(child);
              if (runQuery) {
                physics.overlapSphereAll(new Vector3(50, 1000, 0), 0.5);
              }
            }
          }
        );

        update(1);
        expect(collisions).toBe(1);
        expect(recorderA.enters).toEqual([[zone, probeCollider]]);
        expect(recorderB.enters).toHaveLength(0);
        expect(probeRecorder.enters).toHaveLength(0);

        update(1);
        expect(recorderA.exits).toEqual([[zone, probeCollider]]);
        expect(recorderB.enters).toHaveLength(0);
        expect(recorderB.stays).toHaveLength(0);
        expect(recorderB.exits).toHaveLength(0);
        expect(probeRecorder.exits).toHaveLength(0);
      }
    );

    it("prevents orphaned Exit on child when owning Rigidbody is destroyed after separating", () => {
      const zone = root.createChild("zone").addComponent(BoxCollider);
      zone.isTrigger = true;

      const entityA = root.createChild("bodyA");
      const bodyA = addBody(entityA, true);
      const recorderA = entityA.addComponent(TriggerRecorder);

      const child = entityA.createChild("probe");
      const childCollider = child.addComponent(SphereCollider);
      const childRecorder = child.addComponent(TriggerRecorder);

      update(2);
      expect(recorderA.enters).toEqual([[zone, childCollider]]);

      entityA.transform.setPosition(20, 0, 0);
      bodyA.destroy();
      update(2);
      expect(childRecorder.exits).toHaveLength(0);
      expect(recorderA.exits).toHaveLength(0);
    });

    it("handles destroying the destination Rigidbody inside Exit before next-step static fallback", () => {
      const zoneEntity = root.createChild("zone");
      const zone = zoneEntity.addComponent(BoxCollider);
      zone.isTrigger = true;
      // Keep zone kinematic so the child remains overlapping with a dynamic/kinematic body after bodyB is destroyed.
      addBody(zoneEntity, true);

      const entityA = root.createChild("bodyA");
      addBody(entityA, true);
      const entityB = root.createChild("bodyB");
      const bodyB = addBody(entityB, true);
      const recorderB = entityB.addComponent(TriggerRecorder);

      let aExits = 0;
      entityA.addComponent(
        class extends Script {
          override onTriggerExit(): void {
            aExits++;
            bodyB.destroy();
          }
        }
      );

      const child = entityA.createChild("probe");
      const childCollider = child.addComponent(SphereCollider);
      const childRecorder = child.addComponent(TriggerRecorder);

      updateFrame(2);
      entityB.addChild(child);
      updateFrame();
      expect(aExits).toBe(1);
      expect(bodyB.destroyed).toBe(true);
      expect(recorderB.enters).toHaveLength(1);
      expect(childRecorder.enters).toHaveLength(0);

      // On the next frame while still overlapping, destroyed bodyB is skipped for Exit and the static collider enters cleanly
      updateFrame();
      expect(aExits).toBe(1);
      expect(recorderB.exits).toHaveLength(0);
      expect(childRecorder.enters).toEqual([[zone, childCollider]]);
    });

    it("routes compound Stay/Exit, nested Rigidbody contacts, and inner-body destroy transfer", () => {
      const groundEntity = root.createChild("ground");
      const ground = groundEntity.addComponent(BoxCollider);

      const outerEntity = root.createChild("outer");
      outerEntity.transform.setPosition(0, 0.75, 0);
      addBody(outerEntity, false, false);
      let outerEnter = 0;
      let outerStay = 0;
      let outerExit = 0;
      outerEntity.addComponent(
        class extends Script {
          override onCollisionEnter(): void {
            outerEnter++;
          }
          override onCollisionStay(): void {
            outerStay++;
          }
          override onCollisionExit(): void {
            outerExit++;
          }
        }
      );

      const innerEntity = outerEntity.createChild("inner");
      const inner = addBody(innerEntity, false, false);
      let innerEnter = 0;
      let innerStay = 0;
      let innerExit = 0;
      innerEntity.addComponent(
        class extends Script {
          override onCollisionEnter(): void {
            innerEnter++;
          }
          override onCollisionStay(): void {
            innerStay++;
          }
          override onCollisionExit(): void {
            innerExit++;
          }
        }
      );

      const leaf = innerEntity.createChild("leaf");
      const leafCollider = leaf.addComponent(SphereCollider);
      leafCollider.radius = 0.5;
      const leafRecorder = leaf.addComponent(ContactRecorder);

      update();
      expect(innerEnter).toBe(1);
      expect(outerEnter).toBe(0);
      expect(leafRecorder.enterCount).toBe(0);

      update();
      expect(innerStay).toBe(1);
      expect(outerStay).toBe(0);

      // Destroying inner Rigidbody transfers leaf ownership to outer Rigidbody and fires inner Exit -> outer Enter
      inner.destroy();
      expect(leafCollider.attachedRigidbody).toBe(outerEntity.getComponent(Rigidbody));
      update();
      expect(outerEnter).toBe(1);
      expect(leafRecorder.enterCount).toBe(0);

      outerEntity.transform.setPosition(0, 10, 0);
      update();
      expect(outerExit).toBe(1);
      expect(leafRecorder.exitCount).toBe(0);
      expect(innerExit).toBe(0);
    });

    it("defers Rigidbody destruction across same-frame collision scripts and completes at frame end", () => {
      root.createChild("ground").addComponent(BoxCollider);
      const parent = root.createChild("parent");
      parent.transform.setPosition(0, 0.75, 0);
      const body = addBody(parent, false, false);
      let firstCalls = 0;
      let secondCalls = 0;
      let childCalls = 0;
      let pendingInsideFrame = false;

      parent.addComponent(
        class extends Script {
          override onCollisionEnter(): void {
            firstCalls++;
            body.destroy();
            pendingInsideFrame = body.pendingDestroy && !body.destroyed;
          }
        }
      );
      parent.addComponent(
        class extends Script {
          override onCollisionEnter(): void {
            secondCalls++;
          }
        }
      );

      const child = parent.createChild("child");
      child.addComponent(SphereCollider).radius = 0.5;
      child.addComponent(
        class extends Script {
          override onCollisionEnter(): void {
            childCalls++;
          }
        }
      );

      updateFrame();
      expect(pendingInsideFrame).toBe(true);
      expect(body.destroyed).toBe(true);
      expect(firstCalls).toBe(1);
      expect(secondCalls).toBe(1);
      expect(childCalls).toBe(0);
    });
  });

  describe("material", () => {
    it("keeps shared material references when cloned", () => {
      const entity = root.createChild("box");
      const box = entity.addComponent(BoxCollider);
      const shared = new PhysicsMaterial(engine);
      box.material = shared;
      const clone = entity.clone();
      root.addChild(clone);
      expect(clone.getComponent(BoxCollider).material).toBe(shared);
    });
  });

  it("warns once about sheared world transforms, which physics cannot represent", () => {
    Logger.enable();
    const warnings = vi.spyOn(Logger, "warn").mockImplementation(() => {});
    try {
      const parent = root.createChild("parent");
      parent.transform.setScale(2, 1, 3);
      const child = parent.createChild("child");
      child.transform.setRotation(15, -25, 35);
      child.addComponent(BoxCollider);
      update(2);
      expect(warnings).toHaveBeenCalledTimes(1);
      expect(String(warnings.mock.calls[0][0])).toMatch(/sheared/);

      warnings.mockClear();
      const uniform = root.createChild("uniform");
      uniform.transform.setScale(2, 2, 2);
      const rotated = uniform.createChild("rotated");
      rotated.transform.setRotation(15, -25, 35);
      rotated.addComponent(BoxCollider);
      update();
      expect(warnings).not.toHaveBeenCalled();
    } finally {
      warnings.mockRestore();
      Logger.disable();
    }
  });

  it("preserves world scale on _poseOnlyDirty fast path for PlaneCollider and non-uniformly scaled SphereCollider", () => {
    const planeBodyEntity = root.createChild("scaled-plane-body");
    const planeBody = planeBodyEntity.addComponent(Rigidbody);
    planeBody.isKinematic = true;
    const planeChild = planeBodyEntity.createChild("scaled-plane");
    planeChild.transform.setScale(1, 3, 1);
    const plane = planeChild.addComponent(PlaneCollider);
    plane.center.set(0, 2, 0);
    plane.collisionLayer = Layer.Layer6;

    const hit = new HitResult();
    update();
    expect(physics.raycast(new Ray(new Vector3(0, 1010, 0), new Vector3(0, -1, 0)), 20, Layer.Layer6, hit)).toBe(true);
    expect(hit.collider).toBe(plane);
    expect(hit.point.y).toBeCloseTo(1006, 2);

    // Trigger _poseOnlyDirty without marking WorldScale dirty.
    planeChild.transform.setPosition(1, 0, 0);
    update();
    expect(physics.raycast(new Ray(new Vector3(1, 1010, 0), new Vector3(0, -1, 0)), 20, Layer.Layer6, hit)).toBe(true);
    expect(hit.collider).toBe(plane);
    expect(hit.point.y).toBeCloseTo(1006, 2);

    planeBodyEntity.destroy();

    const sphereBodyEntity = root.createChild("scaled-sphere-body");
    const sphereBody = sphereBodyEntity.addComponent(Rigidbody);
    sphereBody.isKinematic = true;
    const sphereChild = sphereBodyEntity.createChild("scaled-sphere");
    const sphere = sphereChild.addComponent(SphereCollider);
    sphere.radius = 0.5;
    sphere.center.set(0, 10, 0);
    sphere.collisionLayer = Layer.Layer6;

    // First sync at (1, 1, 1) so _nativeScale is committed as (1, 1, 1).
    update();
    // Shrink Y/Z while keeping max scale 1 so SphereCollider skips _syncGeometry and keeps _nativeScale = (1, 1, 1).
    sphereChild.transform.setScale(1, 0.2, 0.2);
    update();
    expect(physics.raycast(new Ray(new Vector3(0, 1004, 0), new Vector3(0, -1, 0)), 3, Layer.Layer6, hit)).toBe(true);
    expect(hit.collider).toBe(sphere);
    expect(hit.point.y).toBeCloseTo(1002.5, 2);

    // Trigger _poseOnlyDirty without marking WorldScale dirty; center * (1, 0.2, 0.2) must stay at y=1002.
    sphereChild.transform.setPosition(2, 0, 0);
    update();
    expect(physics.raycast(new Ray(new Vector3(2, 1011, 0), new Vector3(0, -1, 0)), 3, Layer.Layer6, hit)).toBe(false);
    expect(physics.raycast(new Ray(new Vector3(2, 1004, 0), new Vector3(0, -1, 0)), 3, Layer.Layer6, hit)).toBe(true);
    expect(hit.collider).toBe(sphere);
    expect(hit.point.y).toBeCloseTo(1002.5, 2);
  });

  it("keeps trigger Enter/Exit balanced when a collider's owning Rigidbody is destroyed during Enter", () => {
    const createZone = (parent: Entity, onEnter: (other: Collider) => void) => {
      const zoneEntity = parent.createChild("zone");
      const zoneBody = zoneEntity.addComponent(Rigidbody);
      zoneBody.isKinematic = true;
      const zone = zoneEntity.addComponent(BoxCollider);
      zone.size.set(4, 4, 4);
      zone.isTrigger = true;
      zoneEntity.addComponent(
        class extends Script {
          override onTriggerEnter(other: Collider): void {
            onEnter(other);
          }
        }
      );
      return { zoneEntity, zone };
    };

    const createLog = (entity: Entity) => {
      const events: string[] = [];
      entity.addComponent(
        class extends Script {
          override onTriggerEnter(): void {
            events.push("enter");
          }
          override onTriggerStay(): void {
            events.push("stay");
          }
          override onTriggerExit(): void {
            events.push("exit");
          }
        }
      );
      return events;
    };

    // Case 1: zone runs first (cur0) and marks target's same-entity Rigidbody for deferred destruction during Enter.
    const case1 = root.createChild("enter-before-target");
    createZone(case1, () => {
      if (!targetBody1.pendingDestroy) targetBody1.destroy();
    });
    const target1 = case1.createChild("target1");
    const targetBody1 = target1.addComponent(Rigidbody);
    targetBody1.isKinematic = true;
    target1.addComponent(BoxCollider);
    const log1 = createLog(target1);

    updateFrame();
    expect(targetBody1.destroyed).toBe(true);
    expect(log1).toEqual(["enter"]);
    updateFrame();
    expect(log1).toEqual(["enter", "stay"]);
    case1.destroy();

    // Case 2: target runs first (cur0) and gets Enter, then zone destroys target's same-entity Rigidbody; separating still emits Exit.
    const case2 = root.createChild("target-before-zone");
    const target2 = case2.createChild("target2");
    const targetBody2 = target2.addComponent(Rigidbody);
    targetBody2.isKinematic = true;
    target2.addComponent(BoxCollider);
    const log2 = createLog(target2);
    const { zoneEntity: zone2 } = createZone(case2, () => {
      if (!targetBody2.pendingDestroy) targetBody2.destroy();
    });

    updateFrame();
    expect(targetBody2.destroyed).toBe(true);
    expect(log2).toEqual(["enter"]);
    zone2.transform.setPosition(20, 0, 0);
    updateFrame();
    expect(log2).toEqual(["enter", "exit"]);
    case2.destroy();

    // Case 3: zoneA destroys target's shared Rigidbody during Enter in a two-zone overlap; pairs stay balanced across frames.
    const case3 = root.createChild("multi-trigger-same-step");
    createZone(case3, () => {
      if (!targetBody3.pendingDestroy) targetBody3.destroy();
    });
    createZone(case3, () => {});
    const target3 = case3.createChild("target3");
    const targetBody3 = target3.addComponent(Rigidbody);
    targetBody3.isKinematic = true;
    target3.addComponent(BoxCollider);
    const log3 = createLog(target3);

    updateFrame();
    expect(targetBody3.destroyed).toBe(true);
    expect(log3).toEqual(["enter", "enter"]);
    updateFrame();
    expect(log3).toEqual(["enter", "enter", "stay", "stay"]);
    case3.destroy();

    // Case 4 & 5: single-pair Exit and multi-pair same-step Exit where zone destroys target's same-entity Rigidbody in Exit.
    const createExitZone = (parent: Entity, onExit: () => void) => {
      const zoneEntity = parent.createChild("exit-zone");
      const zoneBody = zoneEntity.addComponent(Rigidbody);
      zoneBody.isKinematic = true;
      const zone = zoneEntity.addComponent(BoxCollider);
      zone.size.set(4, 4, 4);
      zone.isTrigger = true;
      zoneEntity.addComponent(
        class extends Script {
          override onTriggerExit(): void {
            onExit();
          }
        }
      );
      return zoneEntity;
    };

    const case4 = root.createChild("exit-side0-destroy");
    const zone4 = createExitZone(case4, () => {
      if (!targetBody4.pendingDestroy) targetBody4.destroy();
    });
    const target4 = case4.createChild("target4");
    const targetBody4 = target4.addComponent(Rigidbody);
    targetBody4.isKinematic = true;
    target4.addComponent(BoxCollider);
    const log4 = createLog(target4);

    updateFrame();
    expect(log4).toEqual(["enter"]);
    zone4.transform.setPosition(20, 0, 0);
    updateFrame();
    expect(targetBody4.destroyed).toBe(true);
    expect(log4).toEqual(["enter", "exit"]);
    case4.destroy();

    const case5 = root.createChild("exit-multi-pair-same-step");
    const zone5a = createExitZone(case5, () => {
      if (!targetBody5.pendingDestroy) targetBody5.destroy();
    });
    const zone5b = createExitZone(case5, () => {});
    const target5 = case5.createChild("target5");
    const targetBody5 = target5.addComponent(Rigidbody);
    targetBody5.isKinematic = true;
    target5.addComponent(BoxCollider);
    const log5 = createLog(target5);

    updateFrame();
    expect(log5).toEqual(["enter", "enter"]);
    zone5a.transform.setPosition(20, 0, 0);
    zone5b.transform.setPosition(20, 0, 0);
    updateFrame();
    expect(targetBody5.destroyed).toBe(true);
    expect(log5).toEqual(["enter", "enter", "exit", "exit"]);
    case5.destroy();
  });
});
