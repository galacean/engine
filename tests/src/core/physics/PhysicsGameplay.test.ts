import { WebGLEngine } from "@galacean/engine";
import {
  BoxCollider,
  CapsuleCollider,
  CharacterController,
  CharacterControllerGeometry,
  Collision,
  ControllerCollisionFlag,
  ControllerNonWalkableMode,
  dependentComponents,
  DependentMode,
  Entity,
  FixedJoint,
  HitResult,
  HingeJoint,
  JointLimits,
  JointMotor,
  Loader,
  MeshCollider,
  MeshColliderShapeCookingFlag,
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
  SpringJoint
} from "@galacean/engine-core";
import { Quaternion, Ray, Vector3 } from "@galacean/engine-math";
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

  it("applies Prefab physics overrides cleanly across removals, reverse-dependency teardown, and cross-component transitions", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const warns = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1, { keepMeshData: true });
    // @ts-ignore
    engine.resourceManager._objectPool["test://override-mesh.mesh"] = mesh;

    try {
      // Case A: Base prefab has kinematic Rigidbody + PlaneCollider + child entity with non-convex MeshCollider
      //         + sibling entity [1] to verify pre-resolution before removedEntities shifts indices.
      const baseRemoveData: any = {
        version: "2.0",
        refs: [{ url: "test://override-mesh.mesh", type: "ModelMesh" }],
        entities: [
          { name: "Root", components: [0, 1], children: [1, 2] },
          { name: "MeshChild", components: [2] },
          { name: "SurvivingChild", position: [0, 0, 0] }
        ],
        components: [
          { type: "Rigidbody", props: { isKinematic: true } },
          { type: "PlaneCollider" },
          { type: "MeshCollider", props: { convex: false, mesh: { $ref: 0 } } }
        ],
        root: 0
      };
      const baseRemovePrefab = await PrefabParser.parse(engine, "test://base-remove.prefab", baseRemoveData);
      // @ts-ignore
      engine.resourceManager._objectPool["test://base-remove.prefab"] = baseRemovePrefab;

      const overrideRemoveData: any = {
        version: "2.0",
        refs: [{ url: "test://base-remove.prefab", type: "Prefab" }],
        entities: [
          {
            instance: {
              asset: 0,
              overrides: {
                // Remove PlaneCollider on root AND MeshChild [0], while overriding SurvivingChild [1] and setting isKinematic: false
                entityProps: [{ path: [1], name: "RenamedSurvivor" }],
                componentProps: [
                  { path: [], selector: { type: "Rigidbody", index: 0 }, props: { isKinematic: false } }
                ],
                removedEntities: [[0]],
                removedComponents: [{ path: [], selectors: [{ type: "PlaneCollider", index: 0 }] }]
              }
            }
          }
        ],
        components: [],
        root: 0
      };
      const overrideRemovePrefab = await PrefabParser.parse(engine, "test://ov-remove.prefab", overrideRemoveData);
      const removeInst = overrideRemovePrefab.instantiate();
      expect(removeInst.getComponent(PlaneCollider)).toBeNull();
      expect(removeInst.children).toHaveLength(1);
      expect(removeInst.children[0].name).toBe("RenamedSurvivor");
      expect(removeInst.getComponent(Rigidbody)!.isKinematic).toBe(false);
      expect(errors).not.toHaveBeenCalled();
      removeInst.destroy();

      // Case B: Removing [Rigidbody, FixedJoint] with Rigidbody listed BEFORE FixedJoint succeeds cleanly
      const baseJointData: any = {
        version: "2.0",
        refs: [],
        entities: [{ name: "JointRoot", components: [0, 1] }],
        components: [{ type: "Rigidbody" }, { type: "FixedJoint" }],
        root: 0
      };
      const baseJointPrefab = await PrefabParser.parse(engine, "test://base-joint.prefab", baseJointData);
      // @ts-ignore
      engine.resourceManager._objectPool["test://base-joint.prefab"] = baseJointPrefab;

      const overrideJointData: any = {
        version: "2.0",
        refs: [{ url: "test://base-joint.prefab", type: "Prefab" }],
        entities: [
          {
            instance: {
              asset: 0,
              overrides: {
                removedComponents: [
                  {
                    path: [],
                    selectors: [
                      { type: "Rigidbody", index: 0 },
                      { type: "FixedJoint", index: 0 }
                    ]
                  }
                ]
              }
            }
          }
        ],
        components: [],
        root: 0
      };
      const overrideJointPrefab = await PrefabParser.parse(engine, "test://ov-joint.prefab", overrideJointData);
      const jointInst = overrideJointPrefab.instantiate();
      expect(jointInst.getComponent(FixedJoint)).toBeNull();
      expect(jointInst.getComponent(Rigidbody)).toBeNull();
      expect(errors).not.toHaveBeenCalled();
      jointInst.destroy();

      // Case C1: Kinematic + non-convex MeshCollider -> override lists isKinematic: false BEFORE convex: true
      const baseKinMeshData: any = {
        version: "2.0",
        refs: [{ url: "test://override-mesh.mesh", type: "ModelMesh" }],
        entities: [{ name: "KinMesh", components: [0, 1] }],
        components: [
          { type: "Rigidbody", props: { isKinematic: true } },
          { type: "MeshCollider", props: { convex: false, mesh: { $ref: 0 } } }
        ],
        root: 0
      };
      const baseKinMeshPrefab = await PrefabParser.parse(engine, "test://base-kin-mesh.prefab", baseKinMeshData);
      // @ts-ignore
      engine.resourceManager._objectPool["test://base-kin-mesh.prefab"] = baseKinMeshPrefab;

      const ovToDynamicData: any = {
        version: "2.0",
        refs: [{ url: "test://base-kin-mesh.prefab", type: "Prefab" }],
        entities: [
          {
            instance: {
              asset: 0,
              overrides: {
                componentProps: [
                  { path: [], selector: { type: "Rigidbody", index: 0 }, props: { isKinematic: false } },
                  { path: [], selector: { type: "MeshCollider", index: 0 }, props: { convex: true } }
                ]
              }
            }
          }
        ],
        components: [],
        root: 0
      };
      const ovToDynamicPrefab = await PrefabParser.parse(engine, "test://ov-to-dynamic.prefab", ovToDynamicData);
      const dynInst = ovToDynamicPrefab.instantiate();
      expect(dynInst.getComponent(Rigidbody)!.isKinematic).toBe(false);
      expect(dynInst.getComponent(MeshCollider)!.mesh).toBe(mesh);
      expect(dynInst.getComponent(MeshCollider)!.convex).toBe(true);
      expect(errors).not.toHaveBeenCalled();
      expect(warns).not.toHaveBeenCalled();
      dynInst.destroy();

      // Case C2: Dynamic + convex trigger MeshCollider -> override lists MeshCollider { isTrigger: false, convex: false } BEFORE Rigidbody { isKinematic: true }
      const baseDynMeshData: any = {
        version: "2.0",
        refs: [{ url: "test://override-mesh.mesh", type: "ModelMesh" }],
        entities: [{ name: "DynMesh", components: [0, 1] }],
        components: [
          { type: "Rigidbody", props: { isKinematic: false } },
          { type: "MeshCollider", props: { convex: true, isTrigger: true, mesh: { $ref: 0 } } }
        ],
        root: 0
      };
      const baseDynMeshPrefab = await PrefabParser.parse(engine, "test://base-dyn-mesh.prefab", baseDynMeshData);
      // @ts-ignore
      engine.resourceManager._objectPool["test://base-dyn-mesh.prefab"] = baseDynMeshPrefab;

      const ovToKinematicData: any = {
        version: "2.0",
        refs: [{ url: "test://base-dyn-mesh.prefab", type: "Prefab" }],
        entities: [
          {
            instance: {
              asset: 0,
              overrides: {
                componentProps: [
                  {
                    path: [],
                    selector: { type: "MeshCollider", index: 0 },
                    props: { convex: false, isTrigger: false }
                  },
                  { path: [], selector: { type: "Rigidbody", index: 0 }, props: { isKinematic: true } }
                ]
              }
            }
          }
        ],
        components: [],
        root: 0
      };
      const ovToKinematicPrefab = await PrefabParser.parse(engine, "test://ov-to-kinematic.prefab", ovToKinematicData);
      const kinInst = ovToKinematicPrefab.instantiate();
      expect(kinInst.getComponent(Rigidbody)!.isKinematic).toBe(true);
      expect(kinInst.getComponent(MeshCollider)!.mesh).toBe(mesh);
      expect(kinInst.getComponent(MeshCollider)!.isTrigger).toBe(false);
      expect(kinInst.getComponent(MeshCollider)!.convex).toBe(false);
      expect(errors).not.toHaveBeenCalled();
      expect(warns).not.toHaveBeenCalled();
      kinInst.destroy();
    } finally {
      // @ts-ignore
      delete engine.resourceManager._objectPool["test://override-mesh.mesh"];
      // @ts-ignore
      delete engine.resourceManager._objectPool["test://base-remove.prefab"];
      // @ts-ignore
      delete engine.resourceManager._objectPool["test://base-joint.prefab"];
      // @ts-ignore
      delete engine.resourceManager._objectPool["test://base-kin-mesh.prefab"];
      // @ts-ignore
      delete engine.resourceManager._objectPool["test://base-dyn-mesh.prefab"];
    }
  });

  it("replaces inherited Rigidbody (and Joint) via removedComponents + addedComponents without duplicate-Rigidbody errors", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const basePrefabData: any = {
        version: "2.0",
        refs: [],
        entities: [{ name: "Base", components: [0, 1, 2] }],
        components: [
          { type: "BoxCollider" },
          { type: "Rigidbody", props: { mass: 1, isKinematic: false } },
          { type: "FixedJoint", props: { breakForce: 10 } }
        ],
        root: 0
      };
      const basePrefab = await PrefabParser.parse(engine, "test://base-replace-rb.prefab", basePrefabData);
      // @ts-ignore
      engine.resourceManager._objectPool["test://base-replace-rb.prefab"] = basePrefab;

      // Replace inherited Rigidbody + FixedJoint (listing Rigidbody first in removedComponents
      // and HingeJoint first in addedComponents), attach an addedEntity with an addedComponent,
      // and reference the replacement Rigidbody from a sibling entity's FixedJoint ($component index 1).
      const outerPrefabData: any = {
        version: "2.0",
        refs: [{ url: "test://base-replace-rb.prefab", type: "Prefab" }],
        entities: [
          { name: "Root", children: [1, 2] },
          {
            instance: {
              asset: 0,
              overrides: {
                removedComponents: [
                  {
                    path: [],
                    selectors: [
                      { type: "Rigidbody", index: 0 },
                      { type: "FixedJoint", index: 0 }
                    ]
                  }
                ],
                addedEntities: [{ parent: [], entity: 3 }],
                addedComponents: [
                  { target: [], component: 0 },
                  { target: [], component: 1 },
                  { target: [0], component: 2 }
                ]
              }
            }
          },
          { name: "Follower", components: [3, 4] },
          { name: "AddedChild" }
        ],
        components: [
          { type: "HingeJoint", props: { useMotor: false } },
          { type: "Rigidbody", props: { mass: 9, isKinematic: true } },
          { type: "SphereCollider", props: { radius: 0.75 } },
          { type: "Rigidbody", props: { mass: 2 } },
          {
            type: "FixedJoint",
            props: {
              connectedBody: { $component: { entity: [1], type: "Rigidbody", index: 1 } }
            }
          }
        ],
        root: 0
      };

      const outerPrefab = await PrefabParser.parse(engine, "test://outer-replace-rb.prefab", outerPrefabData);
      const inst = outerPrefab.instantiate();
      try {
        const replacedEntity = inst.children[0];
        const follower = inst.children[1];
        const bodies = replacedEntity.getComponents(Rigidbody, []);
        expect(bodies).toHaveLength(1);
        expect(bodies[0].mass).toBe(9);
        expect(bodies[0].isKinematic).toBe(true);
        expect(replacedEntity.getComponent(FixedJoint)).toBeNull();
        expect(replacedEntity.getComponent(HingeJoint)).not.toBeNull();
        expect(replacedEntity.children).toHaveLength(1);
        expect(replacedEntity.children[0].name).toBe("AddedChild");
        expect(replacedEntity.children[0].getComponent(SphereCollider)!.radius).toBe(0.75);
        expect(follower.getComponent(FixedJoint)!.connectedBody).toBe(bodies[0]);
        expect(errors).not.toHaveBeenCalled();
      } finally {
        inst.destroy();
      }
    } finally {
      // @ts-ignore
      delete engine.resourceManager._objectPool["test://base-replace-rb.prefab"];
    }
  });

  it("applies componentProps to addedComponents, replaces Rigidbody while keeping HingeJoint, and orders nested instance phases globally", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1, { keepMeshData: true });
    // @ts-ignore
    engine.resourceManager._objectPool["test://nested-phase.mesh"] = mesh;
    const poolKeys: string[] = ["test://nested-phase.mesh"];
    try {
      // Failure A: componentProps targeting a component added by addedComponents in the same instance (BoxCollider/1)
      const baseBoxPrefab = await PrefabParser.parse(engine, "test://base-box-ov.prefab", {
        version: "2.0",
        refs: [],
        entities: [{ name: "BoxHost", components: [0] }],
        components: [{ type: "BoxCollider", props: { size: { x: 1, y: 1, z: 1 } } }],
        root: 0
      });
      // @ts-ignore
      engine.resourceManager._objectPool["test://base-box-ov.prefab"] = baseBoxPrefab;
      poolKeys.push("test://base-box-ov.prefab");

      const outerBoxPrefab = await PrefabParser.parse(engine, "test://outer-box-ov.prefab", {
        version: "2.0",
        refs: [{ url: "test://base-box-ov.prefab", type: "Prefab" }],
        entities: [
          {
            instance: {
              asset: 0,
              overrides: {
                addedComponents: [{ target: [], component: 0 }],
                componentProps: [
                  {
                    path: [],
                    selector: { type: "BoxCollider", index: 1 },
                    props: { size: { x: 3, y: 2, z: 4 }, center: { x: 0, y: 1.5, z: 0 } }
                  }
                ]
              }
            }
          }
        ],
        components: [{ type: "BoxCollider", props: { size: { x: 1, y: 1, z: 1 } } }],
        root: 0
      });
      const boxInst = outerBoxPrefab.instantiate();
      try {
        const boxes = boxInst.getComponents(BoxCollider, []);
        expect(boxes).toHaveLength(2);
        expect(boxes[0].size.x).toBe(1);
        expect(boxes[1].size.x).toBe(3);
        expect(boxes[1].size.y).toBe(2);
        expect(boxes[1].size.z).toBe(4);
        expect(boxes[1].center.y).toBeCloseTo(1.5, 5);
      } finally {
        boxInst.destroy();
      }

      // Failure B: Replacing inherited Rigidbody while keeping inherited HingeJoint on the same entity
      // (verified through both PrefabParser+instantiate and active SceneParser!)
      const baseHingePrefab = await PrefabParser.parse(engine, "test://base-keep-hinge.prefab", {
        version: "2.0",
        refs: [],
        entities: [{ name: "Door", components: [0, 1, 2] }],
        components: [
          { type: "BoxCollider" },
          { type: "Rigidbody", props: { mass: 1, useGravity: false } },
          { type: "HingeJoint", props: { axis: { x: 0, y: 1, z: 0 }, useMotor: true } }
        ],
        root: 0
      });
      // @ts-ignore
      engine.resourceManager._objectPool["test://base-keep-hinge.prefab"] = baseHingePrefab;
      poolKeys.push("test://base-keep-hinge.prefab");

      const replaceRbOverrides = {
        removedComponents: [{ path: [], selectors: [{ type: "Rigidbody", index: 0 }] }],
        addedComponents: [{ target: [], component: 0 }]
      };
      const replaceRbPrefab = await PrefabParser.parse(engine, "test://outer-keep-hinge.prefab", {
        version: "2.0",
        refs: [{ url: "test://base-keep-hinge.prefab", type: "Prefab" }],
        entities: [{ instance: { asset: 0, overrides: replaceRbOverrides } }],
        components: [{ type: "Rigidbody", props: { mass: 6, useGravity: false } }],
        root: 0
      });
      const doorInst = replaceRbPrefab.instantiate();
      try {
        root.addChild(doorInst);
        const bodies = doorInst.getComponents(Rigidbody, []);
        expect(bodies).toHaveLength(1);
        expect(bodies[0].mass).toBe(6);
        const hinge = doorInst.getComponent(HingeJoint)!;
        expect(hinge).not.toBeNull();
        expect(hinge.axis.y).toBeCloseTo(1, 5);
        const motor = new JointMotor();
        motor.targetVelocity = 5;
        motor.forceLimit = 500;
        hinge.motor = motor;
        step(10);
        expect(hinge.velocity).toBeGreaterThan(2);
      } finally {
        doorInst.destroy();
      }

      // Also verify Failure B inside SceneParser (where prefab instance enters the scene before Stage 3 overrides)
      const parsedScene = new Scene(engine, "replace-rb-scene");
      try {
        const sceneContext = new ParserContext(engine, ParserType.Scene, parsedScene);
        const sceneData: SceneFile = {
          version: "2.0",
          refs: [{ url: "test://base-keep-hinge.prefab", type: "Prefab" }],
          entities: [{ instance: { asset: 0, overrides: replaceRbOverrides } }],
          components: [{ type: "Rigidbody", props: { mass: 8, useGravity: false } }],
          scene: { rootEntities: [0] }
        };
        const parser = new SceneParser(sceneData, sceneContext, parsedScene);
        parser.start();
        await parser.promise;
        const doorEntity = parsedScene.rootEntities[0];
        const body = doorEntity.getComponent(Rigidbody)!;
        const hinge = doorEntity.getComponent(HingeJoint)!;
        expect(body.mass).toBe(8);
        expect(hinge).not.toBeNull();
        const motor = new JointMotor();
        motor.targetVelocity = 5;
        motor.forceLimit = 500;
        hinge.motor = motor;
        for (let i = 0; i < 10; i++) {
          parsedScene.physics._update(parsedScene.physics.fixedTimeStep);
        }
        expect(hinge.velocity).toBeGreaterThan(2);
      } finally {
        parsedScene.destroy();
      }

      // Failure C: Parent instance flips Rigidbody.isKinematic=false while nested child instance flips MeshCollider.convex=true
      const parentRbPrefab = await PrefabParser.parse(engine, "test://parent-kin-rb.prefab", {
        version: "2.0",
        refs: [],
        entities: [{ name: "ParentBody", components: [0] }],
        components: [{ type: "Rigidbody", props: { isKinematic: true, useGravity: false } }],
        root: 0
      });
      // @ts-ignore
      engine.resourceManager._objectPool["test://parent-kin-rb.prefab"] = parentRbPrefab;
      poolKeys.push("test://parent-kin-rb.prefab");

      const childMeshPrefab = await PrefabParser.parse(engine, "test://child-nonconvex-mesh.prefab", {
        version: "2.0",
        refs: [{ url: "test://nested-phase.mesh", type: "ModelMesh" }],
        entities: [{ name: "ChildMesh", components: [0] }],
        components: [{ type: "MeshCollider", props: { convex: false, mesh: { $ref: 0 } } }],
        root: 0
      });
      // @ts-ignore
      engine.resourceManager._objectPool["test://child-nonconvex-mesh.prefab"] = childMeshPrefab;
      poolKeys.push("test://child-nonconvex-mesh.prefab");

      const combinedPrefab = await PrefabParser.parse(engine, "test://combined-phase.prefab", {
        version: "2.0",
        refs: [
          { url: "test://parent-kin-rb.prefab", type: "Prefab" },
          { url: "test://child-nonconvex-mesh.prefab", type: "Prefab" }
        ],
        entities: [
          {
            instance: {
              asset: 0,
              overrides: {
                addedEntities: [{ parent: [], entity: 1 }],
                componentProps: [
                  {
                    path: [],
                    selector: { type: "Rigidbody", index: 0 },
                    props: { isKinematic: false }
                  }
                ]
              }
            }
          },
          {
            instance: {
              asset: 1,
              overrides: {
                componentProps: [
                  {
                    path: [],
                    selector: { type: "MeshCollider", index: 0 },
                    props: { convex: true }
                  }
                ]
              }
            }
          }
        ],
        components: [],
        root: 0
      });
      const combinedInst = combinedPrefab.instantiate();
      try {
        root.addChild(combinedInst);
        const parentRb = combinedInst.getComponent(Rigidbody)!;
        const childMesh = combinedInst.children[0].getComponent(MeshCollider)!;
        expect(parentRb.isKinematic).toBe(false);
        expect(childMesh.convex).toBe(true);
        expect(errors).not.toHaveBeenCalled();
        step(2);
        expect(errors).not.toHaveBeenCalled();
      } finally {
        combinedInst.destroy();
      }
    } finally {
      for (const key of poolKeys) {
        // @ts-ignore
        delete engine.resourceManager._objectPool[key];
      }
    }
  });

  it("preserves component order and deeper BoxCollider/0 indices on Rigidbody replacement, and merges base+override props on added MeshCollider", async () => {
    @dependentComponents(HingeJoint, DependentMode.CheckOnly)
    class HingeDependentScript extends Script {}
    Loader.registerClass("HingeDependentScript", HingeDependentScript);

    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1, { keepMeshData: true });
    // @ts-ignore
    engine.resourceManager._objectPool["test://merged-mesh.mesh"] = mesh;
    const poolKeys: string[] = ["test://merged-mesh.mesh"];
    try {
      // Base prefab: [Rigidbody, HingeJoint, BoxCollider(size=1)]
      const basePrefab = await PrefabParser.parse(engine, "test://r3-base.prefab", {
        version: "2.0",
        refs: [],
        entities: [{ name: "Door", components: [0, 1, 2] }],
        components: [
          { type: "Rigidbody", props: { mass: 1, useGravity: false } },
          { type: "HingeJoint" },
          { type: "BoxCollider", props: { size: { x: 1, y: 1, z: 1 } } }
        ],
        root: 0
      });
      // @ts-ignore
      engine.resourceManager._objectPool["test://r3-base.prefab"] = basePrefab;
      poolKeys.push("test://r3-base.prefab");

      // Mid prefab: replaces Rigidbody while keeping HingeJoint + BoxCollider/0, and adds HingeDependentScript + second BoxCollider(size=2)
      const midPrefab = await PrefabParser.parse(engine, "test://r3-mid.prefab", {
        version: "2.0",
        refs: [{ url: "test://r3-base.prefab", type: "Prefab" }],
        entities: [
          {
            instance: {
              asset: 0,
              overrides: {
                removedComponents: [{ path: [], selectors: [{ type: "Rigidbody", index: 0 }] }],
                addedComponents: [
                  { target: [], component: 0 },
                  { target: [], component: 1 },
                  { target: [], component: 2 }
                ]
              }
            }
          }
        ],
        components: [
          { type: "Rigidbody", props: { mass: 5, useGravity: false } },
          { type: "HingeDependentScript" },
          { type: "BoxCollider", props: { size: { x: 2, y: 2, z: 2 } } }
        ],
        root: 0
      });
      // @ts-ignore
      engine.resourceManager._objectPool["test://r3-mid.prefab"] = midPrefab;
      poolKeys.push("test://r3-mid.prefab");

      // Outer prefab: overrides BoxCollider/0 (must hit original size=1 BoxCollider, NOT added size=2 BoxCollider)
      // AND adds a MeshCollider with base isTrigger=true + same-instance override convex=true!
      const outerPrefab = await PrefabParser.parse(engine, "test://r3-outer.prefab", {
        version: "2.0",
        refs: [
          { url: "test://r3-mid.prefab", type: "Prefab" },
          { url: "test://merged-mesh.mesh", type: "ModelMesh" }
        ],
        entities: [
          {
            instance: {
              asset: 0,
              overrides: {
                addedComponents: [{ target: [], component: 0 }],
                componentProps: [
                  {
                    path: [],
                    selector: { type: "BoxCollider", index: 0 },
                    props: { size: { x: 7 } }
                  },
                  {
                    path: [],
                    selector: { type: "MeshCollider", index: 0 },
                    props: { convex: true }
                  }
                ]
              }
            }
          }
        ],
        components: [
          {
            type: "MeshCollider",
            props: { isTrigger: true, mesh: { $ref: 1 } }
          }
        ],
        root: 0
      });

      const inst = outerPrefab.instantiate();
      root.addChild(inst);
      try {
        const rb = inst.getComponent(Rigidbody)!;
        const hinge = inst.getComponent(HingeJoint)!;
        const depScript = inst.getComponent(HingeDependentScript)!;
        const boxes = inst.getComponents(BoxCollider, []);
        const meshCol = inst.getComponent(MeshCollider)!;

        // Topological component order: Rigidbody -> HingeJoint -> HingeDependentScript
        const components = inst._components;
        expect(components.indexOf(rb)).toBeLessThan(components.indexOf(hinge));
        expect(components.indexOf(hinge)).toBeLessThan(components.indexOf(depScript));

        // Deeper Prefab BoxCollider/0 hit original BoxCollider (1,1,1 -> 7,1,1), leaving added BoxCollider (2,2,2) untouched
        expect(boxes).toHaveLength(2);
        expect(boxes[0].size.x).toBe(7);
        expect(boxes[0].size.y).toBe(1);
        expect(boxes[1].size.x).toBe(2);
        expect(boxes[1].size.y).toBe(2);

        // Added MeshCollider with base isTrigger=true + override convex=true applied convex BEFORE isTrigger
        expect(meshCol.convex).toBe(true);
        expect(meshCol.isTrigger).toBe(true);
        expect(errors).not.toHaveBeenCalled();

        // Reverse-order entity destruction succeeds cleanly with zero dependency errors
        expect(() => inst.destroy()).not.toThrow();
        expect(depScript.destroyed).toBe(true);
        expect(hinge.destroyed).toBe(true);
        expect(rb.destroyed).toBe(true);
      } finally {
        if (!inst.destroyed) inst.destroy();
      }
    } finally {
      for (const key of poolKeys) {
        // @ts-ignore
        delete engine.resourceManager._objectPool[key];
      }
    }
  });

  it("applies normal entity components and prefab addedComponents in one pass regardless of entities[] order", async () => {
    const basePrefab = await PrefabParser.parse(engine, "test://r4-base-holder.prefab", {
      version: "2.0",
      refs: [],
      entities: [{ name: "Holder" }],
      components: [],
      root: 0
    });
    // @ts-ignore
    engine.resourceManager._objectPool["test://r4-base-holder.prefab"] = basePrefab;

    try {
      const cases = [
        // PrefabInstance before addedChild; child owns Rigidbody, override adds HingeJoint
        {
          name: "prefab-before-child",
          entities: [
            {
              instance: {
                asset: 0,
                overrides: {
                  addedEntities: [{ parent: [], entity: 1 }],
                  addedComponents: [{ target: [0], component: 2 }]
                }
              }
            },
            { name: "DoorChild", components: [0, 1] }
          ],
          rootIndex: 0
        },
        // addedChild before PrefabInstance; child owns Rigidbody, override adds HingeJoint
        {
          name: "child-before-prefab",
          entities: [
            { name: "DoorChild", components: [0, 1] },
            {
              instance: {
                asset: 0,
                overrides: {
                  addedEntities: [{ parent: [], entity: 0 }],
                  addedComponents: [{ target: [0], component: 2 }]
                }
              }
            }
          ],
          rootIndex: 1
        },
        // PrefabInstance before addedChild; child owns HingeJoint, override adds Rigidbody (reverse dependency split)
        {
          name: "child-joint-override-rb",
          entities: [
            {
              instance: {
                asset: 0,
                overrides: {
                  addedEntities: [{ parent: [], entity: 1 }],
                  addedComponents: [{ target: [0], component: 1 }]
                }
              }
            },
            { name: "DoorChild", components: [0, 2] }
          ],
          rootIndex: 0
        }
      ];

      for (const c of cases) {
        const prefab = await PrefabParser.parse(engine, `test://r4-${c.name}.prefab`, {
          version: "2.0",
          refs: [{ url: "test://r4-base-holder.prefab", type: "Prefab" }],
          entities: c.entities as any,
          components: [
            { type: "BoxCollider" },
            { type: "Rigidbody", props: { mass: 5, useGravity: false } },
            { type: "HingeJoint", props: { axis: { x: 0, y: 1, z: 0 }, useMotor: true } }
          ],
          root: c.rootIndex
        });

        const inst = prefab.instantiate();
        root.addChild(inst);
        try {
          const child = inst.children[0];
          const bodies = child.getComponents(Rigidbody, []);
          const hinge = child.getComponent(HingeJoint)!;
          expect(bodies).toHaveLength(1);
          expect(bodies[0].mass).toBe(5);
          expect(hinge).not.toBeNull();
          expect(hinge.axis.y).toBeCloseTo(1, 5);

          const motor = new JointMotor();
          motor.targetVelocity = 5;
          motor.forceLimit = 500;
          hinge.motor = motor;
          step(10);
          expect(hinge.velocity).toBeGreaterThan(2);
        } finally {
          inst.destroy();
        }
      }
    } finally {
      // @ts-ignore
      delete engine.resourceManager._objectPool["test://r4-base-holder.prefab"];
    }
  });

  it("schedules per-block deserialize phases so MeshCollider convex+calls runs before Rigidbody isKinematic=false and MeshCollider isTrigger=true", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1, { keepMeshData: true });
    // @ts-ignore
    engine.resourceManager._objectPool["test://r5-phase.mesh"] = mesh;
    const poolKeys: string[] = ["test://r5-phase.mesh"];

    try {
      const basePrefab = await PrefabParser.parse(engine, "test://r5-phase-base.prefab", {
        version: "2.0",
        refs: [{ url: "test://r5-phase.mesh", type: "ModelMesh" }],
        entities: [{ name: "Actor", components: [0, 1] }],
        components: [
          { type: "Rigidbody", props: { isKinematic: true, useGravity: false } },
          { type: "MeshCollider", props: { convex: false, mesh: { $ref: 0 } } }
        ],
        root: 0
      });
      // @ts-ignore
      engine.resourceManager._objectPool["test://r5-phase-base.prefab"] = basePrefab;
      poolKeys.push("test://r5-phase-base.prefab");

      // Override Rigidbody { isKinematic: false } (+1),
      // MeshCollider block 1 { convex: true, calls: [entity.findByName] } (-1),
      // MeshCollider block 2 { isTrigger: true } (+1).
      const outerPrefab = await PrefabParser.parse(engine, "test://r5-phase-outer.prefab", {
        version: "2.0",
        refs: [{ url: "test://r5-phase-base.prefab", type: "Prefab" }],
        entities: [
          {
            instance: {
              asset: 0,
              overrides: {
                componentProps: [
                  {
                    path: [],
                    selector: { type: "Rigidbody", index: 0 },
                    props: { isKinematic: false }
                  },
                  {
                    path: [],
                    selector: { type: "MeshCollider", index: 0 },
                    props: { convex: true },
                    calls: [{ target: ["entity"], method: "findByName", args: ["missing"] }]
                  },
                  {
                    path: [],
                    selector: { type: "MeshCollider", index: 0 },
                    props: { isTrigger: true }
                  }
                ]
              }
            }
          }
        ],
        components: [],
        root: 0
      });

      const inst = outerPrefab.instantiate();
      root.addChild(inst);
      try {
        const rb = inst.getComponent(Rigidbody)!;
        const meshCol = inst.getComponent(MeshCollider)!;
        expect(rb.isKinematic).toBe(false);
        expect(meshCol.convex).toBe(true);
        expect(meshCol.isTrigger).toBe(true);
        expect(errors).not.toHaveBeenCalled();
        step(2);
        expect(errors).not.toHaveBeenCalled();
      } finally {
        inst.destroy();
      }
    } finally {
      for (const key of poolKeys) {
        // @ts-ignore
        delete engine.resourceManager._objectPool[key];
      }
    }
  });

  it("enforces Wave 0 base isolation, defers restricting base MeshCollider trigger into relaxing override (with/without calls), and prioritizes unblocking physics phases", async () => {
    class BaseConvexReader extends Script {
      readConvex = false;
      async readAsync(): Promise<void> {
        await Promise.resolve();
        this.readConvex = this.entity.getComponent(MeshCollider)!.convex;
      }
    }
    class AsyncPhaseBody extends Rigidbody {
      sawKinematicAtCall: boolean | null = null;
      async readPhase(): Promise<void> {
        await Promise.resolve();
        this.sawKinematicAtCall = this.isKinematic;
      }
    }
    Loader.registerClass("R6BaseConvexReader", BaseConvexReader);
    Loader.registerClass("R6AsyncPhaseBody", AsyncPhaseBody);

    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1, { keepMeshData: true });
    // @ts-ignore
    engine.resourceManager._objectPool["test://r6-phase.mesh"] = mesh;
    const poolKeys: string[] = ["test://r6-phase.mesh"];

    try {
      // 1. Wave 0 base calls must never observe Wave 1 relaxing MeshCollider overrides prematurely
      for (const inherited of [true, false]) {
        const baseKey = `test://r6-promoted-base-${inherited}.prefab`;
        const basePrefab = await PrefabParser.parse(engine, baseKey, {
          version: "2.0",
          refs: [],
          entities: [{ name: "root", components: inherited ? [0] : [] }],
          components: inherited ? [{ type: "MeshCollider" }] : [],
          root: 0
        });
        // @ts-ignore
        engine.resourceManager._objectPool[baseKey] = basePrefab;
        poolKeys.push(baseKey);

        const outerPrefab = await PrefabParser.parse(engine, `test://r6-promoted-outer-${inherited}.prefab`, {
          version: "2.0",
          refs: [{ url: baseKey, type: "Prefab" }],
          entities: [
            {
              instance: {
                asset: 0,
                overrides: {
                  addedComponents: inherited
                    ? [{ target: [], component: 0 }]
                    : [
                        { target: [], component: 0 },
                        { target: [], component: 1 }
                      ],
                  componentProps: [
                    {
                      path: [],
                      selector: { type: "MeshCollider", index: 0 },
                      props: { convex: true }
                    }
                  ]
                }
              }
            }
          ],
          components: [
            { type: "R6BaseConvexReader", calls: [{ method: "readAsync" }] },
            ...(inherited ? [] : [{ type: "MeshCollider", props: { convex: false } }])
          ],
          root: 0
        });
        const inst = outerPrefab.instantiate();
        try {
          expect(inst.getComponent(BaseConvexReader)!.readConvex).toBe(false);
          expect(inst.getComponent(MeshCollider)!.convex).toBe(true);
        } finally {
          inst.destroy();
        }
      }

      // 2. Added MeshCollider base { isTrigger: true, mesh } + override { convex: true } WITH or WITHOUT calls preserves isTrigger
      const emptyBaseKey = "test://r6-empty-base.prefab";
      const emptyBase = await PrefabParser.parse(engine, emptyBaseKey, {
        version: "2.0",
        refs: [],
        entities: [{ name: "template" }],
        components: [],
        root: 0
      });
      // @ts-ignore
      engine.resourceManager._objectPool[emptyBaseKey] = emptyBase;
      poolKeys.push(emptyBaseKey);

      for (const overrideHasCall of [false, true]) {
        const outerPrefab = await PrefabParser.parse(engine, `test://r6-lost-trigger-${overrideHasCall}.prefab`, {
          version: "2.0",
          refs: [
            { url: emptyBaseKey, type: "Prefab" },
            { url: "test://r6-phase.mesh", type: "ModelMesh" }
          ],
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
                      props: { convex: true },
                      ...(overrideHasCall
                        ? { calls: [{ target: ["entity"], method: "findByName", args: ["template"] }] }
                        : {})
                    }
                  ]
                }
              }
            }
          ],
          components: [{ type: "MeshCollider", props: { isTrigger: true, mesh: { $ref: 1 } } }],
          root: 0
        });
        const inst = outerPrefab.instantiate();
        try {
          const meshCol = inst.getComponent(MeshCollider)!;
          expect(meshCol.convex).toBe(true);
          expect(meshCol.isTrigger).toBe(true);
          expect(meshCol.mesh).toBe(mesh);
          expect(errors).not.toHaveBeenCalled();
        } finally {
          inst.destroy();
        }
      }

      // 3. Unblocking physics phase priority: PhaseBody [isKinematic=false + async readPhase, isKinematic=true] runs before MeshCollider [convex=false]
      const clampBaseKey = "test://r6-clamp-base.prefab";
      const clampBase = await PrefabParser.parse(engine, clampBaseKey, {
        version: "2.0",
        refs: [{ url: "test://r6-phase.mesh", type: "ModelMesh" }],
        entities: [{ name: "template", components: [0, 1] }],
        components: [
          { type: "R6AsyncPhaseBody", props: { isKinematic: true, useGravity: false } },
          { type: "MeshCollider", props: { convex: true, mesh: { $ref: 0 } } }
        ],
        root: 0
      });
      // @ts-ignore
      engine.resourceManager._objectPool[clampBaseKey] = clampBase;
      poolKeys.push(clampBaseKey);

      const clampOuter = await PrefabParser.parse(engine, "test://r6-clamp-outer.prefab", {
        version: "2.0",
        refs: [{ url: clampBaseKey, type: "Prefab" }],
        entities: [
          {
            instance: {
              asset: 0,
              overrides: {
                componentProps: [
                  {
                    path: [],
                    selector: { type: "R6AsyncPhaseBody", index: 0 },
                    props: { isKinematic: false },
                    calls: [{ method: "readPhase" }]
                  },
                  {
                    path: [],
                    selector: { type: "R6AsyncPhaseBody", index: 0 },
                    props: { isKinematic: true }
                  },
                  {
                    path: [],
                    selector: { type: "MeshCollider", index: 0 },
                    props: { convex: false }
                  }
                ]
              }
            }
          }
        ],
        components: [],
        root: 0
      });
      const clampInst = clampOuter.instantiate();
      try {
        const body = clampInst.getComponent(AsyncPhaseBody)!;
        const meshCol = clampInst.getComponent(MeshCollider)!;
        expect(body.sawKinematicAtCall).toBe(false);
        expect(body.isKinematic).toBe(true);
        expect(meshCol.convex).toBe(false);
        expect(errors).not.toHaveBeenCalled();
      } finally {
        clampInst.destroy();
      }
    } finally {
      for (const key of poolKeys) {
        // @ts-ignore
        delete engine.resourceManager._objectPool[key];
      }
    }
  });

  it("removes BoxCollider from PhysX raycast on subtree detach/clear/fail-fast transfer and keeps attachedRigidbody consistent on rollback", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    // 1. Subtree deactivation with removeChild, clearChildren, fail-fast cross-scene transfer, and direct transfer
    const inactiveDst = new Scene(engine, "inactive-physics-dst");
    try {
      const modes = ["remove", "clear", "transfer", "direct transfer"] as const;
      for (let i = 0; i < modes.length; i++) {
        const mode = modes[i];
        const x = i * 4;
        const ray = new Ray(new Vector3(x, 3, 0), new Vector3(0, -1, 0));
        const parent = root.createChild(`detach-parent-${mode}`);
        const child = parent.createChild(`detach-child-${mode}`);
        child.transform.position.x = x;
        child.addComponent(
          class extends Script {
            override onDisable(): void {
              if (mode === "remove") parent.removeChild(child);
              else if (mode === "clear") parent.clearChildren();
              else if (mode === "transfer") inactiveDst.addRootEntity(child);
            }
          }
        );
        child.addComponent(BoxCollider);

        expect(scene.physics.raycast(ray, 10)).toBe(true);
        if (mode === "transfer") {
          expect(() => {
            parent.isActive = false;
          }).toThrow();
          expect(scene.physics.raycast(ray, 10)).toBe(false);
          expect(inactiveDst.physics.raycast(ray, 10)).toBe(false);
          expect(child.scene).toBe(scene);
        } else if (mode === "direct transfer") {
          expect(() => {
            inactiveDst.addRootEntity(child);
          }).not.toThrow();
          expect(scene.physics.raycast(ray, 10)).toBe(false);
          expect(inactiveDst.physics.raycast(ray, 10)).toBe(true);
          expect(child.scene).toBe(inactiveDst);
        } else {
          expect(() => {
            parent.isActive = false;
          }).not.toThrow();
          expect(scene.physics.raycast(ray, 10)).toBe(false);
          expect(inactiveDst.physics.raycast(ray, 10)).toBe(false);
          expect(child.isActiveInHierarchy).toBe(false);
          expect(child.parent).toBeNull();
          expect(child.scene).toBeNull();
        }
        parent.destroy();
        if (!child.destroyed) child.destroy();
      }
    } finally {
      if (!inactiveDst.destroyed) inactiveDst.destroy();
    }

    // 2. Collider.attachedRigidbody agrees across beforeQuery, afterQuery, and disabled in both normal and injected addShape rejection
    for (const injected of [false, true]) {
      errors.mockClear();
      const moving = root.createChild(`reject-moving-${injected}`);
      moving.transform.position.x = 4;
      const collider = moving.addComponent(BoxCollider);
      const bodyEntity = root.createChild(`reject-body-${injected}`);
      bodyEntity.transform.position.x = 4;
      const body = bodyEntity.addComponent(Rigidbody);
      body.isKinematic = true;

      const oldRay = new Ray(new Vector3(4, 3, 0), new Vector3(0, -1, 0));
      const newRay = new Ray(new Vector3(8, 3, 0), new Vector3(0, -1, 0));
      expect(scene.physics.raycast(oldRay, 10)).toBe(true);

      const nativeActor = body._getNativeActor();
      const origAddShape = nativeActor.addShape.bind(nativeActor);
      let rejectOnce = injected;
      nativeActor.addShape = (shape: any) => {
        if (rejectOnce) {
          rejectOnce = false;
          return false;
        }
        return origAddShape(shape);
      };
      try {
        bodyEntity.addChild(moving);
        // Pure getter reads hierarchy before sync without side effects
        expect(collider.attachedRigidbody).toBe(body);
        expect(scene.physics.raycast(oldRay, 10)).toBe(false);
        expect(scene.physics.raycast(newRay, 10)).toBe(true);
        const afterQuery = collider.attachedRigidbody === body;
        collider.enabled = false;
        const disabled = collider.attachedRigidbody === body;

        expect(afterQuery).toBe(!injected);
        expect(disabled).toBe(!injected);
        expect(moving.transform.worldPosition.x).toBeCloseTo(8, 5);
        if (injected) {
          expect(errors).toHaveBeenCalledWith(
            "BoxCollider: failed to attach to the native actor, the previous registration is kept."
          );
        } else {
          expect(errors).not.toHaveBeenCalled();
        }
      } finally {
        nativeActor.addShape = origAddShape;
        bodyEntity.destroy();
      }
    }

    // 3. Ancestor detach / cross-scene transfer while descendant subtree deactivates removes BoxCollider from PhysX cleanly
    const ancDst = new Scene(engine, "ancestor-physics-dst");
    try {
      for (const mode of ["detach-root", "detach-child", "transfer-root"] as const) {
        const outer = scene.createRootEntity(`anc-outer-${mode}`);
        const group = outer.createChild("group");
        const parent = group.createChild("parent");
        const child = parent.createChild("child");
        child.addComponent(
          class extends Script {
            override onDisable(): void {
              if (mode === "detach-root") scene.removeRootEntity(outer);
              else if (mode === "detach-child") outer.removeChild(group);
              else if (mode === "transfer-root") ancDst.addRootEntity(outer);
            }
          }
        );
        child.addComponent(BoxCollider);
        const ray = new Ray(new Vector3(0, 3, 0), new Vector3(0, -1, 0));
        expect(scene.physics.raycast(ray, 10)).toBe(true);
        expect(() => {
          parent.isActive = false;
        }).toThrow();
        expect(scene.physics.raycast(ray, 10)).toBe(false);
        expect(ancDst.physics.raycast(ray, 10)).toBe(false);
        expect(child.scene).toBe(mode === "transfer-root" ? scene : null);
        if (!outer.destroyed) outer.destroy();
        if (!group.destroyed) group.destroy();
      }
    } finally {
      if (!ancDst.destroyed) ancDst.destroy();
    }

    // 4. Cross-scene A -> B rollback cleanup: moving A to another scene never carries src's collider into dst or leaves cross-scene attachedRigidbody
    for (const mode of ["normal", "active", "disabled", "new-parent"] as const) {
      errors.mockClear();
      const rbDst = new Scene(engine, `rollback-dst-${mode}`);
      const a = scene.createRootEntity(`rb-a-${mode}`);
      const b = scene.createRootEntity(`rb-b-${mode}`);
      try {
        const priorBody = a.addComponent(Rigidbody);
        priorBody.isKinematic = true;
        const desiredBody = b.addComponent(Rigidbody);
        desiredBody.isKinematic = true;
        const child = a.createChild("child");
        const box = child.addComponent(BoxCollider);
        const ray = new Ray(new Vector3(0, 3, 0), new Vector3(0, -1, 0));
        expect(scene.physics.raycast(ray, 10)).toBe(true);

        const desiredNative = desiredBody._getNativeActor();
        const origAdd = desiredNative.addShape.bind(desiredNative);
        let failOnce = mode !== "normal";
        desiredNative.addShape = (shape: any) => {
          if (failOnce) {
            failOnce = false;
            return false;
          }
          return origAdd(shape);
        };
        try {
          b.addChild(child);
          expect(box.attachedRigidbody).toBe(desiredBody);
          scene.physics.raycast(ray, 10);
          expect(box.attachedRigidbody).toBe(mode === "normal" ? desiredBody : priorBody);

          if (mode === "disabled" || mode === "new-parent") {
            box.enabled = false;
          }
          if (mode === "new-parent") {
            child.parent = null;
            b.addChild(child);
          }
          expect(box.attachedRigidbody).toBe(mode === "normal" || mode === "new-parent" ? desiredBody : priorBody);

          rbDst.addRootEntity(a);
          const hit = new HitResult();
          expect(rbDst.physics.raycast(ray, 10, hit)).toBe(false);
          expect(hit.collider).toBeNull();
          expect(box.attachedRigidbody).toBe(desiredBody);
          expect(box.attachedRigidbody?.scene).toBe(box.scene);
        } finally {
          desiredNative.addShape = origAdd;
        }
      } finally {
        if (!a.destroyed) a.destroy();
        if (!b.destroyed) b.destroy();
        if (!rbDst.destroyed) rbDst.destroy();
      }
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
      child.addComponent(
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

  it("defers only unindexed MeshCollider mesh onto convex override while keeping indexed mesh visible in Wave 0, preserves deactivation tracking across ancestor reparenting, and invalidates rollback cache across any parent-chain mutation", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const vertexOnlyMesh = new ModelMesh(engine);
    vertexOnlyMesh.setPositions([
      new Vector3(0, 1, 0),
      new Vector3(-1, 0, -1),
      new Vector3(1, 0, -1),
      new Vector3(0, 0, 1)
    ]);
    const indexedMesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1, { keepMeshData: true });
    const meshKey = "r8-vertex-only.mesh";
    const indexedKey = "r9-indexed.mesh";
    const baseKey = "r8-mesh-defer-base.prefab";
    // @ts-ignore
    engine.resourceManager._objectPool[meshKey] = vertexOnlyMesh;
    // @ts-ignore
    engine.resourceManager._objectPool[indexedKey] = indexedMesh;
    const basePrefab = await PrefabParser.parse(engine, baseKey, {
      version: "2.0",
      refs: [],
      entities: [{ name: "base" }],
      components: [],
      root: 0
    });
    // @ts-ignore
    engine.resourceManager._objectPool[baseKey] = basePrefab;

    class Wave0MeshObserver extends Script {
      observedMesh: ModelMesh | null = null;
      observedConvex: boolean | null = null;
      observe(): void {
        const collider = this.entity.getComponent(MeshCollider)!;
        this.observedMesh = collider.mesh;
        this.observedConvex = collider.convex;
      }
    }
    Loader.registerClass("R9Wave0MeshObserver", Wave0MeshObserver);

    try {
      // 1. Vertex-only ModelMesh is deferred alongside isTrigger when Wave 1 enables convex
      const outerPrefab = await PrefabParser.parse(engine, "r8-mesh-defer-outer.prefab", {
        version: "2.0",
        refs: [{ url: baseKey }, { url: meshKey }],
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
        components: [{ type: "MeshCollider", props: { mesh: { $ref: 1 }, isTrigger: true } }],
        root: 0
      });
      const inst = outerPrefab.instantiate();
      root.addChild(inst);
      try {
        const meshCollider = inst.getComponent(MeshCollider)!;
        expect(meshCollider.convex).toBe(true);
        expect(meshCollider.isTrigger).toBe(true);
        expect(meshCollider.mesh).toBe(vertexOnlyMesh);
        expect(scene.physics.raycast(new Ray(new Vector3(0, 3, 0), new Vector3(0, -1, 0)), 10)).toBe(true);
        expect(errors).not.toHaveBeenCalled();
      } finally {
        inst.destroy();
      }

      // 2. Indexed ModelMesh is assigned in Wave 0 (visible to sibling base observer) even when Wave 1 enables convex
      for (const overrideConvex of [false, true]) {
        const indexedOuter = await PrefabParser.parse(engine, `r9-indexed-outer-${overrideConvex}.prefab`, {
          version: "2.0",
          refs: [{ url: baseKey }, { url: indexedKey }],
          entities: [
            {
              instance: {
                asset: 0,
                overrides: {
                  addedComponents: [
                    { target: [], component: 0 },
                    { target: [], component: 1 }
                  ],
                  ...(overrideConvex
                    ? {
                        componentProps: [
                          { path: [], selector: { type: "MeshCollider", index: 0 }, props: { convex: true } }
                        ]
                      }
                    : {})
                }
              }
            }
          ],
          components: [
            { type: "MeshCollider", props: { mesh: { $ref: 1 } } },
            { type: "R9Wave0MeshObserver", calls: [{ method: "observe" }] }
          ],
          root: 0
        });
        const indexedInst = indexedOuter.instantiate();
        root.addChild(indexedInst);
        try {
          const observer = indexedInst.getComponent(Wave0MeshObserver)!;
          const meshCollider = indexedInst.getComponent(MeshCollider)!;
          expect(observer.observedMesh).toBe(indexedMesh);
          expect(observer.observedConvex).toBe(false);
          expect(meshCollider.mesh).toBe(indexedMesh);
          expect(meshCollider.convex).toBe(overrideConvex);
          expect(scene.physics.raycast(new Ray(new Vector3(0, 3, 0), new Vector3(0, -1, 0)), 10)).toBe(true);
          expect(errors).not.toHaveBeenCalled();
        } finally {
          indexedInst.destroy();
        }
      }

      // 3. Dynamic ancestor deactivation weight conservation: reparenting a deactivating subtree onto a new ancestor
      //    then detaching or cross-scene transferring that new ancestor cleanly removes BoxCollider from PhysX
      const reparentCases: Array<{ action: "none" | "detach" | "transfer"; reparent: boolean }> = [
        { action: "none", reparent: true },
        { action: "detach", reparent: false },
        { action: "transfer", reparent: false },
        { action: "detach", reparent: true },
        { action: "transfer", reparent: true }
      ];
      for (const { action, reparent } of reparentCases) {
        const dstScene = new Scene(engine, `r9-reparent-dst-${action}-${reparent}`);
        const oldAncestor = scene.createRootEntity(`r9-old-anc-${action}-${reparent}`);
        const newAncestor = scene.createRootEntity(`r9-new-anc-${action}-${reparent}`);
        const parent = oldAncestor.createChild("parent");
        const child = parent.createChild("child");
        let disables = 0;
        let updatesAfterDisable = 0;
        child.addComponent(
          class extends Script {
            override onDisable(): void {
              disables++;
              if (reparent) {
                newAncestor.addChild(parent);
              }
              const targetAncestor = reparent ? newAncestor : oldAncestor;
              if (action === "detach") {
                scene.removeRootEntity(targetAncestor);
              } else if (action === "transfer") {
                dstScene.addRootEntity(targetAncestor);
              }
            }
            override onUpdate(): void {
              if (disables > 0) updatesAfterDisable++;
            }
          }
        );
        child.addComponent(BoxCollider);
        const ray = new Ray(new Vector3(0, 3, 0), new Vector3(0, -1, 0));
        try {
          expect(scene.physics.raycast(ray, 10)).toBe(true);
          if (action === "transfer") {
            expect(() => {
              parent.isActive = false;
            }).toThrow("Cannot transfer an entity to another scene while it is processing active state changes.");
          } else if (action === "detach") {
            expect(() => {
              parent.isActive = false;
            }).toThrow("Cannot detach an entity from its scene while it is processing active state changes.");
          } else {
            expect(() => {
              parent.isActive = false;
            }).not.toThrow();
          }
          expect(disables).toBe(1);
          expect(scene.physics.raycast(ray, 10)).toBe(false);
          expect(dstScene.physics.raycast(ray, 10)).toBe(false);
          expect(child.scene).toBe(action === "detach" ? null : scene);
          step(1);
          expect(updatesAfterDisable).toBe(0);
          expect(errors).not.toHaveBeenCalled();
        } finally {
          if (!oldAncestor.destroyed) oldAncestor.destroy();
          if (!newAncestor.destroyed) newAncestor.destroy();
          if (!parent.destroyed) parent.destroy();
          if (!dstScene.destroyed) dstScene.destroy();
        }
      }

      // 4. Collision-free rollback parent-chain invalidation: reparenting an ancestor across parents with different
      //    prior attachment counts still invalidates the disabled collider's failed-transfer cache
      for (const extraParentAttachment of [false, true]) {
        errors.mockClear();
        const oldBodyEntity = root.createChild(`r9-rb-old-${extraParentAttachment}`);
        const oldBody = oldBodyEntity.addComponent(Rigidbody);
        oldBody.isKinematic = true;
        const targetEntity = root.createChild(`r9-rb-target-${extraParentAttachment}`);
        const targetBody = targetEntity.addComponent(Rigidbody);
        targetBody.isKinematic = true;
        const firstParent = targetEntity.createChild("firstParent");
        const secondParent = targetEntity.createChild("secondParent");
        if (extraParentAttachment) {
          const tempHost = root.createChild("tempHost");
          tempHost.addChild(firstParent);
          targetEntity.addChild(firstParent);
          tempHost.destroy();
        }
        const mid = oldBodyEntity.createChild("mid");
        const leaf = mid.createChild("leaf");
        const box = leaf.addComponent(BoxCollider);
        const ray = new Ray(new Vector3(0, 3, 0), new Vector3(0, -1, 0));
        const targetNative = targetBody._getNativeActor();
        const origAddShape = targetNative.addShape.bind(targetNative);
        let rejectOnce = true;
        targetNative.addShape = (shape: any) => {
          if (rejectOnce) {
            rejectOnce = false;
            return false;
          }
          return origAddShape(shape);
        };
        try {
          expect(scene.physics.raycast(ray, 10)).toBe(true);
          firstParent.addChild(mid);
          scene.physics.raycast(ray, 10);
          expect(box.attachedRigidbody).toBe(oldBody);

          box.enabled = false;
          expect(box.attachedRigidbody).toBe(oldBody);

          secondParent.addChild(mid);
          expect(box.attachedRigidbody).toBe(targetBody);
          expect(scene.physics.raycast(ray, 10)).toBe(false);

          box.enabled = true;
          expect(scene.physics.raycast(ray, 10)).toBe(true);
          expect(box.attachedRigidbody).toBe(targetBody);
        } finally {
          targetNative.addShape = origAddShape;
          oldBodyEntity.destroy();
          targetEntity.destroy();
        }
      }
    } finally {
      errors.mockRestore();
      vertexOnlyMesh.destroy();
      indexedMesh.destroy();
      // @ts-ignore
      delete engine.resourceManager._objectPool[meshKey];
      // @ts-ignore
      delete engine.resourceManager._objectPool[indexedKey];
      // @ts-ignore
      delete engine.resourceManager._objectPool[baseKey];
    }
  });

  it("defers native physics teardown during out-of-frame scene.destroy() in onDisable, drains all roots across errors/reorders on scene disable, and handles line/inaccessible/base-call/replace MeshCollider prefab overrides", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const ray = new Ray(new Vector3(0, 5, 0), new Vector3(0, -1, 0));

    // 1. Out-of-frame synchronous source.destroy() during onDisable keeps sibling Script/BoxCollider cleanup intact
    for (const mode of ["root", "child"] as const) {
      for (const withContact of [true, false]) {
        const src = new Scene(engine, `r10-src-${mode}-${withContact}`);
        const dst = new Scene(engine, `r10-dst-${mode}-${withContact}`);
        engine.sceneManager.addScene(src);
        const parent = src.createRootEntity("parent");
        const node = mode === "child" ? parent.createChild("detached-node") : parent;
        const leaf = node.createChild("leaf");
        let beforeDestroy = true;
        let afterDestroy = false;
        let disables = 0;
        node.addComponent(
          class extends Script {
            override onDisable(): void {
              beforeDestroy = src.destroyed;
              src.destroy();
              afterDestroy = src.destroyed;
            }
          }
        );
        if (withContact) {
          node.addComponent(
            class extends Script {
              override onCollisionEnter(): void {}
              override onDisable(): void {
                disables++;
              }
            }
          );
        } else {
          node.addComponent(
            class extends Script {
              override onDisable(): void {
                disables++;
              }
            }
          );
        }
        node.addComponent(BoxCollider);

        try {
          const hitBefore = new HitResult();
          expect(src.physics.raycast(ray, 10, hitBefore)).toBe(true);
          expect(hitBefore.entity).toBe(node);
          expect(() => {
            if (mode === "child") parent.removeChild(node);
            else src.removeRootEntity(node);
          }).not.toThrow();
          expect(beforeDestroy).toBe(false);
          expect(afterDestroy).toBe(true);
          expect(disables).toBe(1);
          expect(node.scene).toBeNull();
          expect(leaf.scene).toBeNull();

          dst.addRootEntity(node);
          const hitAfter = new HitResult();
          expect(dst.physics.raycast(ray, 10, hitAfter)).toBe(true);
          expect(hitAfter.entity).toBe(node);
          expect(leaf.scene).toBe(dst);
        } finally {
          if (!node.destroyed) node.destroy();
          if (!src.destroyed) src.destroy();
          if (!dst.destroyed) dst.destroy();
        }
      }
    }

    // 2. Scene.isActive = false continues deactivating all remaining roots across callback errors and root reorders
    for (const action of ["transfer-child", "remove-child", "throw-and-continue", "reorder-roots"] as const) {
      const src = new Scene(engine, `r10-disable-src-${action}`);
      const dst = new Scene(engine, `r10-disable-dst-${action}`);
      engine.sceneManager.addScene(src);
      const first = src.createRootEntity("first");
      const second = src.createRootEntity("second");
      const moving = second.createChild("moving");
      const leaf = moving.createChild("leaf");
      leaf.addComponent(BoxCollider);
      let firstDisabled = 0;
      let secondDisabled = 0;
      first.addComponent(
        class extends Script {
          override onDisable(): void {
            firstDisabled++;
          }
        }
      );
      moving.addComponent(
        class extends Script {
          override onDisable(): void {
            if (action === "transfer-child") dst.addRootEntity(moving);
            else if (action === "remove-child") second.removeChild(moving);
            else if (action === "throw-and-continue") throw new Error("user onDisable error");
            else if (action === "reorder-roots") second.siblingIndex = 0;
          }
        }
      );
      moving.addComponent(
        class extends Script {
          override onDisable(): void {
            secondDisabled++;
          }
        }
      );

      try {
        expect(src.physics.raycast(ray, 10)).toBe(true);
        if (action === "transfer-child" || action === "throw-and-continue") {
          expect(() => {
            src.isActive = false;
          }).toThrow();
        } else {
          expect(() => {
            src.isActive = false;
          }).not.toThrow();
        }
        expect(first.isActiveInHierarchy).toBe(false);
        expect(firstDisabled).toBe(1);
        expect(secondDisabled).toBe(1);
        if (action === "remove-child") {
          expect(moving.scene).toBeNull();
          expect(src.physics.raycast(ray, 10)).toBe(false);
        } else if (action === "transfer-child") {
          expect(moving.scene).toBe(src);
          expect(moving.parent).toBe(second);
          expect(dst.physics.raycast(ray, 10)).toBe(false);
        }
      } finally {
        if (!moving.destroyed) moving.destroy();
        if (!src.destroyed) src.destroy();
        if (!dst.destroyed) dst.destroy();
      }
    }

    // 3. MeshCollider line-indexed mesh, inaccessible base replaced by override, innocuous base call, and same-block convex=false replacement
    const verticesMesh = new ModelMesh(engine);
    verticesMesh.setPositions([
      new Vector3(0, 1, 0),
      new Vector3(-1, 0, -1),
      new Vector3(1, 0, -1),
      new Vector3(0, 0, 1)
    ]);
    const lineMesh = new ModelMesh(engine);
    lineMesh.setPositions([new Vector3(0, 1, 0), new Vector3(-1, 0, -1), new Vector3(1, 0, -1), new Vector3(0, 0, 1)]);
    lineMesh.setIndices(new Uint16Array([0, 1]));
    lineMesh.addSubMesh(0, 2, MeshTopology.Lines);
    const indexedMesh = new ModelMesh(engine);
    indexedMesh.setPositions([
      new Vector3(0, 1, 0),
      new Vector3(-1, 0, -1),
      new Vector3(1, 0, -1),
      new Vector3(0, 0, 1)
    ]);
    indexedMesh.setIndices(new Uint16Array([0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2]));
    indexedMesh.addSubMesh(0, 12, MeshTopology.Triangles);
    const inaccessibleMesh = new ModelMesh(engine);
    inaccessibleMesh.setPositions([
      new Vector3(0, 1, 0),
      new Vector3(-1, 0, -1),
      new Vector3(1, 0, -1),
      new Vector3(0, 0, 1)
    ]);
    inaccessibleMesh.setIndices(new Uint16Array([0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2]));
    inaccessibleMesh.addSubMesh(0, 12, MeshTopology.Triangles);
    inaccessibleMesh.uploadData(true);

    const poolKeys: string[] = [
      "r10-vertices.mesh",
      "r10-line.mesh",
      "r10-indexed.mesh",
      "r10-inaccessible.mesh",
      "r10-empty-base.prefab"
    ];
    // @ts-ignore
    engine.resourceManager._objectPool["r10-vertices.mesh"] = verticesMesh;
    // @ts-ignore
    engine.resourceManager._objectPool["r10-line.mesh"] = lineMesh;
    // @ts-ignore
    engine.resourceManager._objectPool["r10-indexed.mesh"] = indexedMesh;
    // @ts-ignore
    engine.resourceManager._objectPool["r10-inaccessible.mesh"] = inaccessibleMesh;

    const emptyBase = await PrefabParser.parse(engine, "r10-empty-base.prefab", {
      version: "2.0",
      refs: [],
      entities: [{ name: "root" }],
      components: [],
      root: 0
    });
    // @ts-ignore
    engine.resourceManager._objectPool["r10-empty-base.prefab"] = emptyBase;

    const observations: string[] = [];
    class BaseCallSnapshotMesh extends MeshCollider {
      capture(phase: string): void {
        observations.push(`${phase}:${!!this.mesh}:${this.convex}`);
      }
    }
    Loader.registerClass("R10BaseCallSnapshotMesh", BaseCallSnapshotMesh);

    try {
      // 3a. Line-indexed mesh defers cleanly to convex: true override
      const lineOuter = await PrefabParser.parse(engine, "r10-line-outer.prefab", {
        version: "2.0",
        refs: [{ url: "r10-empty-base.prefab" }, { url: "r10-line.mesh" }],
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
      const lineInst = lineOuter.instantiate();
      root.addChild(lineInst);
      try {
        const mc = lineInst.getComponent(MeshCollider)!;
        expect(mc.convex).toBe(true);
        expect(mc.mesh).toBe(lineMesh);
        expect(scene.physics.raycast(ray, 10)).toBe(true);
      } finally {
        lineInst.destroy();
      }

      // 3b. Inaccessible base mesh replaced by vertices mesh in convex: true override does not throw
      const replacedOuter = await PrefabParser.parse(engine, "r10-inaccessible-replace.prefab", {
        version: "2.0",
        refs: [{ url: "r10-empty-base.prefab" }, { url: "r10-inaccessible.mesh" }, { url: "r10-vertices.mesh" }],
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
                    props: { convex: true, mesh: { $ref: 2 } }
                  }
                ]
              }
            }
          }
        ],
        components: [{ type: "MeshCollider", props: { mesh: { $ref: 1 } } }],
        root: 0
      });
      const replacedInst = replacedOuter.instantiate();
      root.addChild(replacedInst);
      try {
        const mc = replacedInst.getComponent(MeshCollider)!;
        expect(mc.convex).toBe(true);
        expect(mc.mesh).toBe(verticesMesh);
        expect(scene.physics.raycast(ray, 10)).toBe(true);
      } finally {
        replacedInst.destroy();
      }

      // 3c. Innocuous base call on added MeshCollider preserves deferred vertices mesh while keeping indexed mesh in Wave 0
      for (const kind of ["vertices", "indexed"] as const) {
        observations.length = 0;
        const callOuter = await PrefabParser.parse(engine, `r10-base-call-${kind}.prefab`, {
          version: "2.0",
          refs: [{ url: "r10-empty-base.prefab" }, { url: `r10-${kind}.mesh` }],
          entities: [
            {
              instance: {
                asset: 0,
                overrides: {
                  addedComponents: [{ target: [], component: 0 }],
                  componentProps: [
                    {
                      path: [],
                      selector: { type: "R10BaseCallSnapshotMesh", index: 0 },
                      props: { convex: true },
                      calls: [{ method: "capture", args: ["override"] }]
                    }
                  ]
                }
              }
            }
          ],
          components: [
            {
              type: "R10BaseCallSnapshotMesh",
              props: { mesh: { $ref: 1 } },
              calls: [{ method: "capture", args: ["base"] }]
            }
          ],
          root: 0
        });
        const callInst = callOuter.instantiate();
        root.addChild(callInst);
        try {
          expect(observations).toEqual([`base:${kind === "indexed"}:false`, "override:true:true"]);
          expect(scene.physics.raycast(ray, 10)).toBe(true);
        } finally {
          callInst.destroy();
        }
      }

      // 3d. Same-block { mesh: indexedMesh, convex: false, isTrigger: false } replacing vertex-only convex mesh
      for (const policy of ["static", "kinematic", "dynamic-to-kinematic"] as const) {
        const hasBody = policy !== "static";
        const path = hasBody ? [0] : [];
        const baseKey = `r10-replace-base-${policy}.prefab`;
        poolKeys.push(baseKey);
        const switchBase = await PrefabParser.parse(engine, baseKey, {
          version: "2.0",
          refs: [{ url: "r10-vertices.mesh" }],
          entities: hasBody
            ? [
                { name: "body", components: [1], children: [1] },
                { name: "mesh", components: [0] }
              ]
            : [{ name: "mesh", components: [0] }],
          components: [
            { type: "MeshCollider", props: { convex: true, mesh: { $ref: 0 }, isTrigger: true } },
            ...(hasBody ? [{ type: "Rigidbody", props: { isKinematic: policy !== "dynamic-to-kinematic" } }] : [])
          ],
          root: 0
        });
        // @ts-ignore
        engine.resourceManager._objectPool[baseKey] = switchBase;

        const componentProps: any[] = [
          {
            path,
            selector: { type: "MeshCollider", index: 0 },
            props: { mesh: { $ref: 1 }, convex: false, isTrigger: false }
          }
        ];
        if (policy === "dynamic-to-kinematic") {
          componentProps.push({
            path: [],
            selector: { type: "Rigidbody", index: 0 },
            props: { isKinematic: true }
          });
        }
        const switchOuter = await PrefabParser.parse(engine, `r10-replace-outer-${policy}.prefab`, {
          version: "2.0",
          refs: [{ url: baseKey }, { url: "r10-indexed.mesh" }],
          entities: [{ instance: { asset: 0, overrides: { componentProps } } }],
          components: [],
          root: 0
        });
        const switchInst = switchOuter.instantiate();
        root.addChild(switchInst);
        try {
          const mc = (hasBody ? switchInst.children[0] : switchInst).getComponent(MeshCollider)!;
          expect(mc.mesh).toBe(indexedMesh);
          expect(mc.convex).toBe(false);
          expect(mc.isTrigger).toBe(false);
          if (hasBody) {
            expect(mc.attachedRigidbody?.isKinematic).toBe(true);
          }
          expect(scene.physics.raycast(ray, 10)).toBe(true);
        } finally {
          switchInst.destroy();
        }
      }

      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
      verticesMesh.destroy();
      lineMesh.destroy();
      indexedMesh.destroy();
      inaccessibleMesh.destroy();
      for (const key of poolKeys) {
        // @ts-ignore
        delete engine.resourceManager._objectPool[key];
      }
    }
  });

  it("handles target parent switching scene in onDisable, re-entrant scene active/destroy transitions, and atomic MeshCollider coupled deserialize commits", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const ray = new Ray(new Vector3(0, 5, 0), new Vector3(0, -1, 0));
    const hitEntity = (targetScene: Scene, x = 0): Entity | null => {
      const result = new HitResult();
      return targetScene.physics.raycast(new Ray(new Vector3(x, 5, 0), new Vector3(0, -1, 0)), 10, result)
        ? result.entity
        : null;
    };

    // 1. Target parent switches Scene during mover's onDisable inside Entity._setParent
    for (const moveDestination of [false, true]) {
      const src = new Scene(engine, `r11-src-${moveDestination}`);
      const dst = new Scene(engine, `r11-dst-${moveDestination}`);
      engine.sceneManager.addScene(src);
      engine.sceneManager.addScene(dst);
      const mover = src.createRootEntity("mover");
      const driver = src.createRootEntity("driver");
      const target = src.createRootEntity("target");
      const seen: string[] = [];
      let moved = false;
      mover.addComponent(BoxCollider);
      mover.addComponent(
        class extends Script {
          override onDisable(): void {
            if (!moved && moveDestination) {
              moved = true;
              dst.addRootEntity(target);
            }
          }
          override onUpdate(): void {
            seen.push(`update:${this.entity.isActiveInHierarchy}`);
          }
        }
      );
      driver.addComponent(
        class extends Script {
          override onDisable(): void {
            target.addChild(mover);
          }
        }
      );
      try {
        expect(hitEntity(src)).toBe(mover);
        expect(hitEntity(dst)).toBeNull();
        src.isActive = false;
        engine.update();
        expect(mover.parent).toBe(target);
        expect(mover.scene).toBe(moveDestination ? dst : src);
        expect(mover.isActiveInHierarchy).toBe(moveDestination);
        expect(hitEntity(src)).toBe(moveDestination ? null : mover);
        expect(hitEntity(dst)).toBe(moveDestination ? mover : null);
        expect(seen).toEqual(moveDestination ? ["update:true"] : []);
      } finally {
        if (!src.destroyed) src.destroy();
        if (!dst.destroyed) dst.destroy();
      }
    }

    // 2. Re-entrant scene active/remove/destroy callbacks keep all roots coherent with zero spurious re-entry throws
    for (const action of ["re-enable", "re-add", "disable", "remove", "destroy", "destroy-first"] as const) {
      const testScene = new Scene(engine, `r11-reenter-${action}`);
      engine.sceneManager.addScene(testScene);
      const first = testScene.createRootEntity("first");
      const second = testScene.createRootEntity("second");
      second.transform.position.x = 2;
      first.addComponent(BoxCollider);
      second.addComponent(BoxCollider);
      let armed = false;
      const callbackTarget = action === "destroy-first" ? first : second;
      callbackTarget.addComponent(
        class extends Script {
          override onEnable(): void {
            if (!armed || (action !== "disable" && action !== "remove")) return;
            armed = false;
            if (action === "disable") testScene.isActive = false;
            if (action === "remove") engine.sceneManager.removeScene(testScene);
          }
          override onDisable(): void {
            if (!armed || action === "disable" || action === "remove") return;
            armed = false;
            if (action === "re-enable") testScene.isActive = true;
            if (action === "re-add") engine.sceneManager.addScene(testScene);
            if (action === "destroy" || action === "destroy-first") testScene.destroy();
          }
        }
      );
      const enableEntry = action === "disable" || action === "remove";
      if (enableEntry) testScene.isActive = false;
      expect(hitEntity(testScene, 2)).toBe(second);
      armed = true;
      try {
        expect(() => {
          if (action === "re-add") engine.sceneManager.removeScene(testScene);
          else testScene.isActive = enableEntry;
        }).not.toThrow();
        const registered = engine.sceneManager.scenes.includes(testScene);
        if (action === "destroy" || action === "destroy-first") {
          expect(testScene.destroyed).toBe(true);
          expect(first.destroyed).toBe(true);
          expect(second.destroyed).toBe(true);
        } else {
          const expectedActive = testScene.isActive && registered;
          expect(first.isActiveInHierarchy).toBe(expectedActive);
          expect(second.isActiveInHierarchy).toBe(expectedActive);
        }
        expect(() => engine.update()).not.toThrow();
      } finally {
        if (!testScene.destroyed) testScene.destroy();
      }
    }

    // 3. Atomic MeshCollider coupled deserialize commits: 3-vertex triangle replacement, released-CPU cookingFlags, degenerate-tris convex fallback
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

    const poolKeys = [
      "r11-indexed.mesh",
      "r11-triangle.mesh",
      "r11-degenerate.mesh",
      "r11-releasable.mesh",
      "r11-empty-base.prefab",
      "r11-hull-base.prefab"
    ];
    // @ts-ignore
    engine.resourceManager._objectPool["r11-indexed.mesh"] = indexedMesh;
    // @ts-ignore
    engine.resourceManager._objectPool["r11-triangle.mesh"] = triangleMesh;
    // @ts-ignore
    engine.resourceManager._objectPool["r11-degenerate.mesh"] = degenerateMesh;
    // @ts-ignore
    engine.resourceManager._objectPool["r11-releasable.mesh"] = releasableMesh;

    const emptyBase = await PrefabParser.parse(engine, "r11-empty-base.prefab", {
      version: "2.0",
      refs: [],
      entities: [{ name: "root" }],
      components: [],
      root: 0
    });
    const hullBase = await PrefabParser.parse(engine, "r11-hull-base.prefab", {
      version: "2.0",
      refs: [{ url: "r11-indexed.mesh" }],
      entities: [{ name: "root", components: [0] }],
      components: [{ type: "MeshCollider", props: { convex: true, mesh: { $ref: 0 }, isTrigger: true } }],
      root: 0
    });
    // @ts-ignore
    engine.resourceManager._objectPool["r11-empty-base.prefab"] = emptyBase;
    // @ts-ignore
    engine.resourceManager._objectPool["r11-hull-base.prefab"] = hullBase;

    try {
      // 3a. Replace convex hull with 3-vertex coplanar triangle mesh + convex: false + isTrigger: false atomically
      const triOuter = await PrefabParser.parse(engine, "r11-tri-outer.prefab", {
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
      const flags = MeshColliderShapeCookingFlag.Cleaning;
      const flagsOuter = await PrefabParser.parse(engine, "r11-flags-outer.prefab", {
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

      // 3c. Degenerate triangle indices ([0, 0, 0]) rejected in Wave 0 recover cleanly when Wave 1 enables convex
      const degOuter = await PrefabParser.parse(engine, "r11-degenerate-outer.prefab", {
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
      for (const key of poolKeys) {
        // @ts-ignore
        delete engine.resourceManager._objectPool[key];
      }
    }
  });

  it("fails fast on same-scene inactive reparent in onEnable, handles Scene ABA toggles, and runs derived MeshCollider setters during coupled commits", async () => {
    // 1. Same-scene reparent to inactive (or not-yet-active) parent during onEnable fails fast without hang
    for (const targetInactive of [true, false]) {
      const testScene = new Scene(engine, `r12-reparent-${targetInactive}`);
      engine.sceneManager.addScene(testScene);
      try {
        testScene.isActive = false;
        const target = testScene.createRootEntity("target");
        target.isActive = !targetInactive;
        const moving = testScene.createRootEntity("moving");
        const caught: string[] = [];
        moving.addComponent(
          class extends Script {
            override onEnable(): void {
              try {
                target.addChild(this.entity);
              } catch (error) {
                caught.push(String(error));
              }
            }
          }
        );
        testScene.isActive = true;
        expect(caught.length).toBe(1);
        expect(caught[0]).toContain("main active entity");
        expect(moving.parent).toBeNull();
        expect(testScene.rootEntities).toContain(moving);
        expect(moving.isActiveInHierarchy).toBe(true);
      } finally {
        if (!testScene.destroyed) testScene.destroy();
      }
    }

    // 2. Scene ABA re-entrant isActive toggles converge for late-added roots in both directions
    for (const activate of [true, false]) {
      const abaScene = new Scene(engine, `r12-aba-${activate}`);
      engine.sceneManager.addScene(abaScene);
      try {
        const trigger = abaScene.createRootEntity("trigger");
        let late: Entity | undefined;
        let armed = false;
        const events: string[] = [];
        const toggleABA = () => {
          if (!armed) return;
          armed = false;
          abaScene.isActive = !activate;
          late = abaScene.createRootEntity("late");
          late.addComponent(
            class extends Script {
              override onEnable(): void {
                events.push("late-enable");
              }
              override onDisable(): void {
                events.push("late-disable");
              }
            }
          );
          abaScene.isActive = activate;
        };
        trigger.addComponent(
          class extends Script {
            override onEnable(): void {
              if (activate) toggleABA();
            }
            override onDisable(): void {
              if (!activate) toggleABA();
            }
          }
        );
        if (activate) abaScene.isActive = false;
        armed = true;
        abaScene.isActive = activate;

        expect(abaScene.isActive).toBe(activate);
        expect(trigger.isActiveInHierarchy).toBe(activate);
        expect(late!.isActiveInHierarchy).toBe(activate);
        expect(events).toEqual(activate ? ["late-enable"] : ["late-enable", "late-disable"]);
      } finally {
        if (!abaScene.destroyed) abaScene.destroy();
      }
    }

    // 2b. Normal scene.destroy() runs leaf onDisable before tearing down parent components, and
    //     destroying the entity or scene inside onEnable completes without a spurious detach error
    for (const action of ["scene-outside", "entity", "scene"] as const) {
      const destroyScene = new Scene(engine, `r12-destroy-${action}`);
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
              if (action === "scene-outside") {
                const tool = parent.getComponent(ParentTool);
                expect(tool).not.toBeNull();
                tool!.release();
              }
            }
          }
        );
        let armed = false;
        parent.addComponent(
          class extends Script {
            override onEnable(): void {
              if (!armed) return;
              armed = false;
              if (action === "scene") destroyScene.destroy();
              if (action === "entity") this.entity.destroy();
            }
          }
        );
        expect(() => {
          if (action === "scene-outside") {
            destroyScene.destroy();
          } else {
            destroyScene.isActive = false;
            armed = true;
            destroyScene.isActive = true;
          }
        }).not.toThrow();
        expect(parent.destroyed).toBe(true);
        expect(leaf.destroyed).toBe(true);
        expect(destroyScene.destroyed).toBe(action !== "entity");
        if (action === "scene-outside") {
          expect(events).toEqual(["released"]);
        }
      } finally {
        if (!destroyScene.destroyed) destroyScene.destroy();
      }
    }

    // 3. Derived MeshCollider subclass setter runs for both uncoupled and coupled commits, and rejected
    //    collinear triangle replacement retains the valid hull and raycast hit
    const tetraMesh = new ModelMesh(engine);
    tetraMesh.setPositions([new Vector3(0, 1, 0), new Vector3(-1, 0, -1), new Vector3(1, 0, -1), new Vector3(0, 0, 1)]);
    tetraMesh.setIndices(new Uint16Array([0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2]));
    tetraMesh.addSubMesh(0, 12, MeshTopology.Triangles);

    const collinearMesh = new ModelMesh(engine);
    collinearMesh.setPositions([new Vector3(-1, 0, 0), new Vector3(0, 0, 0), new Vector3(1, 0, 0)]);
    collinearMesh.setIndices(new Uint16Array([0, 1, 2]));
    collinearMesh.addSubMesh(0, 3, MeshTopology.Triangles);

    const poolKeys = ["r12-tetra.mesh", "r12-collinear.mesh", "r12-hull-base.prefab"];
    // @ts-ignore
    engine.resourceManager._objectPool["r12-tetra.mesh"] = tetraMesh;
    // @ts-ignore
    engine.resourceManager._objectPool["r12-collinear.mesh"] = collinearMesh;

    const ray = new Ray(new Vector3(0, 4, 0), new Vector3(0, -1, 0));
    try {
      for (const coupled of [false, true]) {
        const seen: string[] = [];
        class AuthoredMesh extends MeshCollider {
          override get convex(): boolean {
            return super.convex;
          }
          override set convex(value: boolean) {
            seen.push(`convex:${value}`);
            super.convex = value;
            this.contactOffset = 0.19;
          }
        }
        const typeName = `R12AuthoredMesh_${coupled}`;
        Loader.registerClass(typeName, AuthoredMesh);

        const resource = await PrefabParser.parse(engine, `r12-derived-${coupled}.prefab`, {
          version: "2.0",
          refs: [{ url: "r12-tetra.mesh" }],
          entities: [{ name: "root", components: [0] }],
          components: [
            {
              type: typeName,
              props: { convex: true, ...(coupled ? { mesh: { $ref: 0 }, isTrigger: true } : {}) }
            }
          ],
          root: 0
        });
        expect(seen).toEqual(["convex:true"]);
        const inst = resource.instantiate();
        root.addChild(inst);
        try {
          const mc = inst.getComponent(AuthoredMesh)!;
          expect(mc.convex).toBe(true);
          expect(mc.contactOffset).toBeCloseTo(0.19);
          expect(mc.isTrigger).toBe(coupled);
          expect(scene.physics.raycast(ray, 10)).toBe(coupled);
        } finally {
          inst.destroy();
        }
      }

      const hullBase = await PrefabParser.parse(engine, "r12-hull-base.prefab", {
        version: "2.0",
        refs: [{ url: "r12-tetra.mesh" }],
        entities: [{ name: "root", components: [0] }],
        components: [{ type: "MeshCollider", props: { convex: true, isTrigger: true, mesh: { $ref: 0 } } }],
        root: 0
      });
      // @ts-ignore
      engine.resourceManager._objectPool["r12-hull-base.prefab"] = hullBase;

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const rejectedOuter = await PrefabParser.parse(engine, "r12-collinear-outer.prefab", {
          version: "2.0",
          refs: [{ url: "r12-hull-base.prefab" }, { url: "r12-collinear.mesh" }],
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
                        cookingFlags: MeshColliderShapeCookingFlag.Cleaning,
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
          expect(mc.mesh).toBe(tetraMesh);
          expect(mc.isTrigger).toBe(false);
          expect(mc.cookingFlags).toBe(MeshColliderShapeCookingFlag.Cleaning);
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
      for (const key of poolKeys) {
        // @ts-ignore
        delete engine.resourceManager._objectPool[key];
      }
    }
  });
});
