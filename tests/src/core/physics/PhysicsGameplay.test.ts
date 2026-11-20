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
  HingeJoint,
  JointLimits,
  JointMotor,
  Loader,
  MeshCollider,
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

  it("removes BoxCollider from PhysX raycast on subtree detach during onDisable and rolls back pose & attachedRigidbody on native addShape failure", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    // 1. Subtree deactivation where child Script.onDisable detaches child must cleanly disable BoxCollider from PhysX
    const parent = root.createChild("detach-parent");
    const child = parent.createChild("detach-child");
    child.addComponent(
      class extends Script {
        override onDisable(): void {
          parent.removeChild(child);
        }
      }
    );
    child.addComponent(BoxCollider);

    const ray = new Ray(new Vector3(0, 3, 0), new Vector3(0, -1, 0));
    expect(scene.physics.raycast(ray, 10)).toBe(true);
    expect(() => {
      parent.isActive = false;
    }).not.toThrow();
    expect(scene.physics.raycast(ray, 10)).toBe(false);
    expect(child.isActiveInHierarchy).toBe(false);
    expect(child.parent).toBeNull();
    expect(child.scene).toBeNull();
    parent.destroy();
    child.destroy();

    // 2. Native addShape rejection during reparenting rolls back registration, updates rolled-back static pose, and reflects true attachedRigidbody
    const moving = root.createChild("reject-moving");
    moving.transform.position.x = 4;
    const collider = moving.addComponent(BoxCollider);
    const bodyEntity = root.createChild("reject-body");
    bodyEntity.transform.position.x = 4;
    const body = bodyEntity.addComponent(Rigidbody);
    body.isKinematic = true;

    const oldRay = new Ray(new Vector3(4, 3, 0), new Vector3(0, -1, 0));
    const newRay = new Ray(new Vector3(8, 3, 0), new Vector3(0, -1, 0));
    expect(scene.physics.raycast(oldRay, 10)).toBe(true);

    // Force native dynamic actor addShape to reject once
    const nativeActor = body._getNativeActor();
    const origAddShape = nativeActor.addShape.bind(nativeActor);
    let rejectOnce = true;
    nativeActor.addShape = (shape: any) => {
      if (rejectOnce) {
        rejectOnce = false;
        return false;
      }
      return origAddShape(shape);
    };
    try {
      bodyEntity.addChild(moving);
      expect(scene.physics.raycast(oldRay, 10)).toBe(false);
      expect(scene.physics.raycast(newRay, 10)).toBe(true);
      expect(collider.attachedRigidbody).toBeNull();
      expect(moving.transform.worldPosition.x).toBeCloseTo(8, 5);
      expect(errors).toHaveBeenCalledWith(
        "BoxCollider: failed to attach to the native actor, the previous registration is kept."
      );
    } finally {
      nativeActor.addShape = origAddShape;
      bodyEntity.destroy();
    }
  });
});
