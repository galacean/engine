import { AssetType, type PrefabResource, WebGLEngine } from "@galacean/engine";
import {
  AssetPromise,
  BoxCollider,
  CapsuleCollider,
  CharacterController,
  Collision,
  ControllerCollisionFlag,
  ControllerNonWalkableMode,
  Entity,
  FixedJoint,
  HitResult,
  HingeJoint,
  JointLimits,
  JointMotor,
  Loader,
  type LoadItem,
  MeshCollider,
  MeshColliderCookingFlag,
  MeshTopology,
  ModelMesh,
  PhysicsScene,
  PlaneCollider,
  PrimitiveMesh,
  Rigidbody,
  RigidbodyConstraints,
  Scene,
  Script,
  SphereCollider,
  SpringJoint,
  resourceLoader
} from "@galacean/engine-core";
import { Quaternion, Ray, Vector3 } from "@galacean/engine-math";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrefabFile } from "../../../../packages/loader/src/schema/PrefabSchema";
import type { SceneFile } from "../../../../packages/loader/src/schema/SceneSchema";
import { createPhysics } from "../../utils/physics";

const meshFixtures = new Map<string, ModelMesh>();
const meshType = "PhysicsGameplayMesh";

@resourceLoader(meshType, [])
class PhysicsGameplayMeshLoader extends Loader<ModelMesh> {
  override load(item: LoadItem): AssetPromise<ModelMesh> {
    return AssetPromise.resolve(meshFixtures.get(item.url!)!);
  }
}

Loader.registerClass("Rigidbody", Rigidbody);
Loader.registerClass("BoxCollider", BoxCollider);
Loader.registerClass("MeshCollider", MeshCollider);
Loader.registerClass("FixedJoint", FixedJoint);
Loader.registerClass("HingeJoint", HingeJoint);
Loader.registerClass("JointLimits", JointLimits);
Loader.registerClass("JointMotor", JointMotor);

describe("Physics gameplay integration", () => {
  let engine: WebGLEngine;
  let scene: Scene;
  let physics: PhysicsScene;
  let root: Entity;
  const urls: string[] = [];

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: createPhysics() });
    scene = engine.sceneManager.activeScene;
    physics = scene.physics;
  });

  beforeEach(() => {
    root = scene.createRootEntity("gameplay");
    physics.gravity.set(0, -9.81, 0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    root.destroy();
    for (const url of urls) URL.revokeObjectURL(url);
    urls.length = 0;
    meshFixtures.clear();
    engine.resourceManager.gc();
  });

  afterAll(() => engine.destroy());

  function createJSONUrl(data: PrefabFile | SceneFile): string {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
    urls.push(url);
    return url;
  }

  function loadPrefab(virtualPath: string, data: PrefabFile): AssetPromise<PrefabResource> {
    const resources = engine.resourceManager;
    resources.registerVirtualResources([{ virtualPath, path: createJSONUrl(data), type: AssetType.Prefab }]);
    return resources.load<PrefabResource>(virtualPath);
  }

  function registerMesh(path: string, mesh: ModelMesh): void {
    meshFixtures.set(path, mesh);
    engine.resourceManager.registerVirtualResources([{ virtualPath: path, path, type: meshType }]);
  }

  function step(count = 1): void {
    for (let i = 0; i < count; i++) {
      physics._update(physics.fixedTimeStep);
    }
  }

  function addStaticBox(name: string, pos: Vector3, size: Vector3, rotZ = 0, friction = 0.05): BoxCollider {
    const entity = root.createChild(name);
    entity.transform.position = pos;
    entity.transform.setRotation(0, 0, rotZ);
    const col = entity.addComponent(BoxCollider);
    col.size = size;
    const mtl = col.getInstanceMaterial();
    mtl.dynamicFriction = friction;
    mtl.staticFriction = friction;
    return col;
  }

  it("loads a complete hinge axis from a runtime Prefab call", async () => {
    const prefab = await loadPrefab("hinge-axis.prefab", {
      version: "2.0",
      refs: [],
      entities: [{ name: "hinge", components: [0, 1] }],
      components: [
        { type: "Rigidbody" },
        { type: "HingeJoint", calls: [{ method: "_setAxis", args: [{ x: 0, y: 2, z: 0 }] }] }
      ],
      root: 0
    });
    const entity = prefab.instantiate();
    root.addChild(entity);
    expect(entity.getComponent(HingeJoint)!.axis).toMatchObject({ x: 0, y: 1, z: 0 });
  });

  it("preserves a script-built joint's calculated anchor when switched to manual before entering a scene", () => {
    const entity = engine.createEntity("detached joint");
    entity.transform.setPosition(10, 0, 0);
    entity.addComponent(BoxCollider);
    const joint = entity.addComponent(FixedJoint);
    entity.getComponent(Rigidbody)!.useGravity = false;
    joint.anchor.set(2, 0, 0);
    joint.automaticConnectedAnchor = false;

    const connectedX = joint.connectedAnchor.x;
    root.addChild(entity);
    step();
    expect(connectedX).toBe(12);
    expect(entity.transform.worldPosition.x).toBeCloseTo(10, 5);
  });

  it.each([true, false])(
    "preserves partial manual anchors in a nested Prefab (anchor first=%s)",
    async (anchorFirst) => {
      const basePath = `joint-base-${anchorFirst}.prefab`;
      await loadPrefab(basePath, {
        version: "2.0",
        refs: [],
        entities: [
          { name: "base", children: [1] },
          { name: "joint child", position: [10, 0, 0], components: [0] }
        ],
        components: [{ type: "FixedJoint", props: { automaticConnectedAnchor: true } }],
        root: 0
      });

      const anchor = { x: 1, y: 2, z: 3 };
      const connectedAnchor = { y: 8 };
      const props = anchorFirst
        ? { anchor, connectedAnchor, automaticConnectedAnchor: false }
        : { automaticConnectedAnchor: false, connectedAnchor, anchor };
      const prefab = await loadPrefab(`joint-override-${anchorFirst}.prefab`, {
        version: "2.0",
        refs: [{ url: basePath }],
        entities: [
          {
            instance: {
              asset: 0,
              overrides: { componentProps: [{ path: [0], selector: { type: "FixedJoint", index: 0 }, props }] }
            }
          }
        ],
        components: [],
        root: 0
      });

      const instance = prefab.instantiate();
      root.addChild(instance);
      const joint = instance.children[0].getComponent(FixedJoint)!;
      expect(joint.anchor).toMatchObject(anchor);
      expect(joint.connectedAnchor).toMatchObject({ x: 0, y: 8, z: 0 });
      expect(joint.automaticConnectedAnchor).toBe(false);
    }
  );

  it.each([true, false])(
    "preserves partial manual anchors on entities added by a Scene override (anchor first=%s)",
    async (anchorFirst) => {
      const basePath = `joint-scene-base-${anchorFirst}.prefab`;
      await loadPrefab(basePath, {
        version: "2.0",
        refs: [],
        entities: [{ name: "base" }],
        components: [],
        root: 0
      });

      const anchor = { x: 1, y: 2, z: 3 };
      const connectedAnchor = { y: 8 };
      const props = anchorFirst
        ? { anchor, connectedAnchor, automaticConnectedAnchor: false }
        : { automaticConnectedAnchor: false, connectedAnchor, anchor };
      const url = createJSONUrl({
        version: "2.0",
        refs: [{ url: basePath }],
        entities: [
          { instance: { asset: 0, overrides: { addedEntities: [{ parent: [], entity: 1 }] } } },
          { name: "joint child", position: [10, 0, 0], components: [0] }
        ],
        components: [{ type: "FixedJoint", props }],
        scene: { rootEntities: [0], background: { mode: 0, color: [0, 0, 0, 1] } }
      });
      const loadedScene = await engine.resourceManager.load<Scene>({ url, type: AssetType.Scene });
      try {
        const joint = loadedScene.rootEntities[0].children[0].getComponent(FixedJoint)!;
        expect(joint.connectedAnchor).toMatchObject({ x: 0, y: 8, z: 0 });
        expect(joint.automaticConnectedAnchor).toBe(false);
      } finally {
        loadedScene.destroy();
      }
    }
  );

  it("simulates a compound cart rolling down a ramp into a capsule blocker and compares rotation constraints", () => {
    root.createChild("ground").addComponent(PlaneCollider);

    // Ramp leading toward a capsule blocker at the base
    addStaticBox("left-ramp", new Vector3(-4, 1.3, 0), new Vector3(8, 0.25, 3.2), -20, 0.02);

    // Compound cart: Rigidbody on parent, child Box + Sphere wheels + Capsule bumper
    const cart = root.createChild("compound-cart");
    cart.transform.setPosition(-6.5, 3.0, 0);
    const cartRb = cart.addComponent(Rigidbody);
    cartRb.mass = 4;

    const chassis = cart.createChild("chassis");
    chassis.transform.setPosition(0, 0.25, 0);
    chassis.addComponent(BoxCollider).size = new Vector3(1.4, 0.45, 1.0);

    const addWheel = (name: string, x: number): SphereCollider => {
      const wheel = cart.createChild(name);
      wheel.transform.setPosition(x, -0.15, 0);
      const sc = wheel.addComponent(SphereCollider);
      sc.radius = 0.35;
      const mtl = sc.getInstanceMaterial();
      mtl.dynamicFriction = 0.02;
      mtl.staticFriction = 0.02;
      return sc;
    };
    const wheels = [addWheel("front-wheel", 0.55), addWheel("rear-wheel", -0.55)];

    const bumper = cart.createChild("bumper");
    bumper.transform.setPosition(0.85, 0.15, 0);
    bumper.transform.setRotation(90, 0, 0);
    const bumperCol = bumper.addComponent(CapsuleCollider);
    bumperCol.radius = 0.16;
    bumperCol.height = 0.92;

    // Static capsule obstacle placed directly in the cart's path at the bottom of the ramp
    const blocker = root.createChild("capsule-blocker");
    blocker.transform.setPosition(0.8, 0.45, 0);
    blocker.transform.setRotation(90, 0, 0);
    const blockerCol = blocker.addComponent(CapsuleCollider);
    blockerCol.radius = 0.4;
    blockerCol.height = 2.8;

    let hitBlocker = false;
    let cartHitBlocker = false;
    cart.addComponent(
      class extends Script {
        override onCollisionEnter(collision: Collision): void {
          if (collision.collider === blockerCol && collision.selfCollider.attachedRigidbody === cartRb) {
            cartHitBlocker = true;
          }
        }
      }
    );
    blocker.addComponent(
      class extends Script {
        override onCollisionEnter(collision: Collision): void {
          if (collision.collider.attachedRigidbody === cartRb) {
            hitBlocker = true;
          }
        }
      }
    );

    // Parallel ramp comparing free rotation vs FreezeRotation
    addStaticBox("right-ramp", new Vector3(6.5, 1.4, -1.0), new Vector3(7, 0.25, 4.4), -24, 0.05);
    const makeSlider = (name: string, z: number, freezeRot: boolean): Entity => {
      const entity = root.createChild(name);
      entity.transform.setPosition(4.2, 3.2, z);
      const col = entity.addComponent(BoxCollider);
      col.size = new Vector3(0.8, 0.8, 0.8);
      const mtl = col.getInstanceMaterial();
      mtl.dynamicFriction = 0.05;
      mtl.staticFriction = 0.05;
      const rb = entity.addComponent(Rigidbody);
      if (freezeRot) {
        rb.constraints =
          RigidbodyConstraints.FreezeRotationX |
          RigidbodyConstraints.FreezeRotationY |
          RigidbodyConstraints.FreezeRotationZ;
      }
      return entity;
    };
    const freeBox = makeSlider("free-box", -2.0, false);
    const frozenBox = makeSlider("frozen-rot-box", 0.0, true);

    step(150);

    // Cart rolled down the ramp, physically collided with the capsule blocker, and stayed stopped by it
    expect(cart.transform.worldPosition.x).toBeGreaterThan(-4);
    expect(cart.transform.worldPosition.x).toBeLessThan(1.5);
    expect(cart.transform.worldPosition.y).toBeGreaterThan(0.1);
    expect(hitBlocker).toBe(true);
    expect(cartHitBlocker).toBe(true);
    expect(wheels.every((w) => w.attachedRigidbody === cartRb)).toBe(true);
    expect(wheels.every((w) => physics.overlapSphereAll(w.entity.transform.worldPosition, 0.05).includes(w))).toBe(
      true
    );

    // Rotation constraints froze rotation while still allowing translation
    expect(frozenBox.transform.worldPosition.x).toBeGreaterThan(5);
    expect(frozenBox.transform.rotation.length()).toBeLessThan(1);
    expect(freeBox.transform.rotation.length()).toBeGreaterThan(5);
  });

  it("navigates character controllers across stairs, barriers, walkable slopes, and ForceSliding steep slopes", () => {
    root.createChild("floor").addComponent(PlaneCollider);

    // Track 1 (z = -3): Stairs + CharacterController (stepOffset = 0.55)
    addStaticBox("stair-1", new Vector3(-2.0, 0.175, -3), new Vector3(1.5, 0.35, 1.8), 0, 0.6);
    addStaticBox("stair-2", new Vector3(-0.5, 0.35, -3), new Vector3(1.5, 0.7, 1.8), 0, 0.6);
    addStaticBox("stair-3", new Vector3(2.25, 0.525, -3), new Vector3(4.0, 1.05, 1.8), 0, 0.6);
    const stairRole = root.createChild("cc-stairs");
    stairRole.transform.setPosition(-5.0, 0.75, -3);
    const stairCC = stairRole.addComponent(CharacterController);
    stairCC.radius = 0.35;
    stairCC.height = 1.4;
    stairCC.stepOffset = 0.55;

    // Track 2 (z = 0): Tall barrier blocked by low stepOffset = 0.08
    addStaticBox("barrier", new Vector3(-1.0, 0.25, 0), new Vector3(1.2, 0.5, 1.8), 0, 0.6);
    const blockedRole = root.createChild("cc-blocked");
    blockedRole.transform.setPosition(-5.0, 0.75, 0);
    const blockedCC = blockedRole.addComponent(CharacterController);
    blockedCC.radius = 0.35;
    blockedCC.height = 1.4;
    blockedCC.stepOffset = 0.08;

    // Track 3 (z = 3): Walkable 35 deg ramp (slopeLimit = 45)
    addStaticBox("ramp-35", new Vector3(0.2, 1.9, 3), new Vector3(7.0, 0.3, 1.8), 35, 0.6);
    const climbRole = root.createChild("cc-slope-ok");
    climbRole.transform.setPosition(-4.8, 0.75, 3);
    const climbCC = climbRole.addComponent(CharacterController);
    climbCC.radius = 0.35;
    climbCC.height = 1.4;
    climbCC.slopeLimit = 45;
    climbCC.stepOffset = 0.35;

    // Tracks 4 & 5 (z = 6 and z = 9): Unwalkable 60 deg ramps directly comparing PreventClimbing vs ForceSliding
    const addSteepTrack = (z: number, mode: ControllerNonWalkableMode) => {
      addStaticBox(`ramp-60-${z}`, new Vector3(0, 2.0, z), new Vector3(6.0, 0.3, 1.8), 60, 0.6);
      const role = root.createChild(`cc-steep-${z}`);
      // Start directly above the mid-slope so both land squarely on the 60 deg incline
      role.transform.setPosition(0, 3.2, z);
      const cc = role.addComponent(CharacterController);
      cc.radius = 0.35;
      cc.height = 1.4;
      cc.slopeLimit = 45;
      cc.stepOffset = 0.1;
      cc.nonWalkableMode = mode;
      return { role, cc };
    };
    const prevent = addSteepTrack(6, ControllerNonWalkableMode.PreventClimbing);
    const slide = addSteepTrack(9, ControllerNonWalkableMode.PreventClimbingAndForceSliding);

    const walkDisp = new Vector3(0.045, -0.15, 0);
    const slopeDisp = new Vector3(0.02, -0.08, 0);
    let hitBarrier = false;
    for (let i = 0; i < 160; i++) {
      stairCC.move(walkDisp, 0.0001, physics.fixedTimeStep);
      const flags = blockedCC.move(walkDisp, 0.0001, physics.fixedTimeStep);
      hitBarrier ||= (flags & ControllerCollisionFlag.Sides) !== 0;
      climbCC.move(walkDisp, 0.0001, physics.fixedTimeStep);
      prevent.cc.move(slopeDisp, 0.0001, physics.fixedTimeStep);
      slide.cc.move(slopeDisp, 0.0001, physics.fixedTimeStep);
    }

    // Track 1 climbed all 3 stairs
    expect(stairRole.transform.worldPosition.x).toBeGreaterThan(0);
    expect(stairRole.transform.worldPosition.y).toBeGreaterThan(1.3);
    // Track 2 hit and stopped at barrier
    expect(hitBarrier).toBe(true);
    expect(blockedRole.transform.worldPosition.x).toBeLessThan(-1);
    // Track 3 climbed walkable 35 deg ramp
    expect(climbRole.transform.worldPosition.y).toBeGreaterThan(1.5);
    // Tracks 4 vs 5: ForceSliding actively slid down the 60 deg incline below PreventClimbing
    expect(slide.role.transform.worldPosition.y).toBeLessThan(prevent.role.transform.worldPosition.y - 0.5);
    expect(slide.role.transform.worldPosition.x).toBeLessThan(prevent.role.transform.worldPosition.x - 0.25);
  });

  it("pushes dynamic crates with a kinematic moving platform using combined move(pos) + move(rot)", () => {
    root.createChild("floor").addComponent(PlaneCollider);

    // Kinematic pusher sweeps along +X while rotating slightly around Y in the same step
    const pusher = root.createChild("pusher");
    pusher.transform.setPosition(-2, 0.5, 0);
    pusher.addComponent(BoxCollider).size = new Vector3(1, 1, 2);
    const pusherBody = pusher.addComponent(Rigidbody);
    pusherBody.isKinematic = true;

    const crate = root.createChild("crate");
    crate.transform.setPosition(0, 0.5, 0);
    const crateCol = crate.addComponent(BoxCollider);
    crateCol.size = new Vector3(1, 1, 1);
    crateCol.getInstanceMaterial().dynamicFriction = 0.05;
    crateCol.getInstanceMaterial().staticFriction = 0.05;
    crate.addComponent(Rigidbody);

    const rot = new Quaternion();
    for (let i = 1; i <= 40; i++) {
      const targetX = -2 + i * 0.1;
      Quaternion.rotationYawPitchRoll((i / 40) * 0.3, 0, 0, rot);
      pusherBody.move(new Vector3(targetX, 0.5, 0));
      pusherBody.move(rot);
      step(1);
    }

    expect(pusher.transform.worldPosition.x).toBeCloseTo(2, 3);
    expect(Math.abs(Quaternion.dot(pusher.transform.worldRotationQuaternion, rot))).toBeCloseTo(1, 3);
    expect(crate.transform.worldPosition.x).toBeGreaterThan(2.5);
  });

  it("simulates articulated motorized HingeJoint door, SpringJoint suspension, and breakable FixedJoint bridge", () => {
    // 1. Motorized hinged door clamped to [0, 90] degrees
    const frame = root.createChild("door-frame");
    frame.transform.setPosition(-5, 2, 0);
    const frameBody = frame.addComponent(Rigidbody);
    frameBody.isKinematic = true;
    const door = root.createChild("door");
    door.transform.setPosition(-4, 2, 0);
    door.addComponent(BoxCollider).size = new Vector3(2, 2, 0.2);
    door.addComponent(Rigidbody).useGravity = false;
    const hinge = door.addComponent(HingeJoint);
    hinge.connectedBody = frameBody;
    hinge.anchor = new Vector3(-1, 0, 0);
    hinge.axis = new Vector3(0, 1, 0);
    hinge.useLimits = true;
    const limits = new JointLimits();
    limits.min = 0;
    limits.max = 90;
    hinge.limits = limits;
    hinge.useMotor = true;
    const motor = new JointMotor();
    motor.targetVelocity = 4; // rad/s
    motor.forceLimit = 100;
    hinge.motor = motor;

    // 2. Spring suspension holding a hanging weight within maxDistance
    const ceiling = root.createChild("ceiling");
    ceiling.transform.setPosition(0, 6, 0);
    const ceilingBody = ceiling.addComponent(Rigidbody);
    ceilingBody.isKinematic = true;
    const weight = root.createChild("weight");
    weight.transform.setPosition(0, 4, 0);
    weight.addComponent(BoxCollider);
    weight.addComponent(Rigidbody);
    const spring = weight.addComponent(SpringJoint);
    spring.connectedBody = ceilingBody;
    spring.automaticConnectedAnchor = false;
    spring.anchor.set(0, 0, 0);
    spring.connectedAnchor.set(0, 0, 0);
    spring.minDistance = 1;
    spring.maxDistance = 2.5;
    spring.tolerance = 0;
    spring.stiffness = 200;
    spring.damping = 20;

    // 3. Breakable FixedJoint plank: holds light mass, snaps when heavy mass is applied
    const pier = root.createChild("pier");
    pier.transform.setPosition(5, 5, 0);
    const pierBody = pier.addComponent(Rigidbody);
    pierBody.isKinematic = true;
    const plank = root.createChild("plank");
    plank.transform.setPosition(5, 3, 0);
    plank.addComponent(BoxCollider);
    const plankBody = plank.addComponent(Rigidbody);
    plankBody.mass = 1;
    const bridgeJoint = plank.addComponent(FixedJoint);
    bridgeJoint.connectedBody = pierBody;
    bridgeJoint.breakForce = 30;

    step(60);

    // Door opened and clamped at 90 degrees
    expect(hinge.angle).toBeGreaterThan(80);
    expect(hinge.angle).toBeLessThanOrEqual(92);
    // Spring weight stayed suspended near ceiling (y ~ 3.5) instead of free-falling below 0
    expect(weight.transform.worldPosition.y).toBeGreaterThan(2.5);
    expect(weight.transform.worldPosition.y).toBeLessThan(5.0);
    // Light plank (weight ~9.81 N < breakForce 30 N) stayed attached at y = 3
    expect(plank.transform.worldPosition.y).toBeCloseTo(3, 2);

    // Increase plank mass to 10 (weight ~98.1 N > breakForce 30 N): joint snaps and plank falls
    plankBody.mass = 10;
    plankBody.wakeUp();
    step(40);
    expect(plank.transform.worldPosition.y).toBeLessThan(2.0);
  });

  it("removes detached shapes from queries and keeps Collider ownership consistent through hierarchy changes", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    // 1. Direct cross-scene transfer to an inactive destination updates query registration cleanly
    const inactiveDst = new Scene(engine, "inactive-physics-dst");
    try {
      const ray = new Ray(new Vector3(0, 3, 0), new Vector3(0, -1, 0));
      const parent = root.createChild("transfer-parent");
      const child = parent.createChild("transfer-child");
      child.addComponent(BoxCollider);

      try {
        expect(scene.physics.raycast(ray, 10)).toBe(true);
        expect(() => {
          inactiveDst.addRootEntity(child);
        }).not.toThrow();
        expect(scene.physics.raycast(ray, 10)).toBe(false);
        expect(inactiveDst.physics.raycast(ray, 10)).toBe(true);
        expect(child.scene).toBe(inactiveDst);
      } finally {
        if (!parent.destroyed) parent.destroy();
        if (!child.destroyed) child.destroy();
      }
    } finally {
      if (!inactiveDst.destroyed) inactiveDst.destroy();
    }

    // 2. Reparenting into an owning Rigidbody removes static registration and routes enable/disable through the body.
    errors.mockClear();
    const moving = root.createChild("collider");
    moving.transform.position.x = 4;
    const collider = moving.addComponent(BoxCollider);
    const bodyEntity = root.createChild("owner");
    bodyEntity.transform.position.x = 4;
    const body = bodyEntity.addComponent(Rigidbody);
    body.isKinematic = true;

    const oldRay = new Ray(new Vector3(4, 3, 0), new Vector3(0, -1, 0));
    const newRay = new Ray(new Vector3(8, 3, 0), new Vector3(0, -1, 0));
    expect(scene.physics.raycast(oldRay, 10)).toBe(true);

    try {
      bodyEntity.addChild(moving);
      expect(collider.attachedRigidbody).toBe(body);
      expect(scene.physics.raycast(oldRay, 10)).toBe(false);
      expect(scene.physics.raycast(newRay, 10)).toBe(true);
      expect(collider.attachedRigidbody).toBe(body);
      expect(errors).not.toHaveBeenCalled();

      collider.enabled = false;
      expect(collider.attachedRigidbody).toBe(body);
      expect(scene.physics.raycast(newRay, 10)).toBe(false);
      collider.enabled = true;
      expect(scene.physics.raycast(newRay, 10)).toBe(true);
    } finally {
      bodyEntity.destroy();
    }

    // The old native actor can move to another scene before the Collider has synchronized its new owner.
    const previousScene = new Scene(engine, "former owner destination");
    const oldEntity = scene.createRootEntity("old owner");
    const newEntity = scene.createRootEntity("new owner");
    try {
      oldEntity.addComponent(Rigidbody).isKinematic = true;
      const newBody = newEntity.addComponent(Rigidbody);
      newBody.isKinematic = true;
      const child = oldEntity.createChild("collider");
      const collider = child.addComponent(BoxCollider);
      const ray = new Ray(new Vector3(0, 3, 0), new Vector3(0, -1, 0));
      expect(scene.physics.raycast(ray, 10)).toBe(true);

      newEntity.addChild(child);
      previousScene.addRootEntity(oldEntity);
      expect(previousScene.physics.raycast(ray, 10)).toBe(false);
      const hit = new HitResult();
      expect(scene.physics.raycast(ray, 10, hit) && hit.collider === collider).toBe(true);
      expect(collider.attachedRigidbody).toBe(newBody);
    } finally {
      oldEntity.destroy();
      newEntity.destroy();
      previousScene.destroy();
    }

    // 5. Pure attachedRigidbody getter has zero side effects on transient reparenting (no extra onCollisionEnter)
    for (const doRead of [false, true]) {
      const ground = root.createChild(`transient-ground-${doRead}`);
      ground.transform.position.y = -0.4;
      ground.addComponent(BoxCollider).size.set(4, 1, 4);
      const a = root.createChild(`transient-a-${doRead}`);
      a.transform.position.y = 0.5;
      const b = root.createChild(`transient-b-${doRead}`);
      b.transform.position.y = 0.5;
      const originalBody = a.addComponent(Rigidbody);
      originalBody.useGravity = false;
      originalBody.constraints = RigidbodyConstraints.FreezeAll;
      const transientBody = b.addComponent(Rigidbody);
      transientBody.enabled = false;
      const child = a.createChild("child");
      const box = child.addComponent(BoxCollider);
      const events: string[] = [];
      a.addComponent(
        class extends Script {
          override onCollisionEnter(): void {
            events.push("enter");
          }
          override onCollisionStay(): void {
            events.push("stay");
          }
          override onCollisionExit(): void {
            events.push("exit");
          }
        }
      );

      try {
        step(3);
        expect(events[0]).toBe("enter");
        events.length = 0;

        b.addChild(child);
        if (doRead) {
          expect(box.attachedRigidbody).toBe(transientBody);
        }
        a.addChild(child);

        step(2);
        expect(events.length).toBeGreaterThan(0);
        expect(events.every((e) => e === "stay")).toBe(true);
        expect(box.attachedRigidbody).toBe(originalBody);
      } finally {
        ground.destroy();
        a.destroy();
        b.destroy();
      }
    }
  });

  it("applies authored mesh overrides and preserves leaf teardown order on scene destruction", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const ray = new Ray(new Vector3(0, 5, 0), new Vector3(0, -1, 0));
    const hitEntity = (targetScene: Scene, x = 0): Entity | null => {
      const result = new HitResult();
      return targetScene.physics.raycast(new Ray(new Vector3(x, 5, 0), new Vector3(0, -1, 0)), 10, result)
        ? result.entity
        : null;
    };

    // 1. Normal scene.destroy() runs leaf onDisable before tearing down parent components
    {
      const destroyScene = new Scene(engine, "r13-destroy-outside");
      engine.sceneManager.addScene(destroyScene);
      try {
        const parent = destroyScene.createRootEntity("parent");
        const leaf = parent.createChild("leaf");
        const events: string[] = [];
        class ParentTool extends Script {
          release(): void {
            events.push("released");
          }
        }
        parent.addComponent(ParentTool);
        leaf.addComponent(
          class extends Script {
            override onDisable(): void {
              const tool = parent.getComponent(ParentTool);
              expect(tool).not.toBeNull();
              tool!.release();
            }
          }
        );
        expect(() => destroyScene.destroy()).not.toThrow();
        expect(parent.destroyed).toBe(true);
        expect(leaf.destroyed).toBe(true);
        expect(destroyScene.destroyed).toBe(true);
        expect(events).toEqual(["released"]);
      } finally {
        if (!destroyScene.destroyed) destroyScene.destroy();
      }
    }

    // 2. MeshCollider prefab overrides: 3-vertex triangle replacement, released-CPU cookingFlags, degenerate-tris convex override
    const indexedMesh = new ModelMesh(engine);
    indexedMesh.setPositions([
      new Vector3(0, 1, 0),
      new Vector3(-1, 0, -1),
      new Vector3(1, 0, -1),
      new Vector3(0, 0, 1)
    ]);
    indexedMesh.setIndices(new Uint16Array([0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2]));
    indexedMesh.addSubMesh(0, 12, MeshTopology.Triangles);

    const triangleMesh = new ModelMesh(engine);
    triangleMesh.setPositions([new Vector3(2, 0, -1), new Vector3(3, 0, 1), new Vector3(4, 0, -1)]);
    triangleMesh.setIndices(new Uint16Array([0, 1, 2]));
    triangleMesh.addSubMesh(0, 3, MeshTopology.Triangles);

    const degenerateMesh = new ModelMesh(engine);
    degenerateMesh.setPositions([
      new Vector3(0, 1, 0),
      new Vector3(-1, 0, -1),
      new Vector3(1, 0, -1),
      new Vector3(0, 0, 1)
    ]);
    degenerateMesh.setIndices(new Uint16Array([0, 0, 0]));
    degenerateMesh.addSubMesh(0, 3, MeshTopology.Triangles);

    const releasableMesh = new ModelMesh(engine);
    releasableMesh.setPositions([
      new Vector3(0, 1, 0),
      new Vector3(-1, 0, -1),
      new Vector3(1, 0, -1),
      new Vector3(0, 0, 1)
    ]);

    registerMesh("r11-indexed.mesh", indexedMesh);
    registerMesh("r11-triangle.mesh", triangleMesh);
    registerMesh("r11-degenerate.mesh", degenerateMesh);
    registerMesh("r11-releasable.mesh", releasableMesh);

    await loadPrefab("r11-empty-base.prefab", {
      version: "2.0",
      refs: [],
      entities: [{ name: "root" }],
      components: [],
      root: 0
    });
    await loadPrefab("r11-hull-base.prefab", {
      version: "2.0",
      refs: [{ url: "r11-indexed.mesh" }],
      entities: [{ name: "root", components: [0] }],
      components: [{ type: "MeshCollider", props: { convex: true, mesh: { $ref: 0 }, isTrigger: true } }],
      root: 0
    });

    try {
      // 3a. Replace convex hull with 3-vertex coplanar triangle mesh + convex: false + isTrigger: false atomically
      const triOuter = await loadPrefab("r11-tri-outer.prefab", {
        version: "2.0",
        refs: [{ url: "r11-hull-base.prefab" }, { url: "r11-triangle.mesh" }],
        entities: [
          {
            instance: {
              asset: 0,
              overrides: {
                componentProps: [
                  {
                    path: [],
                    selector: { type: "MeshCollider", index: 0 },
                    props: { isTrigger: false, mesh: { $ref: 1 }, convex: false }
                  }
                ]
              }
            }
          }
        ],
        components: [],
        root: 0
      });
      const triInst = triOuter.instantiate();
      root.addChild(triInst);
      try {
        const mc = triInst.getComponent(MeshCollider)!;
        expect(mc.mesh).toBe(triangleMesh);
        expect(mc.convex).toBe(false);
        expect(mc.isTrigger).toBe(false);
        expect(hitEntity(scene, 3)).toBe(triInst);
      } finally {
        triInst.destroy();
      }

      // 3b. Replace old hull whose CPU data was released by base call while also changing cookingFlags and convex
      const flags = MeshColliderCookingFlag.Cleaning;
      const flagsOuter = await loadPrefab("r11-flags-outer.prefab", {
        version: "2.0",
        refs: [{ url: "r11-empty-base.prefab" }, { url: "r11-indexed.mesh" }, { url: "r11-releasable.mesh" }],
        entities: [
          {
            instance: {
              asset: 0,
              overrides: {
                addedComponents: [{ target: [], component: 0 }],
                componentProps: [
                  {
                    path: [],
                    selector: { type: "MeshCollider", index: 0 },
                    props: { mesh: { $ref: 1 }, convex: false, cookingFlags: flags }
                  }
                ]
              }
            }
          }
        ],
        components: [
          {
            type: "MeshCollider",
            props: { convex: true, mesh: { $ref: 2 } },
            calls: [{ target: ["mesh"], method: "uploadData", args: [true] }]
          }
        ],
        root: 0
      });
      const flagsInst = flagsOuter.instantiate();
      root.addChild(flagsInst);
      try {
        const mc = flagsInst.getComponent(MeshCollider)!;
        expect(releasableMesh.accessible).toBe(false);
        expect(mc.mesh).toBe(indexedMesh);
        expect(mc.convex).toBe(false);
        expect(mc.cookingFlags).toBe(flags);
        expect(scene.physics.raycast(ray, 10)).toBe(true);
      } finally {
        flagsInst.destroy();
      }
      expect(errors).not.toHaveBeenCalled();

      // A convex override can cook vertices with degenerate triangle indices.
      const degOuter = await loadPrefab("r11-degenerate-outer.prefab", {
        version: "2.0",
        refs: [{ url: "r11-empty-base.prefab" }, { url: "r11-degenerate.mesh" }],
        entities: [
          {
            instance: {
              asset: 0,
              overrides: {
                addedComponents: [{ target: [], component: 0 }],
                componentProps: [{ path: [], selector: { type: "MeshCollider", index: 0 }, props: { convex: true } }]
              }
            }
          }
        ],
        components: [{ type: "MeshCollider", props: { mesh: { $ref: 1 } } }],
        root: 0
      });
      const degInst = degOuter.instantiate();
      root.addChild(degInst);
      try {
        const mc = degInst.getComponent(MeshCollider)!;
        expect(mc.mesh).toBe(degenerateMesh);
        expect(mc.convex).toBe(true);
        expect(scene.physics.raycast(ray, 10)).toBe(true);
      } finally {
        degInst.destroy();
      }
    } finally {
      errors.mockRestore();
      indexedMesh.destroy();
      triangleMesh.destroy();
      degenerateMesh.destroy();
      releasableMesh.destroy();
    }
  });

  it("preserves derived MeshCollider setter readback into PhysX trigger contacts and excludes rejected collinear meshes on sync", async () => {
    const tetraMesh = new ModelMesh(engine);
    tetraMesh.setPositions([
      new Vector3(0, 2, 0),
      new Vector3(-2, -1, -2),
      new Vector3(2, -1, -2),
      new Vector3(0, -1, 2)
    ]);
    tetraMesh.setIndices(new Uint16Array([0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2]));
    tetraMesh.addSubMesh(0, 12, MeshTopology.Triangles);

    const collinearMesh = new ModelMesh(engine);
    collinearMesh.setPositions([new Vector3(-1, 0, 0), new Vector3(0, 0, 0), new Vector3(1, 0, 0)]);
    collinearMesh.setIndices(new Uint16Array([0, 1, 2]));
    collinearMesh.addSubMesh(0, 3, MeshTopology.Triangles);

    registerMesh("r13-tetra.mesh", tetraMesh);
    registerMesh("r13-collinear.mesh", collinearMesh);

    const ray = new Ray(new Vector3(0, 4, 0), new Vector3(0, -1, 0));
    try {
      // A repeated default cookingFlags value must not mask the derived setter's trigger side effect.
      for (const withCookingFlags of [false, true]) {
        const seen: string[] = [];
        class TriggerFromConvex extends MeshCollider {
          override get convex(): boolean {
            return super.convex;
          }
          override set convex(value: boolean) {
            super.convex = value;
            seen.push(`convex:${this.convex}`);
            this.isTrigger = this.convex;
            this.contactOffset = 0.19;
          }
        }
        const typeName = `R13TriggerFromConvex_${withCookingFlags}`;
        Loader.registerClass(typeName, TriggerFromConvex);

        const resource = await loadPrefab(`r13-derived-${withCookingFlags}.prefab`, {
          version: "2.0",
          refs: [{ url: "r13-tetra.mesh" }],
          entities: [{ name: "root", components: [0] }],
          components: [
            {
              type: typeName,
              props: {
                convex: true,
                mesh: { $ref: 0 },
                ...(withCookingFlags
                  ? { cookingFlags: MeshColliderCookingFlag.Cleaning | MeshColliderCookingFlag.VertexWelding }
                  : {})
              }
            }
          ],
          root: 0
        });
        expect(seen).toEqual(["convex:true"]);
        const inst = resource.instantiate();
        const probe = root.createChild(`probe-${withCookingFlags}`);
        const events: string[] = [];
        try {
          root.addChild(inst);
          const mc = inst.getComponent(TriggerFromConvex)!;
          expect(mc.convex).toBe(true);
          expect(mc.isTrigger).toBe(true);
          expect(mc.contactOffset).toBeCloseTo(0.19);

          probe.addComponent(Rigidbody).useGravity = false;
          probe.addComponent(BoxCollider);
          probe.addComponent(
            class extends Script {
              override onCollisionEnter(): void {
                events.push("collision");
              }
              override onTriggerEnter(): void {
                events.push("trigger");
              }
            }
          );
          step(3);
          expect(events).toEqual(["trigger"]);
        } finally {
          probe.destroy();
          inst.destroy();
        }
      }

      // 2. Rejected collinear triangle cook retains declared properties, excludes invalid mesh on sync, and recovers when replaced
      await loadPrefab("r13-hull-base.prefab", {
        version: "2.0",
        refs: [{ url: "r13-tetra.mesh" }],
        entities: [{ name: "root", components: [0] }],
        components: [{ type: "MeshCollider", props: { convex: true, isTrigger: true, mesh: { $ref: 0 } } }],
        root: 0
      });

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const rejectedOuter = await loadPrefab("r13-collinear-outer.prefab", {
          version: "2.0",
          refs: [{ url: "r13-hull-base.prefab" }, { url: "r13-collinear.mesh" }],
          entities: [
            {
              instance: {
                asset: 0,
                overrides: {
                  componentProps: [
                    {
                      path: [],
                      selector: { type: "MeshCollider", index: 0 },
                      props: {
                        isTrigger: false,
                        convex: false,
                        cookingFlags: MeshColliderCookingFlag.Cleaning,
                        mesh: { $ref: 1 }
                      }
                    }
                  ]
                }
              }
            }
          ],
          components: [],
          root: 0
        });
        const inst = rejectedOuter.instantiate();
        root.addChild(inst);
        try {
          const mc = inst.getComponent(MeshCollider)!;
          expect(mc.mesh).toBe(collinearMesh);
          expect(mc.isTrigger).toBe(false);
          expect(mc.cookingFlags).toBe(MeshColliderCookingFlag.Cleaning);
          expect(scene.physics.raycast(ray, 10)).toBe(false);
          expect(errSpy).toHaveBeenCalled();

          mc.mesh = tetraMesh;
          expect(scene.physics.raycast(ray, 10)).toBe(true);
        } finally {
          inst.destroy();
        }
      } finally {
        warnSpy.mockRestore();
        errSpy.mockRestore();
      }
    } finally {
      tetraMesh.destroy();
      collinearMesh.destroy();
    }
  });
});
