import { WebGLEngine } from "@galacean/engine";
import {
  BoxCollider,
  CapsuleCollider,
  CharacterController,
  CharacterControllerGeometry,
  Collision,
  ControllerCollisionFlag,
  ControllerNonWalkableMode,
  Entity,
  FixedJoint,
  HingeJoint,
  JointLimits,
  JointMotor,
  Loader,
  MeshCollider,
  ModelMesh,
  PhysicsScene,
  PlaneCollider,
  Rigidbody,
  RigidbodyConstraints,
  Scene,
  Script,
  SphereCollider,
  SpringJoint
} from "@galacean/engine-core";
import { Quaternion, Vector3 } from "@galacean/engine-math";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrefabParser } from "../../../../packages/loader/src/prefab/PrefabParser";
import {
  ParserContext,
  ParserType
} from "../../../../packages/loader/src/resource-deserialize/resources/parser/ParserContext";
import { SceneParser } from "../../../../packages/loader/src/resource-deserialize/resources/scene/SceneParser";
import type { PrefabFile } from "../../../../packages/loader/src/schema/PrefabSchema";
import type { SceneFile } from "../../../../packages/loader/src/schema/SceneSchema";
import { createPhysics } from "../../utils/physics";

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
    engine.resourceManager.gc();
  });

  afterAll(() => engine.destroy());

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
    bumperCol.height = 0.6;

    // Static capsule obstacle placed directly in the cart's path at the bottom of the ramp
    const blocker = root.createChild("capsule-blocker");
    blocker.transform.setPosition(0.8, 0.45, 0);
    blocker.transform.setRotation(90, 0, 0);
    const blockerCol = blocker.addComponent(CapsuleCollider);
    blockerCol.radius = 0.4;
    blockerCol.height = 2.0;

    let hitBlocker = false;
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

    // Track 1 (z = -3): Stairs + Box CharacterController (stepOffset = 0.55)
    addStaticBox("stair-1", new Vector3(-2.0, 0.175, -3), new Vector3(1.5, 0.35, 1.8), 0, 0.6);
    addStaticBox("stair-2", new Vector3(-0.5, 0.35, -3), new Vector3(1.5, 0.7, 1.8), 0, 0.6);
    addStaticBox("stair-3", new Vector3(2.25, 0.525, -3), new Vector3(4.0, 1.05, 1.8), 0, 0.6);
    const stairRole = root.createChild("cc-stairs");
    stairRole.transform.setPosition(-5.0, 0.65, -3);
    const stairCC = stairRole.addComponent(CharacterController);
    stairCC.geometry = CharacterControllerGeometry.Box;
    stairCC.size = new Vector3(0.7, 1.2, 0.7);
    stairCC.stepOffset = 0.55;

    // Track 2 (z = 0): Tall barrier blocked by low stepOffset = 0.08
    addStaticBox("barrier", new Vector3(-1.0, 0.25, 0), new Vector3(1.2, 0.5, 1.8), 0, 0.6);
    const blockedRole = root.createChild("cc-blocked");
    blockedRole.transform.setPosition(-5.0, 0.75, 0);
    const blockedCC = blockedRole.addComponent(CharacterController);
    blockedCC.geometry = CharacterControllerGeometry.Capsule;
    blockedCC.radius = 0.35;
    blockedCC.height = 0.7;
    blockedCC.stepOffset = 0.08;

    // Track 3 (z = 3): Walkable 35 deg ramp (slopeLimit = 45)
    addStaticBox("ramp-35", new Vector3(0.2, 1.9, 3), new Vector3(7.0, 0.3, 1.8), 35, 0.6);
    const climbRole = root.createChild("cc-slope-ok");
    climbRole.transform.setPosition(-4.8, 0.75, 3);
    const climbCC = climbRole.addComponent(CharacterController);
    climbCC.geometry = CharacterControllerGeometry.Capsule;
    climbCC.radius = 0.35;
    climbCC.height = 0.7;
    climbCC.slopeLimit = 45;
    climbCC.stepOffset = 0.35;

    // Tracks 4 & 5 (z = 6 and z = 9): Unwalkable 60 deg ramps directly comparing PreventClimbing vs ForceSliding
    const addSteepTrack = (z: number, mode: ControllerNonWalkableMode) => {
      addStaticBox(`ramp-60-${z}`, new Vector3(0, 2.0, z), new Vector3(6.0, 0.3, 1.8), 60, 0.6);
      const role = root.createChild(`cc-steep-${z}`);
      // Start directly above the mid-slope so both land squarely on the 60 deg incline
      role.transform.setPosition(0, 3.2, z);
      const cc = role.addComponent(CharacterController);
      cc.geometry = CharacterControllerGeometry.Capsule;
      cc.radius = 0.35;
      cc.height = 0.7;
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

  it("deserializes Scene and Prefab JSON with Joint before Rigidbody and unordered component properties", async () => {
    const cubeMesh = new ModelMesh(engine);
    cubeMesh.setPositions([new Vector3(0, 1, 0), new Vector3(-1, 0, -1), new Vector3(1, 0, -1), new Vector3(0, 0, 1)]);
    cubeMesh.uploadData(false);

    const meshUrl = "test://unordered-convex.mesh";
    vi.spyOn(engine.resourceManager, "getResourceByRef").mockImplementation((ref: any) => {
      if (ref.url === meshUrl) {
        return Promise.resolve(cubeMesh) as any;
      }
      return Promise.resolve(null) as any;
    });

    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    // Scene JSON intentionally places FixedJoint BEFORE Rigidbody and puts dependent props before gate booleans
    const sceneData: SceneFile = {
      version: "2.0",
      refs: [{ url: meshUrl }],
      entities: [
        { name: "anchor", position: [0, 8, 0], components: [0] },
        { name: "hanging", position: [0, 5, 0], components: [1, 2, 3] }
      ],
      components: [
        { type: "Rigidbody", props: { isKinematic: true } },
        {
          type: "FixedJoint",
          props: {
            connectedAnchor: { x: 0, y: -3, z: 0 },
            connectedBody: { $component: { entity: [0], type: "Rigidbody", index: 0 } },
            automaticConnectedAnchor: false
          }
        },
        {
          type: "Rigidbody",
          props: {
            centerOfMass: { x: 0.25, y: 0.5, z: -0.25 },
            inertiaTensor: { x: 2, y: 3, z: 4 },
            mass: 5,
            automaticCenterOfMass: false,
            automaticInertiaTensor: false
          }
        },
        {
          type: "MeshCollider",
          props: {
            isTrigger: true,
            mesh: { $ref: 0 },
            convex: true
          }
        }
      ],
      scene: { rootEntities: [0, 1] }
    };

    const parsedScene = new Scene(engine);
    engine.sceneManager.addScene(parsedScene);
    try {
      const ctx = new ParserContext(engine, ParserType.Scene, parsedScene);
      const parser = new SceneParser(sceneData, ctx, parsedScene);
      parser.start();
      await parser.promise;

      const anchor = parsedScene.findEntityByName("anchor")!;
      const hanging = parsedScene.findEntityByName("hanging")!;
      const hangingBodies = hanging.getComponents(Rigidbody, []);
      expect(hangingBodies).toHaveLength(1);
      const hangingBody = hangingBodies[0];
      expect(hangingBody.mass).toBe(5);
      expect(hangingBody.automaticCenterOfMass).toBe(false);
      expect(hangingBody.centerOfMass.x).toBeCloseTo(0.25, 5);
      expect(hangingBody.centerOfMass.y).toBeCloseTo(0.5, 5);
      expect(hangingBody.centerOfMass.z).toBeCloseTo(-0.25, 5);
      expect(hangingBody.automaticInertiaTensor).toBe(false);
      expect(hangingBody.inertiaTensor.x).toBeCloseTo(2, 5);
      expect(hangingBody.inertiaTensor.y).toBeCloseTo(3, 5);
      expect(hangingBody.inertiaTensor.z).toBeCloseTo(4, 5);

      const joint = hanging.getComponent(FixedJoint)!;
      expect(joint.connectedBody).toBe(anchor.getComponent(Rigidbody));
      expect(joint.automaticConnectedAnchor).toBe(false);
      expect(joint.connectedAnchor.y).toBeCloseTo(-3, 5);

      const meshCol = hanging.getComponent(MeshCollider)!;
      expect(meshCol.convex).toBe(true);
      expect(meshCol.isTrigger).toBe(true);
      expect(meshCol.mesh).toBe(cubeMesh);

      expect(warnings).not.toHaveBeenCalled();
      expect(errors).not.toHaveBeenCalled();

      // Step simulation: hanging body stays supported by joint at y = 5
      parsedScene.physics._update(0.5);
      expect(hanging.transform.worldPosition.y).toBeCloseTo(5, 2);

      // Destroy must tear down Joint before Rigidbody cleanly
      expect(() => hanging.destroy()).not.toThrow();
    } finally {
      parsedScene.destroy();
    }

    // PrefabInstance addedComponents with Joint before Rigidbody + override disabling trigger+convex in reverse order
    const indexedMesh = new ModelMesh(engine);
    indexedMesh.setPositions([
      new Vector3(-1, 0, -1),
      new Vector3(1, 0, -1),
      new Vector3(0, 0, 1),
      new Vector3(0, 1, 0)
    ]);
    indexedMesh.setIndices(new Uint16Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]));
    indexedMesh.uploadData(false);
    const indexedMeshUrl = "test://unordered-indexed.mesh";

    vi.restoreAllMocks();
    const origGetResource = engine.resourceManager.getResourceByRef.bind(engine.resourceManager);
    vi.spyOn(engine.resourceManager, "getResourceByRef").mockImplementation((ref: any) => {
      if (ref.url === indexedMeshUrl) return Promise.resolve(indexedMesh) as any;
      return origGetResource(ref);
    });

    const basePrefabData: PrefabFile = {
      version: "2.0",
      refs: [{ url: indexedMeshUrl }],
      entities: [{ name: "base", components: [0] }],
      components: [{ type: "MeshCollider", props: { isTrigger: true, convex: true, mesh: { $ref: 0 } } }],
      root: 0
    };
    const basePrefab = await PrefabParser.parse(engine, "test://base-physics.prefab", basePrefabData);
    // @ts-ignore
    engine.resourceManager._objectPool["test://base-physics.prefab"] = basePrefab;
    vi.restoreAllMocks();
    vi.spyOn(engine.resourceManager, "getResourceByRef").mockImplementation((ref: any) => {
      if (ref.url === "test://base-physics.prefab") return Promise.resolve(basePrefab) as any;
      if (ref.url === indexedMeshUrl) return Promise.resolve(indexedMesh) as any;
      return origGetResource(ref);
    });
    const prefabErrors = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const outerPrefabData: PrefabFile = {
        version: "2.0",
        refs: [{ url: "test://base-physics.prefab" }],
        entities: [
          {
            instance: {
              asset: 0,
              overrides: {
                addedComponents: [
                  { target: [], component: 0 },
                  { target: [], component: 1 }
                ],
                componentProps: [
                  {
                    path: [],
                    selector: { type: "MeshCollider", index: 0 },
                    props: { convex: false, isTrigger: false }
                  }
                ]
              }
            }
          }
        ],
        components: [
          { type: "FixedJoint", props: { breakForce: 42 } },
          { type: "Rigidbody", props: { isKinematic: true, mass: 7 } }
        ],
        root: 0
      };

      const baseInst = basePrefab.instantiate();
      expect(baseInst.getComponent(MeshCollider)!.convex).toBe(true);
      expect(baseInst.getComponent(MeshCollider)!.isTrigger).toBe(true);
      baseInst.destroy();

      const outerPrefab = await PrefabParser.parse(engine, "test://outer-physics.prefab", outerPrefabData);
      const inst = outerPrefab.instantiate();
      expect(inst.getComponents(Rigidbody, [])).toHaveLength(1);
      expect(inst.getComponent(Rigidbody)!.isKinematic).toBe(true);
      expect(inst.getComponent(Rigidbody)!.mass).toBe(7);
      expect(inst.getComponent(FixedJoint)!.breakForce).toBe(42);
      expect(inst.getComponent(MeshCollider)!.isTrigger).toBe(false);
      expect(inst.getComponent(MeshCollider)!.convex).toBe(false);
      expect(prefabErrors).not.toHaveBeenCalled();
      expect(() => inst.destroy()).not.toThrow();
    } finally {
      // @ts-ignore
      delete engine.resourceManager._objectPool["test://base-physics.prefab"];
    }
  });
});
