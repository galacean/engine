import { WebGLEngine } from "@galacean/engine";
import {
  BoxCollider,
  CharacterController,
  Collider,
  Collision,
  ContactPoint,
  Entity,
  Layer,
  Logger,
  MeshCollider,
  PhysicsMaterial,
  PhysicsScene,
  PrimitiveMesh,
  Rigidbody,
  Scene,
  Script,
  SphereCollider,
  Transform
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
    it("follow the Entity's world position, rotation and scale, including center and local rotation", () => {
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

      box.rotation = new Vector3(0, 90, 0);
      expect(hits(13.9, 1000, -2)).toEqual([]);
      expect(hits(10, 1000, 1.9)).toEqual(names([box]));

      parent.transform.setPosition(-10, 0, 0);
      expect(hits(-10, 1000, 1.9)).toEqual(names([box]));
      expect(hits(10, 1000, 1.9)).toEqual([]);
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
    it.each([
      { name: "BoxCollider", type: BoxCollider },
      { name: "CharacterController", type: CharacterController },
      { name: "Rigidbody", type: Rigidbody }
    ])("honors deactivation while reading $name world pose", ({ type }) => {
      let armed = false;
      class DisablingTransform extends Transform {
        override get worldPosition(): Vector3 {
          if (armed) {
            armed = false;
            component.enabled = false;
          }
          return super.worldPosition;
        }
      }
      const entity = new Entity(engine, "disables during pose read", DisablingTransform);
      if (type === Rigidbody) entity.addComponent(BoxCollider);
      const component = entity.addComponent(type);
      armed = true;
      root.addChild(entity);

      const ray = new Ray(new Vector3(0, 1004, 0), new Vector3(0, -1, 0));
      expect(physics.raycast(ray, 8)).toBe(false);
      expect(component.enabled).toBe(false);
      component.enabled = true;
      expect(physics.raycast(ray, 8)).toBe(true);
    });

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
      const createStatic = vi.spyOn(backend, "createStaticCollider");

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

    it("stops dispatching remaining scripts on the Rigidbody Entity when the first callback destroys the Rigidbody", () => {
      const zone = root.createChild("zone").addComponent(BoxCollider);
      zone.isTrigger = true;

      const parent = root.createChild("parent");
      const body = addBody(parent, true);
      let firstCalls = 0;
      let secondCalls = 0;
      let childCalls = 0;

      parent.addComponent(
        class extends Script {
          override onTriggerEnter(): void {
            firstCalls++;
            body.destroy();
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

      update();
      expect(firstCalls).toBe(1);
      expect(secondCalls).toBe(0);
      expect(childCalls).toBe(0);
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

        update();
        expect(parentCalls).toBe(action === "destroy" ? 1 : 2);
        expect(childCalls).toBe(0);
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

      update(2);
      entityB.addChild(child);
      update();
      expect(aExits).toBe(1);
      expect(recorderB.enters).toHaveLength(0);
      expect(childRecorder.enters).toHaveLength(0);

      // On the next step while still overlapping, the now-static collider receives Enter cleanly (not Stay)
      update();
      expect(aExits).toBe(1);
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

    it("stops dispatching remaining collision scripts on the Rigidbody Entity when the first destroys the Rigidbody", () => {
      root.createChild("ground").addComponent(BoxCollider);
      const parent = root.createChild("parent");
      parent.transform.setPosition(0, 0.75, 0);
      const body = addBody(parent, false, false);
      let firstCalls = 0;
      let secondCalls = 0;
      let childCalls = 0;

      parent.addComponent(
        class extends Script {
          override onCollisionEnter(): void {
            firstCalls++;
            body.destroy();
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

      update();
      expect(firstCalls).toBe(1);
      expect(secondCalls).toBe(0);
      expect(childCalls).toBe(0);
    });
  });

  describe("material", () => {
    it("instantiates once from the Collider's own engine and reuses the instance", () => {
      const box = root.createChild("box").addComponent(BoxCollider);
      const shared = new PhysicsMaterial(engine);
      shared.bounciness = 0.5;
      box.material = shared;

      const instance = box.getInstanceMaterial();
      expect(instance).not.toBe(shared);
      expect(instance.bounciness).toBe(0.5);
      expect(box.getInstanceMaterial()).toBe(instance);
      expect(box.material).toBe(instance);
    });

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
});
