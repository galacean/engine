import { createPhysics } from "../../utils/physics";
import {
  AnimationClip,
  AnimationQuaternionCurve,
  Camera,
  Engine,
  Entity,
  BoxCollider,
  FixedJoint,
  ForceMode,
  HingeJoint,
  HitResult,
  Rigidbody,
  RigidbodyConstraints,
  SphereCollider,
  Loader,
  MeshCollider,
  PhysicsMaterial,
  PlaneCollider,
  PrimitiveMesh,
  Scene,
  Script
} from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import { Quaternion, Ray, Vector3 } from "@galacean/engine-math";
import { CanvasRenderMode, HorizontalAlignmentMode, UICanvas, UITransform } from "@galacean/engine-ui";
import { vi, describe, beforeAll, afterAll, beforeEach, afterEach, expect, it } from "vitest";
import { PrefabParser } from "../../../../packages/loader/src/prefab/PrefabParser";

describe("Rigidbody", function () {
  let engine: Engine;
  let rootEntity: Entity;
  let backend: ReturnType<typeof createPhysics>;

  function addPlane(x: number, y: number, z: number) {
    const planeEntity = rootEntity.createChild("PlaneEntity");
    planeEntity.transform.setPosition(x, y, z);
    planeEntity.transform.setScale(20, 1, 20);

    const physicsPlane = planeEntity.addComponent(PlaneCollider);
    const material = new PhysicsMaterial(engine);
    material.dynamicFriction = 0;
    material.staticFriction = 0;
    physicsPlane.material = material;
    return planeEntity;
  }

  function addBox(cubeSize: Vector3, dynamic: boolean, pos: Vector3) {
    const boxEntity = rootEntity.createChild("BoxEntity");
    boxEntity.transform.setPosition(pos.x, pos.y, pos.z);

    const physicsBox = boxEntity.addComponent(BoxCollider);
    const material = new PhysicsMaterial(engine);
    material.dynamicFriction = 0;
    material.staticFriction = 0;
    physicsBox.material = material;
    physicsBox.size = cubeSize;
    if (dynamic) {
      const body = boxEntity.addComponent(Rigidbody);
      body.automaticCenterOfMass = false;
      body.automaticInertiaTensor = false;
    }
    return boxEntity;
  }

  function useFixedTimeStep(): number {
    const step = engine.sceneManager.activeScene.physics.fixedTimeStep;
    vi.spyOn(engine.time, "deltaTime", "get").mockReturnValue(step);
    return step;
  }

  function formatValue(value: number) {
    return Math.round(value * 100000) / 100000;
  }

  beforeAll(async function () {
    backend = createPhysics();
    engine = await WebGLEngine.create({
      canvas: document.createElement("canvas"),
      physics: backend
    });

    rootEntity = engine.sceneManager.activeScene.createRootEntity("root");
  });

  afterAll(() => engine.destroy());

  beforeEach(function () {
    while (rootEntity.children.length) {
      rootEntity.children[0].destroy();
    }
    engine.resourceManager.gc();
  });

  afterEach(() => vi.restoreAllMocks());

  it("linearDamping", function () {
    const box = addBox(new Vector3(2, 2, 2), true, new Vector3(0, 0, 0));
    addPlane(0, -1, 0);
    const boxCollider = box.getComponent(Rigidbody);
    boxCollider.linearVelocity = new Vector3(1, 0, 0);
    boxCollider.linearDamping = 0;
    expect(boxCollider.linearDamping).eq(0);

    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxCollider.linearVelocity.x)).eq(1);

    boxCollider.linearDamping = 0.1;
    expect(boxCollider.linearDamping).eq(0.1);
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxCollider.linearVelocity.x)).eq(0.90476);
  });

  it("angularDamping", function () {
    const box = addBox(new Vector3(2, 2, 2), true, new Vector3(0, 0, 0));
    addPlane(0, -1, 0);
    const boxCollider = box.getComponent(Rigidbody);
    boxCollider.angularVelocity = new Vector3(0, 1, 0);
    boxCollider.angularDamping = 0;
    expect(boxCollider.angularDamping).eq(0);

    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxCollider.angularVelocity.y)).eq(1);

    boxCollider.angularDamping = 0.1;
    expect(boxCollider.angularDamping).eq(0.1);
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxCollider.angularVelocity.y)).eq(0.90476);
  });

  it("linearVelocity", function () {
    const box = addBox(new Vector3(2, 2, 2), true, new Vector3(0, 0, 0));
    addPlane(0, -1, 0);
    const boxCollider = box.getComponent(Rigidbody);
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxCollider.linearVelocity.x)).eq(0);
    expect(formatValue(box.transform.position.x)).eq(0);

    boxCollider.linearVelocity = new Vector3(1, 0, 0);
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxCollider.linearVelocity.x)).eq(1);
    expect(formatValue(box.transform.position.x)).eq(1);
  });

  it("angularVelocity", function () {
    const box = addBox(new Vector3(2, 2, 2), true, new Vector3(0, 0, 0));
    addPlane(0, -1, 0);
    const boxCollider = box.getComponent(Rigidbody);
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxCollider.angularVelocity.y)).eq(0);
    expect(formatValue(box.transform.rotation.y)).eq(0);

    boxCollider.angularVelocity = new Vector3(0, Math.PI / 4, 0);
    boxCollider.angularDamping = 0;
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxCollider.angularVelocity.y).toBeCloseTo(Math.PI / 4, 6);
    expect(formatValue(box.transform.rotation.y)).closeTo(45, 0.0001);

    boxCollider.maxAngularVelocity = Math.PI / 8;
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxCollider.angularVelocity.y).toBeCloseTo(Math.PI / 8, 6);
  });

  it("keeps the simulated pose when alignment rederives the Entity's position", () => {
    const parent = rootEntity.createChild();
    parent.addComponent(UITransform);
    const entity = parent.createChild();
    const transform = entity.transform as UITransform;
    transform.horizontalAlignment = HorizontalAlignmentMode.Center;
    const collider = entity.addComponent(BoxCollider);
    const body = entity.addComponent(Rigidbody);
    body.useGravity = false;
    body.linearVelocity = new Vector3(120, 0, 0);

    const physics = engine.sceneManager.activeScene.physics;
    physics._update(physics.fixedTimeStep);
    expect(transform.worldPosition.x).toBe(0);

    const ray = new Ray(new Vector3(2, 0, -2), new Vector3(0, 0, 1));
    const hit = new HitResult();
    expect(physics.raycast(ray, 4, hit)).toBe(true);
    expect(hit.collider).toBe(collider);
    const center = body.getWorldCenterOfMass(new Vector3());
    expect(center.x).toBeCloseTo(2);
    body.applyForceAtPosition(new Vector3(0, 1, 0), center, ForceMode.Impulse);
    physics._update(physics.fixedTimeStep);
    expect(body.angularVelocity.z).toBeCloseTo(0);
  });

  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true]
  ])("keeps a camera-driven Canvas queryable after write-back (nested=%s, camera first=%s)", (nested, cameraFirst) => {
    const cameraEntity = rootEntity.createChild();
    const canvasEntity = (nested ? cameraEntity : rootEntity).createChild();
    const canvas = canvasEntity.addComponent(UICanvas);
    canvas.camera = cameraEntity.addComponent(Camera);
    canvas.renderMode = CanvasRenderMode.ScreenSpaceCamera;
    const box = canvasEntity.addComponent(BoxCollider);
    let canvasBody: Rigidbody;
    if (!cameraFirst) canvasBody = canvasEntity.addComponent(Rigidbody);
    const cameraBody = cameraEntity.addComponent(Rigidbody);
    cameraBody.useGravity = false;
    if (cameraFirst) canvasBody = canvasEntity.addComponent(Rigidbody);
    canvasBody.isKinematic = true;

    const step = useFixedTimeStep();
    engine.update();
    const z = canvasEntity.transform.worldPosition.z;
    const hit = new HitResult();
    const hitsCanvas = (x: number) =>
      rootEntity.scene.physics.raycast(new Ray(new Vector3(x, 0, z - 2), new Vector3(0, 0, 1)), 4, hit) &&
      hit.collider === box;
    expect(hitsCanvas(0)).toBe(true);
    cameraBody.linearVelocity.x = 2 / step;
    engine.update();
    expect(canvasEntity.transform.worldPosition.x).toBeCloseTo(2);
    expect(hitsCanvas(2)).toBe(true);
    expect(hitsCanvas(0)).toBe(false);

    cameraBody.linearVelocity.x = 0;
    engine.update();
    expect(canvasEntity.transform.worldPosition.x).toBeCloseTo(2);
    expect(hitsCanvas(2)).toBe(true);

    // The camera authors the previous position while PhysX moves the Canvas to a different target.
    canvasBody.move(new Vector3(4, 0, z));
    engine.update();
    expect(canvasEntity.transform.worldPosition.x).toBeCloseTo(4);
    canvasBody.move(new Vector3(6, 0, z));
    cameraBody.linearVelocity.x = 2 / step;
    engine.update();
    expect(canvasEntity.transform.worldPosition.x).toBeCloseTo(4);
    expect(hitsCanvas(4)).toBe(true);
    expect(hitsCanvas(6)).toBe(false);
  });

  it("mass", function () {
    const box = addBox(new Vector3(2, 2, 2), true, new Vector3(0, 0, 0));
    const boxCollider = box.getComponent(Rigidbody);

    boxCollider.mass = 1;
    expect(boxCollider.mass).eq(1);
    boxCollider.applyForce(new Vector3(1, 0, 0));
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxCollider.linearVelocity.x)).eq(0.01667);
    boxCollider.mass = 0.01;
    expect(boxCollider.mass).eq(0.01);

    boxCollider.linearVelocity.x = 0;
    boxCollider.applyForce(new Vector3(1, 0, 0));
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxCollider.linearVelocity.x)).eq(1.66667);
  });

  it.each(["automatic", "manual", "disabled while editing", "disabled after editing"] as const)(
    "applies a pending mass once when %s",
    (mode) => {
      const physics = engine.sceneManager.activeScene.physics;
      const entity = rootEntity.createChild("body");
      entity.addComponent(BoxCollider);
      const body = entity.addComponent(Rigidbody);
      body.useGravity = false;
      physics._update(physics.fixedTimeStep);

      const actor = body._getNativeActor();
      const setMassProperties = vi.spyOn(actor, "setMassProperties");
      const updateMassAndInertia = vi.spyOn(actor, "updateMassAndInertia");
      const manual = mode !== "automatic";
      if (mode === "disabled while editing") body.enabled = false;
      body.mass = 10;
      if (mode === "disabled after editing") body.enabled = false;
      if (manual) {
        body.centerOfMass = new Vector3();
        body.inertiaTensor = new Vector3(1, 1, 1);
        body.automaticCenterOfMass = false;
        body.automaticInertiaTensor = false;
      }
      body.enabled = true;
      body.applyForce(new Vector3(10, 0, 0));
      physics._update(physics.fixedTimeStep);

      expect(body.linearVelocity.x).toBeCloseTo(physics.fixedTimeStep, 5);
      if (manual) {
        expect(setMassProperties.mock.calls.filter(([mass]) => mass !== undefined)).toEqual([[10]]);
        expect(updateMassAndInertia).not.toHaveBeenCalled();
      } else {
        expect(updateMassAndInertia).toHaveBeenCalledExactlyOnceWith(10, null, null, null);
        expect(setMassProperties).not.toHaveBeenCalled();
      }
    }
  );

  it("cancels multiple queued mass updates and applies the latest masses after re-enabling", () => {
    const physics = engine.sceneManager.activeScene.physics;
    const bodies = [0, 5, 10].map((x) => {
      const entity = rootEntity.createChild();
      entity.transform.setPosition(x, 0, 0);
      entity.addComponent(BoxCollider);
      const body = entity.addComponent(Rigidbody);
      body.useGravity = false;
      return body;
    });
    physics._update(physics.fixedTimeStep);

    for (let i = 0; i < bodies.length; i++) bodies[i].mass = i + 2;
    bodies[0].enabled = bodies[2].enabled = false;
    bodies[0].enabled = bodies[2].enabled = true;
    const force = new Vector3(12, 0, 0);
    for (const body of bodies) body.applyForce(force);
    physics._update(physics.fixedTimeStep);

    for (let i = 0; i < bodies.length; i++) {
      expect(bodies[i].linearVelocity.x).toBeCloseTo((12 / (i + 2)) * physics.fixedTimeStep, 5);
    }
  });

  it.each([true, false])("does not resync colliders owned by an independent Rigidbody (enabled: %s)", (enabled) => {
    const physics = engine.sceneManager.activeScene.physics;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const outer = rootEntity.createChild();
      const body = outer.addComponent(Rigidbody);
      const ownedBox = outer.createChild().addComponent(BoxCollider);
      const ownedPlane = outer.createChild().addComponent(PlaneCollider);
      const nested = outer.createChild();
      const nestedBody = nested.addComponent(Rigidbody);
      const nestedCollider = nested.createChild().addComponent(PlaneCollider);
      nestedBody.enabled = enabled;

      const ray = new Ray(new Vector3(0, 8, 0), new Vector3(0, -1, 0));
      physics.raycast(ray, 10);
      const ownedBoxSync = vi.spyOn(ownedBox, "_sync");
      const ownedPlaneSync = vi.spyOn(ownedPlane, "_sync");
      const nestedSync = vi.spyOn(nestedCollider, "_sync");
      body.isKinematic = true;
      physics.raycast(ray, 10);
      expect(ownedBoxSync).not.toHaveBeenCalled();
      expect(ownedPlaneSync).toHaveBeenCalledOnce();
      expect(nestedSync).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });

  it("keeps infinite mass when enabling automatic inertia in the same batch", () => {
    const physics = engine.sceneManager.activeScene.physics;
    const entity = addBox(new Vector3(1, 1, 1), true, new Vector3());
    const body = entity.getComponent(Rigidbody);
    body.useGravity = false;
    physics._update(physics.fixedTimeStep);

    body.mass = 0;
    body.automaticInertiaTensor = true;
    body.applyForce(new Vector3(10, 0, 0));
    physics._update(physics.fixedTimeStep);
    expect(body.linearVelocity.x).toBeCloseTo(0, 6);
  });

  it("centerOfMass", function () {
    const box = addBox(new Vector3(2, 2, 2), true, new Vector3(0, 0, 0));
    const boxCollider = box.getComponent(Rigidbody);
    addBox(new Vector3(1, 1, 2), false, new Vector3(0, -1.5, 0));
    boxCollider.automaticCenterOfMass = false;
    boxCollider.automaticInertiaTensor = true;
    boxCollider.centerOfMass = new Vector3(0, 0, 0);
    engine.sceneManager.activeScene.physics._update(1);
    expect(Math.abs(box.transform.rotation.z)).lessThan(0.1);

    boxCollider.wakeUp();
    boxCollider.centerOfMass = new Vector3(1, 0, 0);
    engine.sceneManager.activeScene.physics._update(1);
    expect(Math.abs(box.transform.rotation.z)).greaterThan(90);
  });

  it("automaticCenterOfMass", function () {
    const box = addBox(new Vector3(2, 2, 2), true, new Vector3(0, 0, 0));
    const boxCollider = box.getComponent(Rigidbody);
    boxCollider.automaticCenterOfMass = true;
    expect(boxCollider.automaticCenterOfMass).toBeTruthy();
    boxCollider.automaticInertiaTensor = true;
    expect(boxCollider.centerOfMass).to.deep.include({ x: 0, y: 0, z: 0 });

    const newBoxShape = box.addComponent(BoxCollider);
    newBoxShape.size = new Vector3(2, 2, 2);
    newBoxShape.center = new Vector3(1, 0, 0);
    expect(boxCollider.centerOfMass).to.deep.include({ x: 0.5, y: 0, z: 0 });
    newBoxShape.destroy();
    box.getComponent(BoxCollider).center = new Vector3(1, 0, 0);
    expect(boxCollider.centerOfMass).to.deep.include({ x: 1, y: 0, z: 0 });
    box.getComponent(BoxCollider).destroy();
    expect(boxCollider.centerOfMass).to.deep.include({ x: 0, y: 0, z: 0 });
  });

  it("inertiaTensor", function () {
    const box = addBox(new Vector3(2, 2, 2), true, new Vector3(0, 0, 0));
    const boxCollider = box.getComponent(Rigidbody);
    boxCollider.automaticCenterOfMass = false;

    boxCollider.automaticInertiaTensor = true;
    expect(boxCollider.automaticInertiaTensor).toBeTruthy();
    boxCollider.inertiaTensor = new Vector3(0, 1, 0);

    boxCollider.automaticInertiaTensor = false;
    boxCollider.applyTorque(new Vector3(0, 10, 0));
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxCollider.inertiaTensor.y)).eq(1);
    expect(boxCollider.angularVelocity.y).toBeCloseTo(0.15853, 5);

    boxCollider.inertiaTensor = new Vector3(0, 2, 0);
    boxCollider.angularVelocity.y = 0;
    boxCollider.applyTorque(new Vector3(0, 10, 0));
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxCollider.inertiaTensor.y)).eq(2);
    expect(boxCollider.angularVelocity.y).toBeCloseTo(0.07927, 5);
  });

  it("automaticInertiaTensor", function () {
    const box = addBox(new Vector3(2, 2, 2), true, new Vector3(0, 0, 0));
    const boxCollider = box.getComponent(Rigidbody);

    boxCollider.automaticCenterOfMass = true;
    boxCollider.automaticInertiaTensor = true;
    expect(boxCollider.automaticInertiaTensor).toBeTruthy();
    expect(formatValue(boxCollider.inertiaTensor.y)).eq(0.66667);

    const newBoxShape = box.addComponent(BoxCollider);
    newBoxShape.size = new Vector3(2, 2, 2);
    newBoxShape.center = new Vector3(1, 0, 0);
    expect(formatValue(boxCollider.inertiaTensor.y)).eq(0.91667);
    newBoxShape.destroy();
    expect(formatValue(boxCollider.inertiaTensor.y)).eq(0.66667);
    box.getComponent(BoxCollider).destroy();
    expect(formatValue(boxCollider.inertiaTensor.y)).eq(1);
  });

  it("limits linear speed before solving while preserving its direction", () => {
    const physics = engine.sceneManager.activeScene.physics;
    const body = rootEntity.createChild().addComponent(Rigidbody);
    body.useGravity = false;
    body.maxLinearVelocity = 2;
    expect(() => (body.maxLinearVelocity = Number.MAX_VALUE)).toThrow(RangeError);
    body.linearVelocity = new Vector3(3, 4, 0);
    physics._update(physics.fixedTimeStep);
    expect(body.linearVelocity.x).toBeCloseTo(1.2, 5);
    expect(body.linearVelocity.y).toBeCloseTo(1.6, 5);
  });

  it("rejects negative damping without replacing the current values", () => {
    const body = rootEntity.createChild().addComponent(Rigidbody);
    body.linearDamping = 1;
    body.angularDamping = 2;
    expect(() => (body.linearDamping = -1)).toThrow(RangeError);
    expect(() => (body.angularDamping = -1)).toThrow(RangeError);
    expect(body.linearDamping).toBe(1);
    expect(body.angularDamping).toBe(2);
  });

  it("maxAngularVelocity", function () {
    const box = addBox(new Vector3(2, 2, 2), true, new Vector3(0, 0, 0));
    const boxCollider = box.getComponent(Rigidbody);
    boxCollider.maxAngularVelocity = 200;
    boxCollider.angularDamping = 0;
    boxCollider.angularVelocity = new Vector3(0, 300, 0);
    expect(boxCollider.maxAngularVelocity).eq(200);
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxCollider.angularVelocity.y)).eq(200);
  });

  it("applyForceAtPosition uses world space with an offset center of mass on a rotated body", function () {
    const setupBox = () => {
      const box = addBox(new Vector3(2, 2, 2), true, new Vector3(5, 2, -3));
      box.transform.setRotation(0, 90, 0);
      const collider = box.getComponent(Rigidbody);
      collider.mass = 1;
      collider.useGravity = false;
      collider.centerOfMass = new Vector3(1, 0, 0);
      collider.inertiaTensor = new Vector3(1, 1, 1);
      return collider;
    };

    const force = new Vector3(1, 0, 0);
    const position = new Vector3(5, 3, -4);

    const reference = setupBox();
    reference.applyForce(force);
    reference.applyTorque(new Vector3(0, 0, -1));
    engine.sceneManager.activeScene.physics._update(1);
    const referenceLinearVelocity = reference.linearVelocity.clone();
    const referenceAngularVelocity = reference.angularVelocity.clone();
    expect(referenceLinearVelocity.x).toBeGreaterThan(0);
    expect(referenceAngularVelocity.z).toBeLessThan(0);

    while (rootEntity.children.length) rootEntity.children[0].destroy();

    const target = setupBox();
    target.applyForceAtPosition(force, position);
    engine.sceneManager.activeScene.physics._update(1);

    expect(formatValue(target.linearVelocity.x)).eq(formatValue(referenceLinearVelocity.x));
    expect(formatValue(target.linearVelocity.y)).eq(formatValue(referenceLinearVelocity.y));
    expect(formatValue(target.linearVelocity.z)).eq(formatValue(referenceLinearVelocity.z));
    expect(formatValue(target.angularVelocity.x)).eq(formatValue(referenceAngularVelocity.x));
    expect(formatValue(target.angularVelocity.y)).eq(formatValue(referenceAngularVelocity.y));
    expect(formatValue(target.angularVelocity.z)).eq(formatValue(referenceAngularVelocity.z));
  });

  it("maxDepenetrationVelocity", function () {
    const box = addBox(new Vector3(2, 2, 2), true, new Vector3(0, 0, 0));
    const box2 = addBox(new Vector3(2, 2, 2), true, new Vector3(0, 0, 0));
    addPlane(0, -1, 0);
    const boxCollider = box.getComponent(Rigidbody);
    const boxCollider2 = box2.getComponent(Rigidbody);

    boxCollider.automaticCenterOfMass = true;
    boxCollider.automaticInertiaTensor = true;
    boxCollider2.automaticCenterOfMass = true;
    boxCollider2.automaticInertiaTensor = true;

    boxCollider.maxDepenetrationVelocity = boxCollider2.maxDepenetrationVelocity = 0;
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxCollider.linearVelocity.x).eq(0);
    boxCollider2.maxDepenetrationVelocity = boxCollider.maxDepenetrationVelocity = 10;
    expect(boxCollider2.maxDepenetrationVelocity).eq(10);
    for (const invalid of [-1, NaN, Infinity, -Infinity, 1e39]) {
      expect(() => (boxCollider.maxDepenetrationVelocity = invalid)).toThrow(RangeError);
    }
    expect(boxCollider.maxDepenetrationVelocity).eq(10);
    boxCollider.wakeUp();
    boxCollider2.wakeUp();
    engine.sceneManager.activeScene.physics._update(1);
    expect(Math.abs(boxCollider.linearVelocity.x)).gt(1);
  });

  it("sleepThreshold", function () {
    const box = addBox(new Vector3(2, 2, 2), true, new Vector3(0, 0, 0));
    addPlane(0, -1, 0);
    const boxCollider = box.getComponent(Rigidbody);
    engine.sceneManager.activeScene.physics._update(1);

    expect(boxCollider.isSleeping()).true;
    boxCollider.linearVelocity = new Vector3(1, 0, 0);
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxCollider.isSleeping()).false;

    boxCollider.sleepThreshold = 100;
    expect(boxCollider.sleepThreshold).eq(100);
    for (const invalid of [-1, NaN, Infinity, -Infinity, 1e39]) {
      expect(() => (boxCollider.sleepThreshold = invalid)).toThrow(RangeError);
    }
    expect(boxCollider.sleepThreshold).eq(100);
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxCollider.isSleeping()).true;
  });

  it("solverIterations", function () {
    const box = addBox(new Vector3(2, 2, 2), true, new Vector3(0, 0, 0));
    addBox(new Vector3(2, 2, 2), false, new Vector3(1, 0, 0));
    const boxCollider = box.getComponent(Rigidbody);
    expect(boxCollider.solverIterations).eq(4);

    // Include inputs that would wrap when converted to native solver counts.
    for (const invalid of [NaN, Infinity, -Infinity]) {
      expect(() => (boxCollider.solverIterations = invalid)).toThrow();
    }
    boxCollider.solverIterations = 0;
    expect(boxCollider.solverIterations).eq(1);
    boxCollider.solverIterations = -10;
    expect(boxCollider.solverIterations).eq(1);
    boxCollider.solverIterations = 300;
    expect(boxCollider.solverIterations).eq(255);
    boxCollider.solverIterations = 6.6;
    expect(boxCollider.solverIterations).eq(7);

    boxCollider.solverIterations = 1;
    boxCollider.applyForce(new Vector3(10, 0, 0));

    engine.sceneManager.activeScene.physics._update(1 / 60);

    // Exercise the minimum accepted iteration count in a real contact.
    expect(Number.isFinite(boxCollider.linearVelocity.x)).toBe(true);
    expect(Math.abs(formatValue(boxCollider.linearVelocity.x))).lessThan(10);

    box.isActive = false;
    const box2 = addBox(new Vector3(2, 2, 2), true, new Vector3(0, 0, 0));
    const boxCollider2 = box2.getComponent(Rigidbody);
    expect(boxCollider2.solverIterations).eq(4);

    boxCollider2.solverIterations = 10;
    expect(boxCollider2.solverIterations).eq(10);
    boxCollider2.applyForce(new Vector3(10, 0, 0));
    engine.sceneManager.activeScene.physics._update(1 / 60);

    expect(Math.abs(formatValue(boxCollider2.linearVelocity.x))).lessThan(4);
  });

  it("validates and clamps solverVelocityIterations", function () {
    const body = addBox(new Vector3(2, 2, 2), true, new Vector3(0, 0, 0)).getComponent(Rigidbody);
    expect(body.solverVelocityIterations).eq(1);
    for (const invalid of [NaN, Infinity, -Infinity]) {
      expect(() => (body.solverVelocityIterations = invalid)).toThrow();
    }
    body.solverVelocityIterations = 0.4;
    expect(body.solverVelocityIterations).eq(1);
    body.solverVelocityIterations = 300;
    expect(body.solverVelocityIterations).eq(255);
    body.solverVelocityIterations = 2.6;
    expect(body.solverVelocityIterations).eq(3);
  });

  it("useGravity", function () {
    const box = addBox(new Vector3(2, 2, 2), true, new Vector3(0, 10, 0));
    const boxCollider = box.getComponent(Rigidbody);
    boxCollider.useGravity = false;
    const boxClone = box.clone();
    boxClone.transform.position.x = 5;
    box.parent.addChild(boxClone);
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(box.transform.position.y)).eq(10);
    expect(formatValue(boxClone.transform.position.y)).eq(10);

    boxCollider.useGravity = true;
    boxCollider.wakeUp();
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(box.transform.position.y)).lessThan(10);
  });

  it("keeps the simulated mass when an assignment cannot be represented", () => {
    const entity = addBox(new Vector3(1, 1, 1), true, new Vector3());
    const body = entity.getComponent(Rigidbody)!;
    body.useGravity = false;
    body.mass = 2;
    for (const invalid of [-1, NaN, Infinity, Number.MAX_VALUE, 1e-50]) {
      expect(() => (body.mass = invalid)).toThrow(RangeError);
      expect(body.mass).toBe(2);
    }
    body.applyForce(new Vector3(4, 0, 0), ForceMode.Impulse);
    engine.sceneManager.activeScene.physics._update(engine.sceneManager.activeScene.physics.fixedTimeStep);
    expect(body.linearVelocity.x).toBeCloseTo(2);
  });

  it("preserves the latest automatic axes when setting an inertia tensor", () => {
    function addAsymmetricBody(name: string) {
      const entity = rootEntity.createChild(name);
      const body = entity.addComponent(Rigidbody);
      const shapeEntity = entity.createChild("shape");
      const shape = shapeEntity.addComponent(BoxCollider);
      shape.size.set(2, 4, 6);
      return { body, shapeEntity };
    }
    const reference = addAsymmetricBody("reference");
    const target = addAsymmetricBody("target");
    expect(target.body.inertiaTensorRotation.w).toBeCloseTo(1);
    reference.shapeEntity.transform.rotation.z = 30;
    const expected = reference.body.inertiaTensorRotation;
    target.shapeEntity.transform.rotation.z = 30;
    target.body.inertiaTensor = new Vector3(2, 3, 4);

    const actual = target.body.inertiaTensorRotation;
    const dot = actual.x * expected.x + actual.y * expected.y + actual.z * expected.z + actual.w * expected.w;
    expect(Math.abs(dot)).toBeCloseTo(1, 5);
    expect(target.body.automaticInertiaTensor).toBe(false);
    expect(target.body.inertiaTensor).toMatchObject({ x: 2, y: 3, z: 4 });
  });

  it.each([false, true])("handles a sleep request before body registration with cancel=%s", (cancel) => {
    const entity = new Entity(engine, "sleep on awake");
    entity.transform.position.y = 5;
    entity.addComponent(
      class extends Script {
        onAwake(): void {
          this.entity.getComponent(Rigidbody)!.sleep();
        }
      }
    );
    const body = entity.addComponent(Rigidbody);
    entity.addComponent(BoxCollider);
    rootEntity.addChild(entity);
    if (cancel) body.wakeUp();

    const physics = engine.sceneManager.activeScene.physics;
    physics._update(physics.fixedTimeStep);
    expect(body.isSleeping()).toBe(!cancel);
    expect(entity.transform.worldPosition.y < 5).toBe(cancel);
  });

  it("honors sleep requested in onAwake before a child collider enters the scene", () => {
    const entity = new Entity(engine, "compound sleep on awake");
    entity.transform.position.y = 5;
    const body = entity.addComponent(Rigidbody);
    entity.addComponent(
      class extends Script {
        onAwake(): void {
          body.sleep();
          expect(body.isSleeping()).toBe(true);
        }
      }
    );
    entity.createChild("child-shape").addComponent(BoxCollider);
    rootEntity.addChild(entity);

    const physics = engine.sceneManager.activeScene.physics;
    physics._update(physics.fixedTimeStep);
    expect(body.isSleeping()).toBe(true);
    expect(entity.transform.worldPosition.y).toBe(5);
  });

  it("honors sleep requested before a world joint enters simulation", () => {
    const entity = new Entity(engine, "sleep during joint registration");
    entity.transform.position.y = 5;
    const body = entity.addComponent(Rigidbody);
    entity.addComponent(BoxCollider);
    entity.addComponent(FixedJoint);
    body.sleep();
    rootEntity.addChild(entity);

    const physics = engine.sceneManager.activeScene.physics;
    physics._update(physics.fixedTimeStep);
    expect(body.isSleeping()).toBe(true);
  });

  it.each([false, true])("cancels initial sleep only when an explosion reaches the body (%s)", (reachable) => {
    const entity = new Entity(engine, "sleep before explosion");
    const body = entity.addComponent(Rigidbody);
    body.useGravity = false;
    entity.addComponent(BoxCollider);
    body.sleep();
    rootEntity.addChild(entity);

    body.applyExplosionForce(12, new Vector3(reachable ? -1 : -10, 0, 0), 2, 0, ForceMode.Impulse);
    const physics = engine.sceneManager.activeScene.physics;
    physics._update(physics.fixedTimeStep);
    expect(body.isSleeping()).toBe(!reachable);
    expect(body.linearVelocity.x > 0).toBe(reachable);
  });

  it.each([
    [true, true],
    [true, false],
    [false, true],
    [false, false]
  ])("sets mass from density and respects auto center=%s and auto inertia=%s", (autoCenter, autoInertia) => {
    const entity = rootEntity.createChild("density");
    const body = entity.addComponent(Rigidbody);
    const shape = entity.addComponent(BoxCollider);
    shape.size.set(2, 4, 6);
    shape.center.set(1, 2, 3);
    const manualCenter = new Vector3(-1, -2, -3);
    const manualInertia = new Vector3(2, 3, 4);
    const manualRotation = new Quaternion(0, 0, Math.SQRT1_2, Math.SQRT1_2);
    if (!autoCenter) body.centerOfMass = manualCenter;
    if (!autoInertia) {
      body.inertiaTensor = manualInertia;
      body.inertiaTensorRotation = manualRotation;
    }

    expect(body.setDensity(2)).toBe(true);
    expect(body.mass).toBeCloseTo(96);
    expect(Vector3.equals(body.centerOfMass, autoCenter ? shape.center : manualCenter)).toBe(true);
    const inertia = body.inertiaTensor;
    expect(inertia.x).toBeCloseTo(autoInertia ? 416 : 2);
    expect(inertia.y).toBeCloseTo(autoInertia ? 320 : 3);
    expect(inertia.z).toBeCloseTo(autoInertia ? 160 : 4);
    expect(body.inertiaTensorRotation.w).toBeCloseTo(autoInertia ? 1 : Math.SQRT1_2);
    shape.size.x = 3;
    expect(body.inertiaTensor.y).toBeCloseTo(autoInertia ? 360 : 3);
    expect(body.mass).toBeCloseTo(96);
  });

  it("retains density-derived inertia across disable and re-enable without a geometry change", () => {
    const entity = rootEntity.createChild();
    const body = entity.addComponent(Rigidbody);
    const sphere = entity.addComponent(SphereCollider);
    sphere.radius = 0.5;
    sphere.center.x = 2048;
    expect(body.setDensity(2)).toBe(true);
    const mass = body.mass;
    const inertia = body.inertiaTensor.clone();

    body.enabled = false;
    body.enabled = true;
    expect(body.mass).toBe(mass);
    expect(body.inertiaTensor).toMatchObject({ x: inertia.x, y: inertia.y, z: inertia.z });
  });

  it("computes kinematic mass from solid shapes when a trigger plane is attached", () => {
    const entity = rootEntity.createChild();
    const body = entity.addComponent(Rigidbody);
    body.isKinematic = true;
    const box = entity.createChild().addComponent(BoxCollider);
    box.size.set(2, 4, 6);
    box.center.x = 3;
    entity.createChild().addComponent(PlaneCollider).isTrigger = true;

    expect(body.centerOfMass.x).toBeCloseTo(3);
    expect(body.inertiaTensor.x).toBeCloseTo((4 ** 2 + 6 ** 2) / 12);
  });

  it("preserves pending authored mass when the density computation cannot succeed", () => {
    const entity = rootEntity.createChild("invalid density result");
    const body = entity.addComponent(Rigidbody);
    body.useGravity = false;
    const shape = entity.addComponent(BoxCollider);
    shape.size.set(2, 2, 2);
    body.mass = 7;

    expect(() => body.setDensity(0)).toThrow(RangeError);
    expect(body.setDensity(2 ** 127)).toBe(false);
    expect(body.mass).toBe(7);
    body.applyForce(new Vector3(14, 0, 0), ForceMode.Impulse);
    const physics = engine.sceneManager.activeScene.physics;
    physics._update(physics.fixedTimeStep);
    expect(body.linearVelocity.x).toBeCloseTo(2);
    shape.isTrigger = true;
    expect(body.setDensity(2)).toBe(false);
    expect(body.mass).toBe(7);
  });

  it("computes density and inertia for a Collider far from the Rigidbody origin", () => {
    const entity = rootEntity.createChild("offset density");
    const body = entity.addComponent(Rigidbody);
    const shape = entity.addComponent(BoxCollider);
    shape.size.set(1, 1, 1);
    shape.center.x = 2048;

    expect(body.setDensity(2)).toBe(true);
    expect(body.mass).toBeCloseTo(2);
    expect(body.centerOfMass.x).toBeCloseTo(2048);
    expect(body.inertiaTensor.x).toBeCloseTo(1 / 3);
    expect(body.inertiaTensor.y).toBeCloseTo(1 / 3);
    expect(body.inertiaTensor.z).toBeCloseTo(1 / 3);
  });

  it.each([
    [true, true, false],
    [true, false, false],
    [false, true, false],
    [false, false, false],
    [true, true, true],
    [true, false, true],
    [false, true, true],
    [false, false, true]
  ])(
    "clone preserves mass properties (automatic center: %s, automatic inertia: %s, kinematic: %s)",
    function (automaticCenterOfMass, automaticInertiaTensor, isKinematic) {
      const entity = rootEntity.createChild("source");
      const collider = entity.addComponent(Rigidbody);
      const shape = entity.addComponent(BoxCollider);
      shape.size.set(2, 4, 6);
      shape.center.set(1, 2, 3);
      collider.mass = 3;
      collider.automaticCenterOfMass = automaticCenterOfMass;
      collider.automaticInertiaTensor = automaticInertiaTensor;
      if (!automaticCenterOfMass) {
        collider.centerOfMass.set(-1, -2, -3);
      }
      if (!automaticInertiaTensor) {
        collider.inertiaTensor.set(2, 3, 4);
      }
      const centerOfMass = collider.centerOfMass.clone();
      const inertiaTensor = collider.inertiaTensor.clone();
      collider.isKinematic = isKinematic;

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const clone = entity.clone();
        rootEntity.addChild(clone);
        const clonedCollider = clone.getComponent(Rigidbody);
        expect(warnSpy).not.toHaveBeenCalled();
        expect(clonedCollider.automaticCenterOfMass).eq(automaticCenterOfMass);
        expect(clonedCollider.automaticInertiaTensor).eq(automaticInertiaTensor);
        expect(clonedCollider.isKinematic).eq(isKinematic);
        expect(clonedCollider.mass).eq(3);
        if (!automaticCenterOfMass) {
          expect(Vector3.equals(clonedCollider.centerOfMass, centerOfMass)).true;
        }
        if (!automaticInertiaTensor) {
          expect(Vector3.equals(clonedCollider.inertiaTensor, inertiaTensor)).true;
        }

        clonedCollider.isKinematic = false;
        expect(Vector3.equals(clonedCollider.centerOfMass, centerOfMass)).true;
        expect(Vector3.equals(clonedCollider.inertiaTensor, inertiaTensor)).true;

        const clonedShape = clone.getComponent(BoxCollider);
        clonedShape.center.set(3, 4, 5);
        clonedShape.size.set(4, 6, 8);
        clonedCollider.mass = 6;
        expect(Vector3.equals(clonedCollider.centerOfMass, automaticCenterOfMass ? clonedShape.center : centerOfMass))
          .true;
        const expectedInertiaTensor = automaticInertiaTensor ? new Vector3(50, 40, 26) : inertiaTensor;
        expect(clonedCollider.inertiaTensor.x).toBeCloseTo(expectedInertiaTensor.x, 5);
        expect(clonedCollider.inertiaTensor.y).toBeCloseTo(expectedInertiaTensor.y, 5);
        expect(clonedCollider.inertiaTensor.z).toBeCloseTo(expectedInertiaTensor.z, 5);
        if (!automaticCenterOfMass) {
          clonedCollider.centerOfMass.set(-4, -5, -6);
          expect(clonedCollider.centerOfMass).to.deep.include({ x: -4, y: -5, z: -6 });
        }
        if (!automaticInertiaTensor) {
          clonedCollider.inertiaTensor.set(6, 7, 8);
          expect(Vector3.equals(clonedCollider.inertiaTensor, new Vector3(6, 7, 8))).true;
        }
        expect(Vector3.equals(collider.centerOfMass, centerOfMass)).true;
        expect(Vector3.equals(collider.inertiaTensor, inertiaTensor)).true;
        expect(warnSpy).not.toHaveBeenCalled();
      } finally {
        warnSpy.mockRestore();
      }
    }
  );

  describe.each(["new", "cloned", "reshaped", "reenabled"])("automatic mass properties on a %s collider", (state) => {
    it.each([
      ["centerOfMass", "automaticCenterOfMass", false],
      ["inertiaTensor", "automaticInertiaTensor", false],
      ["centerOfMass", "automaticCenterOfMass", true],
      ["inertiaTensor", "automaticInertiaTensor", true]
    ] as const)("selects %s when disabling %s (kinematic: %s)", (property, automatic, isKinematic) => {
      const entity = rootEntity.createChild("source");
      const source = entity.addComponent(Rigidbody);
      const shape = entity.addComponent(BoxCollider);
      shape.size.set(2, 4, 6);
      shape.center.set(1, 2, 3);
      source.mass = 3;

      let target = source;
      if (state === "cloned" || state === "reshaped") {
        const clone = entity.clone();
        rootEntity.addChild(clone);
        target = clone.getComponent(Rigidbody);
      }
      if (state === "reshaped") {
        const clonedShape = target.entity.getComponent(BoxCollider);
        clonedShape.size.set(4, 6, 8);
        clonedShape.center.set(3, 4, 5);
      } else if (state === "reenabled") {
        target[property].set(2, 3, 4);
        target[automatic] = true;
      }

      target.isKinematic = isKinematic;
      target[automatic] = false;
      target.mass = 6;
      target.isKinematic = false;

      const expected =
        property === "centerOfMass"
          ? state === "reshaped"
            ? new Vector3(3, 4, 5)
            : new Vector3(1, 2, 3)
          : state === "reshaped"
            ? new Vector3(25, 20, 13)
            : new Vector3(13, 10, 5);
      const actual = target[property];
      expect(actual.x).toBeCloseTo(expected.x, 5);
      expect(actual.y).toBeCloseTo(expected.y, 5);
      expect(actual.z).toBeCloseTo(expected.z, 5);
      target[property].set(6, 7, 8);
      expect(Vector3.equals(target[property], new Vector3(6, 7, 8))).true;
    });
  });

  it("recalculates automatic mass properties when solid colliders become triggers and back", () => {
    const entity = rootEntity.createChild("compound body");
    const body = entity.addComponent(Rigidbody);
    body.mass = 6;
    const left = entity.addComponent(BoxCollider);
    left.size.set(2, 2, 2);
    left.center.x = -2;
    const right = entity.addComponent(BoxCollider);
    right.size.set(2, 2, 2);
    right.center.x = 2;

    const expectMassProperties = (centerX: number, inertiaX: number, inertiaYZ: number) => {
      expect(body.centerOfMass).deep.include({ x: centerX, y: 0, z: 0 });
      const inertia = body.inertiaTensor;
      expect(inertia.x).toBeCloseTo(inertiaX, 5);
      expect(inertia.y).toBeCloseTo(inertiaYZ, 5);
      expect(inertia.z).toBeCloseTo(inertiaYZ, 5);
    };

    expectMassProperties(0, 4, 28);
    right.isTrigger = true;
    expectMassProperties(-2, 4, 4);
    left.isTrigger = true;
    expectMassProperties(0, 1, 1);
    right.isTrigger = false;
    expectMassProperties(2, 4, 4);
    left.isTrigger = false;
    expectMassProperties(0, 4, 28);
  });

  it("isKinematic", function () {
    const box = addBox(new Vector3(2, 2, 2), true, new Vector3(0, 1, 0));
    const boxCollider = box.getComponent(Rigidbody);
    boxCollider.isKinematic = true;
    engine.sceneManager.activeScene.physics._update(1);
    expect(box.transform.position.y).eq(1);

    boxCollider.isKinematic = false;
    boxCollider.wakeUp();
    engine.sceneManager.activeScene.physics._update(1);
    expect(box.transform.position.y).below(1);
  });

  it("applies a pending mesh removal before switching to dynamic", function () {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const bodyEntity = rootEntity.createChild("mesh body");
    bodyEntity.addComponent(BoxCollider);
    const body = bodyEntity.addComponent(Rigidbody);
    body.isKinematic = true;
    const child = bodyEntity.createChild("mesh child");
    const mesh = child.addComponent(MeshCollider);
    mesh.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 2, { keepMeshData: true });
    const physics = engine.sceneManager.activeScene.physics;
    const ray = new Ray(new Vector3(0, 5, 0), new Vector3(0, -1, 0));
    const hit = new HitResult();
    expect(physics.raycast(ray, 10, hit) && hit.collider === mesh).toBe(true);
    expect(errors).not.toHaveBeenCalled();
    physics._update(physics.fixedTimeStep);

    // Reparent and switch in the same frame: the native actor must not keep the pending triangle mesh
    rootEntity.addChild(child);
    body.isKinematic = false;
    body.wakeUp();
    expect(physics.raycast(ray, 10, hit) && hit.collider === mesh).toBe(true);
    for (let i = 0; i < 30; i++) {
      physics._update(physics.fixedTimeStep);
    }
    expect(errors).not.toHaveBeenCalled();
    expect(bodyEntity.transform.position.y).below(-0.1);
  });

  it.each([false, true])("rechecks a non-convex mesh across kinematic transitions (isTrigger=%s)", (isTrigger) => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const physics = engine.sceneManager.activeScene.physics;
    const entity = rootEntity.createChild("kinematic-mesh-body");
    const body = entity.addComponent(Rigidbody);
    body.isKinematic = true;
    const mesh = entity.addComponent(MeshCollider);
    mesh.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 2, { keepMeshData: true });
    mesh.isTrigger = isTrigger;
    const ray = new Ray(new Vector3(0, 5, 0), new Vector3(0, -1, 0));

    expect(physics.raycast(ray, 10)).toBe(!isTrigger);
    expect(errors).toHaveBeenCalledTimes(isTrigger ? 1 : 0);
    errors.mockClear();

    body.isKinematic = false;
    expect(body.isKinematic).toBe(false);
    expect(physics.raycast(ray, 10)).toBe(false);
    expect(errors).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("non-kinematic Rigidbody"));

    body.isKinematic = true;
    expect(body.isKinematic).toBe(true);
    expect(physics.raycast(ray, 10)).toBe(!isTrigger);
  });

  it("constraints", function () {
    const box = addBox(new Vector3(2, 2, 2), true, new Vector3(0, 0, 0));
    const boxCollider = box.getComponent(Rigidbody);
    expect(boxCollider.constraints).eq(RigidbodyConstraints.None);

    boxCollider.constraints = RigidbodyConstraints.FreezePositionX;
    boxCollider.applyForce(new Vector3(10, 0, 10));
    engine.sceneManager.activeScene.physics._update(1);
    expect(box.transform.position.x).eq(0);
    expect(box.transform.position.z).greaterThan(0);
  });

  it.each([false, true])("keeps useCCD=%s effective after kinematic transitions", (useCCD) => {
    const box = addBox(new Vector3(1, 1, 1), true, new Vector3(-5, 0, 0));
    const body = box.getComponent(Rigidbody);
    body.useGravity = false;
    expect(body.useCCD).toBe(false);
    body.useCCD = useCCD;
    body.isKinematic = true;
    body.move(new Vector3(-4, 0, 0));
    const physics = engine.sceneManager.activeScene.physics;
    physics._update(1 / 60);
    expect(box.transform.position.x).toBeCloseTo(-4, 5);
    addBox(new Vector3(0.1, 10, 10), false, new Vector3());
    body.isKinematic = false;
    body.linearVelocity.set(600, 0, 0);
    physics._update(1 / 60);

    expect(box.transform.position.x > 0).toBe(!useCCD);
    expect(body.linearVelocity.x < 600).toBe(useCCD);
  });

  it.each([false, true])("controls swept impacts against a dynamic target with useCCD=%s", (useCCD) => {
    const projectile = rootEntity.createChild();
    projectile.transform.setPosition(-5, 0, 0);
    const sphere = projectile.addComponent(SphereCollider);
    sphere.radius = 0.5;
    const body = projectile.addComponent(Rigidbody);
    body.useGravity = false;

    const box = addBox(new Vector3(0.1, 40, 40), true, new Vector3());
    const target = box.getComponent(Rigidbody);
    target.useGravity = false;
    target.mass = 20;
    for (const collider of [sphere, box.getComponent(BoxCollider)]) {
      const material = new PhysicsMaterial(engine);
      material.staticFriction = material.dynamicFriction = 1;
      material.bounciness = 0;
      collider.material = material;
    }

    const physics = engine.sceneManager.activeScene.physics;
    physics._update(1 / 60);
    body.useCCD = true;
    body.useCCD = useCCD;
    body.linearVelocity.set(600, 0, 120);
    physics._update(1 / 60);

    expect(projectile.transform.worldPosition.x > box.transform.worldPosition.x).toBe(!useCCD);
    expect(target.linearVelocity.x > 0).toBe(useCCD);
    expect(target.linearVelocity.z).toBeCloseTo(0, 4);
  });

  it.each([false, true])("controls speculative contacts on kinematic bodies with useCCD=%s", (useCCD) => {
    const moving = addBox(new Vector3(1, 1, 1), true, new Vector3(-5, 0, 0));
    const target = addBox(new Vector3(1, 1, 1), true, new Vector3());
    const movingBody = moving.getComponent(Rigidbody);
    const targetBody = target.getComponent(Rigidbody);
    movingBody.isKinematic = true;
    targetBody.useGravity = false;
    const physics = engine.sceneManager.activeScene.physics;
    physics._update(1 / 60);
    movingBody.useCCD = true;
    movingBody.useCCD = useCCD;
    movingBody.move(new Vector3(5, 0, 0));
    physics._update(1 / 60);

    expect(targetBody.linearVelocity.x > 0).toBe(useCCD);
  });

  it("sleep", function () {
    const box = addBox(new Vector3(2, 2, 2), true, new Vector3(0, 0, 0));
    const boxCollider = box.getComponent(Rigidbody);
    expect(boxCollider.isSleeping()).false;
    boxCollider.sleep();
    expect(boxCollider.isSleeping()).true;
  });

  it("wakeUp", function () {
    const box = addBox(new Vector3(2, 2, 2), true, new Vector3(0, 0, 0));
    const boxCollider = box.getComponent(Rigidbody);
    boxCollider.sleep();
    expect(boxCollider.isSleeping()).true;
    boxCollider.wakeUp();
    expect(boxCollider.isSleeping()).false;
  });

  it("applyForce", function () {
    const box = addBox(new Vector3(2, 2, 2), true, new Vector3(0, 0, 0));
    const boxCollider = box.getComponent(Rigidbody);

    boxCollider.applyForce(new Vector3(30, 0, 30));
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(box.transform.position.x)).eq(0.5);
    expect(formatValue(box.transform.position.z)).eq(0.5);
  });

  it("applyTorque", function () {
    const box = addBox(new Vector3(2, 2, 2), true, new Vector3(0, 0, 0));
    const boxCollider = box.getComponent(Rigidbody);

    boxCollider.automaticCenterOfMass = true;
    boxCollider.automaticInertiaTensor = true;

    boxCollider.applyTorque(new Vector3(0, 10, 0));
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(box.transform.rotation.y)).eq(13.96578);
  });

  it("move", function () {
    const box = addBox(new Vector3(2, 2, 2), true, new Vector3(0, 0, 0));
    const boxCollider = box.getComponent(Rigidbody);
    boxCollider.isKinematic = false;
    expect(() => boxCollider.move(new Vector3(1, 0, 0))).toThrow(/kinematic/);
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(box.transform.position.x)).eq(0);

    boxCollider.isKinematic = true;
    boxCollider.move(new Vector3(1, 0, 0));
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(box.transform.position.x)).eq(1);
  });

  it("stores velocities before scene entry and clones the current simulated velocities independently", () => {
    const source = new Entity(engine, "velocity source");
    source.addComponent(BoxCollider);
    const body = source.addComponent(Rigidbody);
    body.useGravity = false;
    body.angularDamping = 0;
    body.linearVelocity = new Vector3(2, 3, 4);
    body.angularVelocity = new Vector3(10, 20, 30);
    expect(Vector3.equals(body.linearVelocity, new Vector3(2, 3, 4))).toBe(true);
    expect(Vector3.equals(body.angularVelocity, new Vector3(10, 20, 30))).toBe(true);
    rootEntity.addChild(source);
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(source.transform.position.x).toBeCloseTo(2 / 60, 5);
    const linear = body.linearVelocity.clone();
    const angular = body.angularVelocity.clone();
    const clone = source.clone();
    clone.transform.setPosition(10, 0, 0);
    rootEntity.addChild(clone);
    const clonedBody = clone.getComponent(Rigidbody);
    expect(Vector3.equals(clonedBody.linearVelocity, linear)).toBe(true);
    expect(Vector3.equals(clonedBody.angularVelocity, angular)).toBe(true);
    expect(clonedBody.linearVelocity).not.toBe(body.linearVelocity);
    expect(clonedBody.angularVelocity).not.toBe(body.angularVelocity);
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(clone.transform.position.x).toBeCloseTo(10 + linear.x / 60, 5);
    clonedBody.linearVelocity.set(0, 0, 0);
    clonedBody.angularVelocity.set(0, 0, 0);
    expect(Vector3.equals(body.linearVelocity, linear)).toBe(true);
    expect(Vector3.equals(body.angularVelocity, angular)).toBe(true);
  });

  it("inActive modification", function () {
    const box = addBox(new Vector3(2, 2, 2), true, new Vector3(0, 0, 0));
    const boxCollider = box.getComponent(Rigidbody);
    box.isActive = false;
    boxCollider.automaticCenterOfMass = true;
    boxCollider.linearDamping = 0.1;
    boxCollider.angularDamping = 0.1;
    boxCollider.mass = 1;
    boxCollider.linearVelocity = new Vector3(1, 0, 0);
    boxCollider.angularVelocity = new Vector3(0, 1, 0);
    boxCollider.centerOfMass = new Vector3(1, 0, 0);
    boxCollider.inertiaTensor = new Vector3(0, 1, 0);
    boxCollider.maxAngularVelocity = 100;
    boxCollider.maxDepenetrationVelocity = 10;
    boxCollider.sleepThreshold = 100;
    boxCollider.solverIterations = 10;
    boxCollider.constraints = RigidbodyConstraints.FreezePositionX;
    boxCollider.useCCD = true;
    boxCollider.sleep();
    boxCollider.wakeUp();
    boxCollider.applyForce(new Vector3(1, 0, 0));
    boxCollider.applyForce(new Vector3(1, 0, 0), ForceMode.Impulse);
    boxCollider.applyForceAtPosition(new Vector3(1, 0, 0), new Vector3(0, 1, 0), ForceMode.Impulse);
    boxCollider.applyTorque(new Vector3(0, 1, 0));
    boxCollider.isKinematic = true;
    boxCollider.move(new Vector3(1, 0, 0));
    box.isActive = true;
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(box.transform.position.x).eq(0);
    boxCollider.move(new Vector3(1, 0, 0));
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(box.transform.position.x).eq(1);
    box.isActive = false;
    boxCollider.destroy();
  });

  it("allows destroying an entity after addComponent fails without a physics backend", async function () {
    const noPhysicsEngine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const entity = noPhysicsEngine.sceneManager.activeScene.createRootEntity("no-physics");
    expect(() => entity.addComponent(Rigidbody)).toThrow();
    expect(() => entity.destroy()).not.toThrow();
    noPhysicsEngine.destroy();
  });

  it("uses manually assigned mass properties until automatic calculation is enabled again", () => {
    const box = rootEntity.createChild();
    box.addComponent(BoxCollider).size.set(2, 2, 2);
    const body = box.addComponent(Rigidbody);
    body.useGravity = false;
    body.angularDamping = 0;

    body.centerOfMass = new Vector3(0, 1, 0);
    body.inertiaTensor.y = 9;
    expect(body.automaticCenterOfMass).toBe(false);
    expect(body.automaticInertiaTensor).toBe(false);
    expect(body.getWorldCenterOfMass(new Vector3()).y).toBe(1);

    const physics = engine.sceneManager.activeScene.physics;
    body.applyTorque(new Vector3(0, 1, 0));
    physics._update(physics.fixedTimeStep);
    expect(body.angularVelocity.y).toBeCloseTo(physics.fixedTimeStep / 9, 5);

    body.automaticCenterOfMass = true;
    body.automaticInertiaTensor = true;
    expect(body.centerOfMass.length()).toBe(0);
    expect(body.inertiaTensor.y).toBeCloseTo(2 / 3, 5);
  });

  it("reads velocities at world and body-local points using the simulated mass frame", () => {
    const box = rootEntity.createChild();
    box.transform.setPosition(2, 0, 0);
    box.transform.setRotation(0, 0, 90);
    const body = box.addComponent(Rigidbody);
    body.centerOfMass = new Vector3(1, 0, 0);
    body.linearVelocity.set(2, 0, 0);
    body.angularVelocity.set(0, 0, 1);

    const createActor = vi.spyOn(backend, "createDynamicActor");
    const out = rootEntity.createChild("velocity receiver").addComponent(Rigidbody).linearVelocity;
    expect(body.getWorldCenterOfMass(out)).toBe(out);
    expect(out.x).toBeCloseTo(2, 5);
    expect(out.y).toBeCloseTo(1, 5);
    const setLinearVelocity = vi.spyOn(createActor.mock.results[0].value, "setLinearVelocity");
    expect(body.getPointVelocity(new Vector3(2, 2, 0), out)).toBe(out);
    expect(setLinearVelocity).toHaveBeenCalledTimes(1);
    expect(out.x).toBeCloseTo(1, 5);
    expect(out.y).toBeCloseTo(0, 5);
    expect(body.getRelativePointVelocity(new Vector3(2, 0, 0), out)).toBe(out);
    expect(setLinearVelocity).toHaveBeenCalledTimes(2);
    expect(out.x).toBeCloseTo(1, 5);
    expect(out.y).toBeCloseTo(0, 5);

    const pointAlias = new Vector3(2, 2, 0);
    expect(body.getPointVelocity(pointAlias, pointAlias)).toBe(pointAlias);
    expect(pointAlias.x).toBeCloseTo(1, 5);
    expect(pointAlias.y).toBeCloseTo(0, 5);
    expect(pointAlias.z).toBeCloseTo(0, 5);

    const localAlias = new Vector3(2, 0, 0);
    expect(body.getRelativePointVelocity(localAlias, localAlias)).toBe(localAlias);
    expect(localAlias.x).toBeCloseTo(1, 5);
    expect(localAlias.y).toBeCloseTo(0, 5);
    expect(localAlias.z).toBeCloseTo(0, 5);
  });

  it("uses a pending kinematic target for physics queries before simulation", () => {
    const box = addBox(new Vector3(1, 1, 1), true, new Vector3(-2, 0, 0));
    const body = box.getComponent(Rigidbody);
    body.isKinematic = true;
    const physics = engine.sceneManager.activeScene.physics;
    const ray = new Ray(new Vector3(2, 0, 3), new Vector3(0, 0, -1));
    expect(physics.raycast(ray)).toBe(false);

    body.move(new Vector3(2, 0, 0));
    const hit = new HitResult();
    expect(physics.raycast(ray, hit)).toBe(true);
    expect(hit.collider).toBe(box.getComponent(BoxCollider));
    expect(box.transform.worldPosition.x).toBe(-2);
  });

  it("lets a dynamic body fall asleep naturally after resting on a surface", () => {
    addPlane(0, 0, 0);
    const box = addBox(new Vector3(1, 1, 1), true, new Vector3(0, 2, 0));
    const body = box.getComponent(Rigidbody);
    const physics = engine.sceneManager.activeScene.physics;

    for (let i = 0; i < 240 && !body.isSleeping(); i++) physics._update(physics.fixedTimeStep);
    expect(body.isSleeping()).toBe(true);
    expect(box.transform.worldPosition.y).toBeCloseTo(0.5, 2);
  });

  it.each([true, false])("merges partial inherited prefab input with manual input first: %s", async (inputFirst) => {
    Loader.registerClass("Rigidbody", Rigidbody);
    Loader.registerClass("HingeJoint", HingeJoint);
    Loader.registerClass("FixedJoint", FixedJoint);
    const baseUrl = "test://manual-physics.prefab";
    const base = await PrefabParser.parse(engine, baseUrl, {
      version: "2.0",
      refs: [],
      entities: [{ name: "body", components: [0, 1, 2] }],
      components: [
        { type: "Rigidbody", props: { centerOfMass: { x: 1, y: 2, z: 3 }, inertiaTensor: { x: 4, y: 5, z: 6 } } },
        { type: "HingeJoint", props: { connectedAnchor: { x: 1, y: 2, z: 3 } } },
        { type: "FixedJoint" }
      ],
      root: 0
    });
    vi.spyOn(engine.resourceManager, "getResourceByRef").mockResolvedValue(base);
    const massInput = { centerOfMass: { x: 7 }, inertiaTensor: { z: 9 } };
    const massMode = { automaticCenterOfMass: false, automaticInertiaTensor: false };
    const jointInput = { connectedAnchor: { y: 8 } };
    const jointMode = { automaticConnectedAnchor: false };
    const anchorInput = { anchor: { x: 1, y: 2, z: 3 } };
    const prefab = await PrefabParser.parse(engine, "test://manual-physics-override.prefab", {
      version: "2.0",
      refs: [{ url: baseUrl }],
      entities: [
        {
          instance: {
            asset: 0,
            overrides: {
              componentProps: [
                {
                  path: [],
                  selector: { type: "Rigidbody", index: 0 },
                  props: inputFirst ? { ...massInput, ...massMode } : { ...massMode, ...massInput }
                },
                {
                  path: [],
                  selector: { type: "HingeJoint", index: 0 },
                  props: inputFirst ? { ...jointInput, ...jointMode } : { ...jointMode, ...jointInput }
                },
                {
                  path: [],
                  selector: { type: "FixedJoint", index: 0 },
                  props: inputFirst ? { ...anchorInput, ...jointMode } : { ...jointMode, ...anchorInput }
                }
              ]
            }
          }
        }
      ],
      components: [],
      root: 0
    });
    const instance = prefab.instantiate();
    rootEntity.addChild(instance);
    const body = instance.getComponent(Rigidbody);
    const joint = instance.getComponent(HingeJoint);
    const fixed = instance.getComponent(FixedJoint);
    expect(body.automaticCenterOfMass).toBe(false);
    expect(body.automaticInertiaTensor).toBe(false);
    expect(joint.automaticConnectedAnchor).toBe(false);
    expect(Vector3.equals(body.centerOfMass, new Vector3(7, 2, 3))).toBe(true);
    expect(Vector3.equals(body.inertiaTensor, new Vector3(4, 5, 9))).toBe(true);
    expect(Vector3.equals(joint.connectedAnchor, new Vector3(1, 8, 3))).toBe(true);
    expect(fixed.automaticConnectedAnchor).toBe(false);
    expect(Vector3.equals(fixed.anchor, new Vector3(1, 2, 3))).toBe(true);
    expect(Vector3.equals(fixed.connectedAnchor, new Vector3())).toBe(true);
  });

  it("ignores force, torque, and move calls after destroy while the entity stays active", function () {
    const dynamicBox = addBox(new Vector3(2, 2, 2), true, new Vector3(0, 0, 0));
    const dynamicBody = dynamicBox.getComponent(Rigidbody);
    dynamicBody.destroy();
    expect(dynamicBody.destroyed).toBe(true);
    expect(() => dynamicBody.applyForce(new Vector3(10, 0, 0))).not.toThrow();
    expect(() => dynamicBody.applyForceAtPosition(new Vector3(10, 0, 0), new Vector3(0, 1, 0))).not.toThrow();
    expect(() => dynamicBody.applyForce(new Vector3(10, 0, 0), ForceMode.Impulse)).not.toThrow();
    expect(() =>
      dynamicBody.applyForceAtPosition(new Vector3(10, 0, 0), new Vector3(0, 1, 0), ForceMode.Impulse)
    ).not.toThrow();
    expect(() => dynamicBody.applyTorque(new Vector3(0, 10, 0))).not.toThrow();

    const kinematicBox = addBox(new Vector3(2, 2, 2), true, new Vector3(5, 0, 0));
    const kinematicBody = kinematicBox.getComponent(Rigidbody);
    kinematicBody.isKinematic = true;
    kinematicBody.destroy();
    expect(kinematicBody.destroyed).toBe(true);
    expect(() => kinematicBody.move(new Vector3(1, 2, 3))).not.toThrow();
  });

  it("accumulates small kinematic moves from the published world pose", () => {
    const entity = rootEntity.createChild("small steps");
    const body = entity.addComponent(Rigidbody);
    body.isKinematic = true;
    const { transform } = entity;
    useFixedTimeStep();
    const rotation = new Quaternion();
    for (let i = 0; i < 3; i++) {
      Quaternion.rotateZ(transform.worldRotationQuaternion, 1e-6, rotation);
      body.move(new Vector3(transform.worldPosition.x + 5e-7, 0, 0), rotation);
      engine.update();
    }
    expect(transform.worldPosition.x).toBeCloseTo(1.5e-6, 12);
    expect(transform.worldRotationQuaternion.z).toBeCloseTo(Math.sin(1.5e-6), 12);
  });

  it("preserves both position and rotation when move(pos) and move(rot) are called in the same step", function () {
    const physics = engine.sceneManager.activeScene.physics;
    const targetRot = new Quaternion();
    Quaternion.rotationYawPitchRoll(Math.PI / 2, 0, 0, targetRot);

    // Move position first so rotation must preserve the queued translation.
    const boxA = addBox(new Vector3(2, 2, 2), true, new Vector3(0, 0, 0));
    const bodyA = boxA.getComponent(Rigidbody);
    bodyA.isKinematic = true;
    bodyA.centerOfMass = new Vector3(0.5, 0.25, -0.5);
    bodyA.move(new Vector3(4, 2, -1));
    bodyA.move(targetRot);
    physics._update(physics.fixedTimeStep);
    expect(boxA.transform.worldPosition.x).toBeCloseTo(4, 4);
    expect(boxA.transform.worldPosition.y).toBeCloseTo(2, 4);
    expect(boxA.transform.worldPosition.z).toBeCloseTo(-1, 4);
    expect(Math.abs(Quaternion.dot(boxA.transform.worldRotationQuaternion, targetRot))).toBeCloseTo(1, 4);

    // Reverse the calls so translation must preserve the queued rotation.
    const boxB = addBox(new Vector3(2, 2, 2), true, new Vector3(0, 5, 0));
    const bodyB = boxB.getComponent(Rigidbody);
    bodyB.isKinematic = true;
    bodyB.move(targetRot);
    bodyB.move(new Vector3(-3, 6, 2));
    physics._update(physics.fixedTimeStep);
    expect(boxB.transform.worldPosition.x).toBeCloseTo(-3, 4);
    expect(boxB.transform.worldPosition.y).toBeCloseTo(6, 4);
    expect(boxB.transform.worldPosition.z).toBeCloseTo(2, 4);
    expect(Math.abs(Quaternion.dot(boxB.transform.worldRotationQuaternion, targetRot))).toBeCloseTo(1, 4);

    // A direct Transform edit becomes the starting pose for the next move.
    bodyB.move(new Vector3(99, 99, 99));
    boxB.transform.setPosition(10, 11, 12);
    const rot2 = new Quaternion();
    Quaternion.rotationYawPitchRoll(0, Math.PI / 4, 0, rot2);
    bodyB.move(rot2);
    physics._update(physics.fixedTimeStep);
    expect(boxB.transform.worldPosition.x).toBeCloseTo(10, 4);
    expect(boxB.transform.worldPosition.y).toBeCloseTo(11, 4);
    expect(boxB.transform.worldPosition.z).toBeCloseTo(12, 4);
    expect(Math.abs(Quaternion.dot(boxB.transform.worldRotationQuaternion, rot2))).toBeCloseTo(1, 4);
  });

  it("ignores kinematic move targets with zero or non-finite rotations", function () {
    const physics = engine.sceneManager.activeScene.physics;
    const initialRot = new Quaternion();
    Quaternion.rotationYawPitchRoll(Math.PI / 2, 0, 0, initialRot);
    const box = addBox(new Vector3(2, 2, 2), true, new Vector3(1, 2, 3));
    box.transform.worldRotationQuaternion = initialRot;
    const body = box.getComponent(Rigidbody);
    body.isKinematic = true;

    for (const invalidRot of [
      new Quaternion(0, 0, 0, 0),
      new Quaternion(Number.NaN, 0, 0, 1),
      new Quaternion(Number.POSITIVE_INFINITY, 0, 0, 1)
    ]) {
      body.move(new Vector3(9, 8, 7), invalidRot);
      body.move(invalidRot);
    }
    physics._update(physics.fixedTimeStep);
    expect(box.transform.worldPosition.x).toBeCloseTo(1, 4);
    expect(box.transform.worldPosition.y).toBeCloseTo(2, 4);
    expect(box.transform.worldPosition.z).toBeCloseTo(3, 4);
    expect(Math.abs(Quaternion.dot(box.transform.worldRotationQuaternion, initialRot))).toBeCloseTo(1, 4);

    // An invalid rotation must also leave an already queued valid target intact.
    const validRot = new Quaternion();
    Quaternion.rotationYawPitchRoll(0, Math.PI / 4, 0, validRot);
    body.move(new Vector3(4, 5, 6), validRot);
    body.move(new Vector3(99, 99, 99), new Quaternion(0, 0, 0, 0));
    body.move(new Quaternion(Number.NaN, 0, 0, 1));
    physics._update(physics.fixedTimeStep);
    expect(box.transform.worldPosition.x).toBeCloseTo(4, 4);
    expect(box.transform.worldPosition.y).toBeCloseTo(5, 4);
    expect(box.transform.worldPosition.z).toBeCloseTo(6, 4);
    expect(Math.abs(Quaternion.dot(box.transform.worldRotationQuaternion, validRot))).toBeCloseTo(1, 4);
  });

  it.each(["convex-then-dynamic", "dynamic-then-convex", "clear-then-dynamic"] as const)(
    "switches a kinematic body with an active non-convex MeshCollider to dynamic (%s)",
    function (order) {
      const physics = engine.sceneManager.activeScene.physics;
      const entity = rootEntity.createChild(`mesh-to-dynamic-${order}`);
      entity.transform.setPosition(0, 5, 0);
      const body = entity.addComponent(Rigidbody);
      body.isKinematic = true;
      const meshCollider = entity.addComponent(MeshCollider);
      meshCollider.convex = false;
      meshCollider.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 2, { keepMeshData: true });

      const ray = new Ray(new Vector3(0, 10, 0), new Vector3(0, -1, 0));
      const hit = new HitResult();
      expect(physics.raycast(ray, hit)).toBe(true);
      expect(hit.collider).toBe(meshCollider);

      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      if (order === "convex-then-dynamic") {
        meshCollider.convex = true;
        body.isKinematic = false;
      } else if (order === "dynamic-then-convex") {
        body.isKinematic = false;
        meshCollider.convex = true;
      } else {
        meshCollider.mesh = null;
        body.isKinematic = false;
      }

      const queryHit = new HitResult();
      expect(physics.raycast(ray, queryHit) && queryHit.collider === meshCollider).toBe(order !== "clear-then-dynamic");
      body.wakeUp();
      for (let i = 0; i < 18; i++) {
        physics._update(physics.fixedTimeStep);
      }
      expect(errors).not.toHaveBeenCalled();
      expect(entity.transform.position.y).toBeLessThan(4.8);
      expect(body.linearVelocity.y).toBeLessThan(0);
    }
  );

  it.each(["none", "same-position", "different-position"] as const)(
    "keeps a pending kinematic move until an ancestor transform actually changes (%s)",
    (parentEdit) => {
      const physics = engine.sceneManager.activeScene.physics;
      const parent = rootEntity.createChild("ancestor");
      parent.transform.setPosition(0.3, 0, 0);
      const child = parent.createChild("kinematic actor");
      // The world position is stored as Float64, while recomputing it from the Float32 world matrix rounds it
      child.transform.worldPosition = new Vector3(0.2, 0, 0);
      const body = child.addComponent(Rigidbody);
      body.isKinematic = true;
      const box = child.addComponent(BoxCollider);
      const hit = new HitResult();
      const hits = (x: number, z: number) =>
        physics.raycast(new Ray(new Vector3(x, 8, z), new Vector3(0, -1, 0)), hit) && hit.collider === box;
      expect(hits(0.2, 0)).toBe(true);
      expect(hits(0.2, 3)).toBe(false);

      body.move(new Vector3(0.2, 0, 3));
      if (parentEdit !== "none") {
        parent.transform.setPosition(parentEdit === "same-position" ? 0.3 : 1.3, 0, 0);
      }
      physics._update(physics.fixedTimeStep);

      if (parentEdit === "different-position") {
        // An actual ancestor edit overrides the pending kinematic target
        expect(hits(1.2, 0)).toBe(true);
        expect(hits(1.2, 3)).toBe(false);
      } else {
        expect(hits(0.2, 3)).toBe(true);
        expect(hits(0.2, 0)).toBe(false);
      }
    }
  );

  it("applyForce with ForceMode.Impulse changes linear velocity independently of fixedTimeStep with zero torque on manual and automatic offset centers of mass", () => {
    const physics = engine.sceneManager.activeScene.physics;
    const impulse = new Vector3(6, 0, -4);

    const runManualBody = (stepDuration: number) => {
      const box = addBox(new Vector3(2, 2, 2), true, new Vector3(1, 2, 3));
      box.transform.setRotation(0, 90, 0);
      const body = box.getComponent(Rigidbody);
      body.mass = 2;
      body.useGravity = false;
      body.linearDamping = 0;
      body.angularDamping = 0;
      body.centerOfMass = new Vector3(1, -0.5, 0.25);
      body.inertiaTensor = new Vector3(1, 1, 1);

      body.applyForce(impulse, ForceMode.Impulse);
      physics._update(stepDuration);
      expect(body.linearVelocity.x).toBeCloseTo(3, 4);
      expect(body.linearVelocity.y).toBeCloseTo(0, 4);
      expect(body.linearVelocity.z).toBeCloseTo(-2, 4);
      expect(body.angularVelocity.length()).toBeCloseTo(0, 5);
      box.destroy();
    };

    runManualBody(physics.fixedTimeStep);

    const originalTimeStep = physics.fixedTimeStep;
    physics.fixedTimeStep = 1 / 30;
    try {
      runManualBody(physics.fixedTimeStep);
    } finally {
      physics.fixedTimeStep = originalTimeStep;
    }

    const autoEntity = rootEntity.createChild("auto-com-impulse");
    autoEntity.transform.setRotation(0, 90, 0);
    const autoCollider = autoEntity.addComponent(BoxCollider);
    autoCollider.center = new Vector3(1.5, -0.5, 0.25);
    const autoBody = autoEntity.addComponent(Rigidbody);
    autoBody.automaticCenterOfMass = true;
    autoBody.automaticInertiaTensor = true;
    autoBody.mass = 2;
    autoBody.useGravity = false;
    autoBody.linearDamping = 0;
    autoBody.angularDamping = 0;

    // Apply immediately before any physics step so pending collider mass/COM properties must sync first.
    autoBody.applyForce(new Vector3(4, 0, 0), ForceMode.Impulse);
    physics._update(physics.fixedTimeStep);
    expect(autoBody.linearVelocity.x).toBeCloseTo(2, 4);
    expect(autoBody.linearVelocity.y).toBeCloseTo(0, 4);
    expect(autoBody.linearVelocity.z).toBeCloseTo(0, 4);
    expect(autoBody.angularVelocity.length()).toBeCloseTo(0, 5);

    autoBody.sleep();
    expect(autoBody.isSleeping()).toBe(true);
    autoBody.applyForce(new Vector3(1, 0, 0), ForceMode.Impulse);
    expect(autoBody.isSleeping()).toBe(false);
  });

  it("applyForceAtPosition supports Force and Impulse in world space and rejects unsupported modes", () => {
    const physics = engine.sceneManager.activeScene.physics;
    const setupBox = () => {
      const box = addBox(new Vector3(2, 2, 2), true, new Vector3(5, 2, -3));
      box.transform.setRotation(0, 90, 0);
      const body = box.getComponent(Rigidbody);
      body.mass = 2;
      body.useGravity = false;
      body.linearDamping = 0;
      body.angularDamping = 0;
      body.centerOfMass = new Vector3(1, 0, 0);
      body.inertiaTensor = new Vector3(1, 1, 1);
      return body;
    };

    const impulse = new Vector3(2, 0, 0);
    const position = new Vector3(5, 3, -4);

    const reference = setupBox();
    reference.applyForceAtPosition(impulse.clone().scale(1 / physics.fixedTimeStep), position);
    physics._update(physics.fixedTimeStep);
    const referenceLinearVelocity = reference.linearVelocity.clone();
    const referenceAngularVelocity = reference.angularVelocity.clone();
    expect(referenceLinearVelocity.x).toBeCloseTo(1, 4);
    expect(referenceAngularVelocity.z).toBeLessThan(0);

    while (rootEntity.children.length) rootEntity.children[0].destroy();

    const target = setupBox();
    target.applyForceAtPosition(impulse, position, ForceMode.Impulse);
    physics._update(physics.fixedTimeStep);

    expect(target.linearVelocity.x).toBeCloseTo(referenceLinearVelocity.x, 4);
    expect(target.linearVelocity.y).toBeCloseTo(referenceLinearVelocity.y, 4);
    expect(target.linearVelocity.z).toBeCloseTo(referenceLinearVelocity.z, 4);
    expect(target.angularVelocity.x).toBeCloseTo(referenceAngularVelocity.x, 4);
    expect(target.angularVelocity.y).toBeCloseTo(referenceAngularVelocity.y, 4);
    expect(target.angularVelocity.z).toBeCloseTo(referenceAngularVelocity.z, 4);
    expect(target.angularVelocity.z).toBeLessThan(0);

    expect(() => target.applyForceAtPosition(impulse, position, ForceMode.VelocityChange as never)).toThrow(RangeError);
    expect(() => target.applyForceAtPosition(impulse, position, ForceMode.Acceleration as never)).toThrow(RangeError);
    const detached = new Entity(engine).addComponent(Rigidbody);
    detached.isKinematic = true;
    expect(() => detached.applyForceAtPosition(impulse, position, ForceMode.VelocityChange as never)).toThrow(
      RangeError
    );
    expect(() => detached.applyForceAtPosition(impulse, position, ForceMode.Acceleration as never)).toThrow(RangeError);
  });

  it.each([ForceMode.Acceleration, ForceMode.VelocityChange])("applies mass-independent force mode %s", (mode) => {
    const physics = engine.sceneManager.activeScene.physics;
    const body = rootEntity.createChild().addComponent(Rigidbody);
    body.mass = 5;
    body.useGravity = false;

    body.applyForce(new Vector3(2, 0, 0), mode);
    physics._update(physics.fixedTimeStep);

    expect(body.linearVelocity.x).toBeCloseTo(mode === ForceMode.Acceleration ? 2 * physics.fixedTimeStep : 2, 5);
  });

  describe("body-local forces", () => {
    function createBody(): Rigidbody {
      const entity = rootEntity.createChild();
      const body = entity.addComponent(Rigidbody);
      body.mass = 2;
      body.useGravity = false;
      body.linearDamping = 0;
      body.angularDamping = 0;
      body.centerOfMass.set(1, 0, 0);
      entity.transform.setPosition(5, 2, -3);
      entity.transform.setScale(2, 3, 4);
      entity.transform.setRotation(0, 0, 90);
      return body;
    }

    it.each([ForceMode.Force, ForceMode.Impulse, ForceMode.VelocityChange, ForceMode.Acceleration] as const)(
      "uses the body's current rotation in relative force and torque mode %s",
      (mode) => {
        const physics = engine.sceneManager.activeScene.physics;
        const dt = physics.fixedTimeStep;
        const speed =
          mode === ForceMode.Force
            ? dt
            : mode === ForceMode.Impulse
              ? 1
              : mode === ForceMode.VelocityChange
                ? 2
                : 2 * dt;
        const body = createBody();
        body.inertiaTensor.set(2, 2, 2);

        body.applyRelativeForce(new Vector3(2, 0, 0), mode);
        body.applyRelativeTorque(new Vector3(0, 2, 0), mode);
        physics._update(dt);

        expect(body.linearVelocity.x).toBeCloseTo(0, 5);
        expect(body.linearVelocity.y).toBeCloseTo(speed, 5);
        expect(body.linearVelocity.z).toBeCloseTo(0, 5);
        expect(body.angularVelocity.x).toBeCloseTo(-speed, 5);
        expect(body.angularVelocity.y).toBeCloseTo(0, 5);
        expect(body.angularVelocity.z).toBeCloseTo(0, 5);
      }
    );
  });

  describe("explosion force", () => {
    function createBody(): Rigidbody {
      const body = rootEntity.createChild().addComponent(Rigidbody);
      body.mass = 2;
      body.useGravity = false;
      body.angularDamping = 0;
      body.centerOfMass = new Vector3();
      body.inertiaTensor.set(2, 2, 4);
      return body;
    }

    it.each([ForceMode.Force, ForceMode.Impulse, ForceMode.Acceleration, ForceMode.VelocityChange] as const)(
      "uses the nearest compound surface for force and torque in mode %s",
      (mode) => {
        const physics = engine.sceneManager.activeScene.physics;
        const dt = physics.fixedTimeStep;
        const speed =
          mode === ForceMode.Force ? dt : mode === ForceMode.Impulse ? 1 : mode === ForceMode.Acceleration ? 2 * dt : 2;
        const spin =
          mode === ForceMode.Force ? dt : mode === ForceMode.Impulse ? 1 : mode === ForceMode.Acceleration ? 4 * dt : 4;
        const body = createBody();
        body.entity.addComponent(SphereCollider).center.set(10, 1, 0);
        const near = body.entity.addComponent(SphereCollider);
        near.radius = 1;
        near.center.set(2, 1, 0);

        body.applyExplosionForce(4, new Vector3(2, -2, 0), 4, 1, mode);
        physics._update(dt);

        expect(body.linearVelocity.y).toBeCloseTo(speed, 5);
        expect(body.linearVelocity.x).toBeCloseTo(0, 5);
        expect(body.angularVelocity.z).toBeCloseTo(spin, 5);
      }
    );

    it.each([false, true])(
      "uses center of mass and applies full strength at radius zero (has shape=%s)",
      (hasShape) => {
        const physics = engine.sceneManager.activeScene.physics;
        const body = createBody();
        if (hasShape) body.entity.addComponent(SphereCollider).radius = 2;
        body.centerOfMass.set(1, 0, 0);
        const origin = new Vector3();

        body.applyExplosionForce(100, origin, 0.5, 0, ForceMode.Impulse);
        body.applyExplosionForce(2 * Math.SQRT2, origin, 0, 1, ForceMode.Impulse);
        physics._update(physics.fixedTimeStep);

        expect(body.linearVelocity.x).toBeCloseTo(1, 5);
        expect(body.linearVelocity.y).toBeCloseTo(1, 5);
        expect(body.angularVelocity.length()).toBe(0);
      }
    );
  });

  it("preserves automatically computed inertia when only the principal axes are set", () => {
    const entity = rootEntity.createChild();
    entity.addComponent(BoxCollider).size.set(2, 4, 8);
    const body = entity.addComponent(Rigidbody);
    body.mass = 12;
    body.inertiaTensorRotation = new Quaternion().rotateZ(Math.PI / 3);
    expect(body.automaticInertiaTensor).toBe(false);
    expect(body.inertiaTensor.x).toBeCloseTo(80);
    expect(body.inertiaTensor.y).toBeCloseTo(68);
    expect(body.inertiaTensor.z).toBeCloseTo(20);
  });

  it("applies angular impulse around the authored inertia axes after center of mass changes", () => {
    const physics = engine.sceneManager.activeScene.physics;
    const entity = rootEntity.createChild();
    const collider = entity.addComponent(BoxCollider);
    const body = entity.addComponent(Rigidbody);
    body.useGravity = false;
    body.angularDamping = 0;
    body.inertiaTensor = new Vector3(2, 3, 4);
    body.inertiaTensorRotation = new Quaternion().rotateZ(Math.PI / 2);
    expect(body.automaticInertiaTensor).toBe(false);

    body.centerOfMass = new Vector3(1, 0, 0);
    body.automaticCenterOfMass = true;
    collider.center = new Vector3(2, 0, 0);
    body.applyTorque(new Vector3(3, 0, 0), ForceMode.Impulse);
    physics._update(physics.fixedTimeStep);

    expect(body.centerOfMass.x).toBeCloseTo(2, 5);
    expect(body.angularVelocity.x).toBeCloseTo(1, 5);
    expect(body.angularVelocity.y).toBeCloseTo(0, 5);
    expect(body.angularVelocity.z).toBeCloseTo(0, 5);
  });

  it("samples animated principal axes through the Rigidbody setter", () => {
    const entity = rootEntity.createChild();
    entity.addComponent(BoxCollider);
    const body = entity.addComponent(Rigidbody);
    body.useGravity = false;
    body.angularDamping = 0;
    body.inertiaTensor = new Vector3(2, 3, 4);
    const previous = body.inertiaTensorRotation;
    const clip = new AnimationClip("principal axes");
    const curve = new AnimationQuaternionCurve();
    curve.addKey({ time: 0, value: new Quaternion().rotateZ(Math.PI / 2) });
    clip.addCurveBinding("", Rigidbody, "inertiaTensorRotation", curve);
    clip.sampleAnimation(entity, 0);

    expect(previous.z).toBe(0);
    expect(body.inertiaTensorRotation.z).toBeCloseTo(Math.SQRT1_2);
    body.applyTorque(new Vector3(3, 0, 0), ForceMode.Impulse);
    const physics = entity.scene.physics;
    physics._update(physics.fixedTimeStep);
    expect(body.angularVelocity.x).toBeCloseTo(1);
  });

  it("uses read-only snapshot whole-value semantics and atomic validation on inertiaTensorRotation", () => {
    const physics = engine.sceneManager.activeScene.physics;
    const entity = rootEntity.createChild("snapshot-inertia-rotation");
    const collider = entity.addComponent(BoxCollider);
    collider.size.set(2, 4, 6);
    const body = entity.addComponent(Rigidbody);
    body.useGravity = false;
    body.angularDamping = 0;

    // Reading while automatic does not turn off automaticInertiaTensor.
    const autoRotation = body.inertiaTensorRotation;
    expect(body.automaticInertiaTensor).toBe(true);
    expect(() => Reflect.set(autoRotation, "z", 1)).toThrow(TypeError);
    expect(autoRotation).toMatchObject({ x: 0, y: 0, z: 0, w: 1 });

    // Non-unit whole-value assignment normalizes, disables auto, preserves computed tensor, and leaves old snapshot intact.
    const z30 = Math.sin(Math.PI / 12);
    const w30 = Math.cos(Math.PI / 12);
    body.inertiaTensorRotation = { x: 0, y: 0, z: 2 * z30, w: 2 * w30 };
    expect(body.automaticInertiaTensor).toBe(false);
    expect(() => Reflect.set(body.inertiaTensorRotation, "z", 0)).toThrow(TypeError);
    expect(body.inertiaTensorRotation.z).toBeCloseTo(z30, 5);
    expect(body.inertiaTensorRotation.w).toBeCloseTo(w30, 5);
    expect(autoRotation).toMatchObject({ x: 0, y: 0, z: 0, w: 1 });
    expect(body.inertiaTensor.x).toBeGreaterThan(0);

    // Manual assignment updates simulated principal axes.
    body.inertiaTensor = new Vector3(2, 3, 4);
    body.inertiaTensorRotation = new Quaternion().rotateZ(Math.PI / 2);
    expect(body.inertiaTensorRotation.w).toBeCloseTo(Math.SQRT1_2, 5);
    body.applyTorque(new Vector3(3, 0, 0), ForceMode.Impulse);
    physics._update(physics.fixedTimeStep);
    expect(body.angularVelocity.x).toBeCloseTo(1, 5);

    // Invalid assignment throws without mutating stored snapshot or changing auto mode.
    body.automaticInertiaTensor = true;
    const shapeEntity = entity.createChild("rotated-shape");
    shapeEntity.transform.rotation.z = 30;
    shapeEntity.addComponent(BoxCollider).size.set(2, 4, 6);
    const computedBeforeInvalid = body.inertiaTensorRotation;
    expect(() => (body.inertiaTensorRotation = { x: 0, y: 0, z: 0, w: 0 })).toThrow();
    expect(() => (body.inertiaTensorRotation = { x: Number.NaN, y: 0, z: 0, w: 1 })).toThrow();
    expect(body.automaticInertiaTensor).toBe(true);
    const afterInvalid = body.inertiaTensorRotation;
    const dotAuto =
      afterInvalid.x * computedBeforeInvalid.x +
      afterInvalid.y * computedBeforeInvalid.y +
      afterInvalid.z * computedBeforeInvalid.z +
      afterInvalid.w * computedBeforeInvalid.w;
    expect(Math.abs(dotAuto)).toBeCloseTo(1, 5);

    // Assigning the read-only snapshot back switches to manual mode while preserving its value.
    body.inertiaTensorRotation = computedBeforeInvalid;
    expect(body.automaticInertiaTensor).toBe(false);
    const locked = body.inertiaTensorRotation;
    const dotLocked =
      locked.x * computedBeforeInvalid.x +
      locked.y * computedBeforeInvalid.y +
      locked.z * computedBeforeInvalid.z +
      locked.w * computedBeforeInvalid.w;
    expect(Math.abs(dotLocked)).toBeCloseTo(1, 5);

    // Invalid assignment in manual mode leaves the previous valid rotation untouched.
    const manual = new Quaternion().rotateZ(Math.PI / 2);
    body.inertiaTensorRotation = manual;
    expect(() => (body.inertiaTensorRotation = { x: 0, y: 0, z: 0, w: 0 })).toThrow();
    const afterManualInvalid = body.inertiaTensorRotation;
    const dotManual =
      afterManualInvalid.x * manual.x +
      afterManualInvalid.y * manual.y +
      afterManualInvalid.z * manual.z +
      afterManualInvalid.w * manual.w;
    expect(Math.abs(dotManual)).toBeCloseTo(1, 5);

    // Cloned body isolates inertiaTensorRotation snapshots.
    const clonedEntity = entity.clone();
    const clonedBody = clonedEntity.getComponent(Rigidbody)!;
    expect(clonedBody.automaticInertiaTensor).toBe(false);
    expect(clonedBody.inertiaTensorRotation).not.toBe(body.inertiaTensorRotation);
    body.inertiaTensorRotation = new Quaternion();
    expect(clonedBody.inertiaTensorRotation.w).toBeCloseTo(Math.SQRT1_2, 5);
    clonedEntity.destroy();

    // Same-reference assignments on mutable vector properties preserve automatic modes.
    body.automaticCenterOfMass = true;
    body.centerOfMass = body.centerOfMass;
    expect(body.automaticCenterOfMass).toBe(true);
    body.automaticInertiaTensor = true;
    body.inertiaTensor = body.inertiaTensor;
    expect(body.automaticInertiaTensor).toBe(true);
  });

  it("ignores non-finite force inputs and force calls on kinematic bodies", () => {
    const physics = engine.sceneManager.activeScene.physics;

    const kinematicBox = addBox(new Vector3(2, 2, 2), true, new Vector3(0, 0, 0));
    const kinematicBody = kinematicBox.getComponent(Rigidbody);
    kinematicBody.isKinematic = true;
    expect(() => kinematicBody.applyForce(new Vector3(5, 0, 0), ForceMode.Impulse)).not.toThrow();
    expect(() =>
      kinematicBody.applyForceAtPosition(new Vector3(5, 0, 0), new Vector3(0, 1, 0), ForceMode.Impulse)
    ).not.toThrow();
    physics._update(physics.fixedTimeStep);
    expect(kinematicBody.linearVelocity.length()).toBe(0);
    expect(kinematicBody.angularVelocity.length()).toBe(0);

    const dynamicBox = addBox(new Vector3(2, 2, 2), true, new Vector3(5, 0, 0));
    const dynamicBody = dynamicBox.getComponent(Rigidbody);
    dynamicBody.mass = 2;
    dynamicBody.useGravity = false;
    dynamicBody.linearDamping = 0;
    dynamicBody.angularDamping = 0;

    expect(() => dynamicBody.applyForce(new Vector3(Number.NaN, 0, 0), ForceMode.Impulse)).not.toThrow();
    expect(() => dynamicBody.applyForce(new Vector3(Number.POSITIVE_INFINITY, 0, 0), ForceMode.Impulse)).not.toThrow();
    expect(() =>
      dynamicBody.applyForceAtPosition(new Vector3(Number.NaN, 1, 0), new Vector3(5, 1, 0), ForceMode.Impulse)
    ).not.toThrow();
    expect(() =>
      dynamicBody.applyForceAtPosition(
        new Vector3(1, 0, 0),
        new Vector3(5, Number.POSITIVE_INFINITY, 0),
        ForceMode.Impulse
      )
    ).not.toThrow();
    physics._update(physics.fixedTimeStep);
    expect(dynamicBody.linearVelocity.length()).toBe(0);
    expect(dynamicBody.angularVelocity.length()).toBe(0);

    dynamicBody.applyForce(new Vector3(2, 0, 0), ForceMode.Impulse);
    physics._update(physics.fixedTimeStep);
    expect(dynamicBody.linearVelocity.x).toBeCloseTo(1, 4);
  });

  it("detaches reparented child shapes when a disabled Rigidbody moves across scenes", () => {
    const sourceScene = engine.sceneManager.activeScene;
    const otherScene = new Scene(engine);
    engine.sceneManager.addScene(otherScene);
    try {
      const parent = sourceScene.createRootEntity("disabled-body");
      parent.transform.setPosition(0, 50, 0);
      const body = parent.addComponent(Rigidbody);
      const child = parent.createChild("reparented-child");
      const box = child.addComponent(BoxCollider);

      const ray = new Ray(new Vector3(0, 55, 0), new Vector3(0, -1, 0));
      expect(sourceScene.physics.raycast(ray, 10)).toBe(true);

      body.enabled = false;
      const newParent = sourceScene.createRootEntity("new-parent");
      newParent.transform.setPosition(0, 50, 0);
      newParent.addChild(child);
      otherScene.addRootEntity(parent);
      body.enabled = true;

      expect(box.attachedRigidbody).toBeNull();
      expect(otherScene.physics.raycast(ray, 10)).toBe(false);
      expect(sourceScene.physics.raycast(ray, 10)).toBe(true);
      parent.transform.setPosition(0, 80, 0);
      expect(otherScene.physics.raycast(new Ray(new Vector3(0, 85, 0), new Vector3(0, -1, 0)), 10)).toBe(false);
    } finally {
      otherScene.destroy();
    }
  });

  it("flushes mass edits on disabled Rigidbodies when reading centerOfMass or inertiaTensor", () => {
    const entity = rootEntity.createChild("disabled-mass");
    const child = entity.createChild();
    const box = child.addComponent(BoxCollider);
    box.size.set(2, 2, 2);
    box.center.set(3, 0, 0);
    const body = entity.addComponent(Rigidbody);
    body.mass = 2;
    const baseInertiaX = body.inertiaTensor.x;

    body.enabled = false;
    body.mass = 10;
    child.transform.position.x = 2;
    body.automaticCenterOfMass = false;
    expect(body.centerOfMass.x).toBeCloseTo(5, 4);
    expect(body.inertiaTensor.x).toBeCloseTo(baseInertiaX * 5, 4);
  });

  it("skips getGlobalPose for continuously sleeping bodies while preserving sleeping nested body world poses", () => {
    const physics = engine.sceneManager.activeScene.physics;
    const box = addBox(new Vector3(1, 1, 1), true, new Vector3(0, 30, 0));
    const body = box.getComponent(Rigidbody);
    body.useGravity = false;
    body.sleep();
    physics._update(physics.fixedTimeStep);
    expect(body.isSleeping()).toBe(true);

    const pxActor = (body as any)._nativeActor._pxActor;
    const poseSpy = vi.spyOn(pxActor, "getGlobalPose");
    physics._update(physics.fixedTimeStep);
    physics._update(physics.fixedTimeStep);
    expect(poseSpy).not.toHaveBeenCalled();

    const parent = rootEntity.createChild("moving-parent");
    const parentBody = parent.addComponent(Rigidbody);
    parentBody.isKinematic = true;
    const child = parent.createChild("sleeping-child");
    child.transform.setPosition(0, 20, 0);
    child.addComponent(BoxCollider);
    const childBody = child.addComponent(Rigidbody);
    childBody.useGravity = false;
    childBody.sleep();
    physics._update(physics.fixedTimeStep);

    parentBody.move(new Vector3(10, 0, 0));
    physics._update(physics.fixedTimeStep);
    expect(child.transform.worldPosition.x).toBeCloseTo(0, 4);
    expect(child.transform.worldPosition.y).toBeCloseTo(20, 4);
  });

  it("re-arms child transform dirty flags after compound Rigidbody writeback", () => {
    const physics = engine.sceneManager.activeScene.physics;
    const parent = rootEntity.createChild("compound-move");
    const body = parent.addComponent(Rigidbody);
    body.useGravity = false;
    body.linearVelocity = new Vector3(2, 0, 0);
    const child = parent.createChild("child");
    const box = child.addComponent(BoxCollider);

    physics._update(physics.fixedTimeStep);
    child.transform.position.set(0, 5, 0);
    const hit = new HitResult();
    expect(
      physics.raycast(new Ray(new Vector3(parent.transform.worldPosition.x, 8, 0), new Vector3(0, -1, 0)), 10, hit)
    ).toBe(true);
    expect(hit.collider).toBe(box);
    expect(hit.point.y).toBeCloseTo(5.5, 2);
  });

  it("applies sleep() during entity deactivation without deferring sleep to re-activation", () => {
    const physics = engine.sceneManager.activeScene.physics;
    const deactEntity = rootEntity.createChild("deact-sleep");
    deactEntity.addComponent(BoxCollider);
    let sleptInDisable = false;
    deactEntity.addComponent(
      class extends Script {
        override onDisable(): void {
          deactBody.sleep();
          sleptInDisable = deactBody.isSleeping();
        }
      }
    );
    const deactBody = deactEntity.addComponent(Rigidbody);
    deactBody.useGravity = false;
    deactEntity.isActive = false;
    expect(sleptInDisable).toBe(true);

    deactEntity.isActive = true;
    physics._update(physics.fixedTimeStep);
    expect(deactBody.isSleeping()).toBe(false);
  });

  it("does not re-dirty moving bodies during write-back while still syncing subsequent user Transform edits", () => {
    const physics = engine.sceneManager.activeScene.physics;
    const entity = rootEntity.createChild("writeback-dirty-check");
    const box = entity.addComponent(BoxCollider);
    const body = entity.addComponent(Rigidbody);
    body.useGravity = false;
    body.linearVelocity = new Vector3(1, 0, 0);
    body.angularVelocity = new Vector3(0, 1, 0);

    physics._update(physics.fixedTimeStep);
    const setWorldTransform = vi.spyOn(body._getNativeActor(), "setWorldTransform");
    try {
      physics._update(physics.fixedTimeStep);
      expect(setWorldTransform).not.toHaveBeenCalled();

      entity.transform.setPosition(0, 5, 0);
      const hit = new HitResult();
      expect(physics.raycast(new Ray(new Vector3(0, 5, 5), new Vector3(0, 0, -1)), 10, hit)).toBe(true);
      expect(hit.collider).toBe(box);
      expect(physics.raycast(new Ray(new Vector3(0, 0, 5), new Vector3(0, 0, -1)), 10, hit)).toBe(false);
      expect(setWorldTransform).toHaveBeenCalledTimes(1);
    } finally {
      setWorldTransform.mockRestore();
    }
  });

  it("does not sync native pose on a co-moving child Rigidbody when parent write-back shifts its Transform equally", () => {
    const physics = engine.sceneManager.activeScene.physics;
    const parent = rootEntity.createChild("co-moving-parent");
    parent.addComponent(BoxCollider);
    const parentBody = parent.addComponent(Rigidbody);
    parentBody.useGravity = false;
    parentBody.linearVelocity = new Vector3(1, 0, 0);

    const child = parent.createChild("co-moving-child");
    child.transform.setPosition(0, 5, 0);
    child.addComponent(BoxCollider);
    const childBody = child.addComponent(Rigidbody);
    childBody.useGravity = false;
    childBody.linearVelocity = new Vector3(1, 0, 0);

    physics._update(physics.fixedTimeStep);
    const setChildWorldTransform = vi.spyOn(childBody._getNativeActor(), "setWorldTransform");
    const syncChildPose = vi.spyOn(childBody, "_syncPose");
    try {
      physics._update(physics.fixedTimeStep);
      expect(syncChildPose).not.toHaveBeenCalled();
      expect(setChildWorldTransform).not.toHaveBeenCalled();

      // Subsequent user edits on the child still fire transform updates and teleport the native actor.
      child.transform.setPosition(0, 10, 0);
      physics._update(physics.fixedTimeStep);
      expect(syncChildPose).toHaveBeenCalledTimes(1);
      expect(setChildWorldTransform).toHaveBeenCalledTimes(1);
      expect(child.transform.worldPosition.y).toBeCloseTo(10, 4);
    } finally {
      syncChildPose.mockRestore();
      setChildWorldTransform.mockRestore();
    }
  });

  it("skips native write-back on stationary kinematic bodies while still syncing move() and parent pose changes", () => {
    const physics = engine.sceneManager.activeScene.physics;
    const entity = rootEntity.createChild("stationary-kinematic");
    entity.addComponent(BoxCollider);
    const body = entity.addComponent(Rigidbody);
    body.isKinematic = true;

    physics._update(physics.fixedTimeStep);
    const getWorldTransform = vi.spyOn(body._getNativeActor(), "getWorldTransform");
    try {
      physics._update(physics.fixedTimeStep);
      physics._update(physics.fixedTimeStep);
      physics._update(physics.fixedTimeStep);
      expect(getWorldTransform).not.toHaveBeenCalled();

      body.move(new Vector3(2, 0, 0));
      physics._update(physics.fixedTimeStep);
      expect(getWorldTransform).toHaveBeenCalledTimes(1);
      expect(entity.transform.position.x).toBeCloseTo(2, 4);

      physics._update(physics.fixedTimeStep);
      physics._update(physics.fixedTimeStep);
      expect(getWorldTransform).toHaveBeenCalledTimes(1);

      entity.transform.setPosition(5, 0, 0);
      physics._update(physics.fixedTimeStep);
      expect(entity.transform.position.x).toBeCloseTo(5, 4);
      expect(getWorldTransform).toHaveBeenCalledTimes(2);

      physics._update(physics.fixedTimeStep);
      expect(getWorldTransform).toHaveBeenCalledTimes(2);
    } finally {
      getWorldTransform.mockRestore();
    }

    const parent = rootEntity.createChild("kinematic-parent");
    parent.addComponent(BoxCollider);
    const parentBody = parent.addComponent(Rigidbody);
    parentBody.useGravity = false;
    parentBody.linearVelocity = new Vector3(1, 0, 0);

    const child = parent.createChild("kinematic-child");
    child.addComponent(BoxCollider);
    const childBody = child.addComponent(Rigidbody);
    childBody.isKinematic = true;

    physics._update(physics.fixedTimeStep);
    const getChildTransform = vi.spyOn(childBody._getNativeActor(), "getWorldTransform");
    try {
      physics._update(physics.fixedTimeStep);
      expect(getChildTransform).toHaveBeenCalledTimes(1);
      expect(child.transform.worldPosition.x).toBeCloseTo(0, 4);
    } finally {
      getChildTransform.mockRestore();
    }
  });

  it("rejects physics components and materials before insertion when physics is not initialized on the Engine", async () => {
    const noPhysicsEngine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    try {
      const scene = noPhysicsEngine.sceneManager.activeScene;
      const detached = noPhysicsEngine.createEntity("detached-no-physics");
      expect(() => detached.addComponent(Rigidbody)).toThrow();
      expect(() => detached.addComponent(BoxCollider)).toThrow();
      expect(() => new PhysicsMaterial(noPhysicsEngine)).toThrow();
      expect(detached.getComponent(Rigidbody)).toBeNull();
      expect(detached.getComponent(BoxCollider)).toBeNull();
      expect(() => scene.addRootEntity(detached)).not.toThrow();
      expect(() => scene.removeRootEntity(detached)).not.toThrow();
      expect(detached.scene).toBeNull();
      detached.destroy();
    } finally {
      expect(() => noPhysicsEngine.destroy()).not.toThrow();
    }
  });

  it("settles pending geometry principal axes before switching a disabled Rigidbody to manual inertiaTensor", () => {
    const physics = engine.sceneManager.activeScene.physics;

    for (const queryBeforeWrite of [false, true]) {
      const entity = rootEntity.createChild();
      const body = entity.addComponent(Rigidbody);
      body.useGravity = false;
      body.angularDamping = 0;
      const child = entity.createChild();
      child.addComponent(BoxCollider).size.set(2, 4, 6);
      const ray = new Ray(new Vector3(0, 5, 0), new Vector3(0, -1, 0));
      expect(physics.raycast(ray, 10)).toBe(true);

      body.enabled = false;
      child.transform.rotation.z = 30;
      child.transform.position.x = 3;
      if (queryBeforeWrite) {
        expect(physics.raycast(ray, 10)).toBe(false);
        void body.inertiaTensorRotation;
      }
      body.inertiaTensor = new Vector3(2, 3, 4);
      body.automaticCenterOfMass = false;

      body.enabled = true;
      expect(body.centerOfMass.x).toBeCloseTo(3);
      body.applyTorque(new Vector3(3, 0, 0), ForceMode.Impulse);
      physics._update(physics.fixedTimeStep);
      expect(body.angularVelocity.x).toBeCloseTo(1.375, 4);
      expect(body.angularVelocity.y).toBeCloseTo(Math.sqrt(3) / 8, 4);
      entity.destroy();
    }

    // Scalar-only mass edits while disabled remain deferred until manual flags commit.
    const deferred = rootEntity.createChild("disabled-mass-defer");
    const deferredBody = deferred.addComponent(Rigidbody);
    deferredBody.useGravity = false;
    deferred.addComponent(BoxCollider).size.set(2, 2, 2);
    physics._update(physics.fixedTimeStep);
    deferredBody.enabled = false;
    deferredBody.mass = 5;
    deferredBody.inertiaTensor = new Vector3(2, 3, 4);
    deferredBody.enabled = true;
    deferredBody.applyForce(new Vector3(5, 0, 0), ForceMode.Impulse);
    physics._update(physics.fixedTimeStep);
    expect(deferredBody.linearVelocity.x).toBeCloseTo(1, 4);
  });

  it("computes getWorldCenterOfMass safely when out aliases entity.transform.worldPosition", () => {
    const entity = rootEntity.createChild("com-alias");
    entity.transform.setPosition(10, 0, 0);
    const body = entity.addComponent(Rigidbody);
    body.centerOfMass = new Vector3(1, 0, 0);

    const out = body.getWorldCenterOfMass(entity.transform.worldPosition);
    expect(out).toBe(entity.transform.worldPosition);
    expect(out.x).toBeCloseTo(11, 5);
    expect(out.y).toBeCloseTo(0, 5);
    expect(out.z).toBeCloseTo(0, 5);
  });

  it("flushes mass only for the accessed Rigidbody without triggering cross-body inertia recomputation", () => {
    const physics = engine.sceneManager.activeScene.physics;
    const makeBody = (name: string, x: number) => {
      const entity = rootEntity.createChild(name);
      entity.transform.setPosition(x, 0, 0);
      const collider = entity.addComponent(BoxCollider);
      const body = entity.addComponent(Rigidbody);
      body.useGravity = false;
      return { body, collider };
    };

    const a = makeBody("body-a", 0);
    const b = makeBody("body-b", 10);
    const c = makeBody("body-c", 20);
    const d = makeBody("body-d", 30);
    physics._update(physics.fixedTimeStep);

    const spyA = vi.spyOn(a.body._getNativeActor(), "updateMassAndInertia");
    const spies = [b, c, d].map(({ body }) => vi.spyOn(body._getNativeActor(), "updateMassAndInertia"));

    // First shape edit batch on B/C/D, then access A via getPointVelocity and setDensity.
    b.collider.size.set(2, 2, 2);
    c.collider.size.set(2, 3, 2);
    d.collider.size.set(3, 2, 2);

    const out = new Vector3();
    a.body.getPointVelocity(new Vector3(0, 1, 0), out);
    // Editing A's collider before setDensity should neither pre-flush nor leave a stale mass recomputation for the step.
    a.collider.size.set(2, 2, 2);
    expect(a.body.setDensity(2)).toBe(true);
    expect(a.body.mass).toBeCloseTo(16, 4);
    expect(spyA).not.toHaveBeenCalled();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();

    // Second shape edit batch on B/C/D before the fixed step; each body should recompute only once at step.
    b.collider.size.set(4, 2, 2);
    c.collider.size.set(2, 4, 2);
    d.collider.size.set(2, 2, 4);
    physics._update(physics.fixedTimeStep);

    expect(spyA).not.toHaveBeenCalled();
    expect(a.body.inertiaTensor.x).toBeCloseTo((16 * (4 + 4)) / 12, 4);
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(b.body.inertiaTensor.x).toBeCloseTo((1 * (4 + 4)) / 12, 4);
    expect(c.body.inertiaTensor.x).toBeCloseTo((1 * (16 + 4)) / 12, 4);
    expect(d.body.inertiaTensor.x).toBeCloseTo((1 * (4 + 16)) / 12, 4);
  });

  it("preserves large-coordinate precision in getPointVelocity and alias safety in getRelativePointVelocity", () => {
    const physics = engine.sceneManager.activeScene.physics;
    const entity = rootEntity.createChild("large-coord-velocity");
    entity.transform.setPosition(1_000_000, 0, 0);
    entity.addComponent(BoxCollider);
    const body = entity.addComponent(Rigidbody);
    body.useGravity = false;
    body.angularVelocity = new Vector3(0, 0, 1);
    physics._update(physics.fixedTimeStep);

    const worldOut = new Vector3();
    body.getPointVelocity(new Vector3(1_000_000.02, 0, 0), worldOut);
    expect(worldOut.y).toBeCloseTo(0.02, 4);

    const localAlias = new Vector3(0.02, 0, 0);
    expect(body.getRelativePointVelocity(localAlias, localAlias)).toBe(localAlias);
    expect(localAlias.y).toBeCloseTo(0.02, 4);
  });

  it("skips resyncing already-attached colliders across isKinematic and enable toggles while updating moved children", () => {
    const physics = engine.sceneManager.activeScene.physics;
    const cast = (x: number, z = 0) => {
      const hit = new HitResult();
      return physics.raycast(new Ray(new Vector3(x, 4, z), new Vector3(0, -1, 0)), 10, hit) ? hit.collider : null;
    };

    const entity = rootEntity.createChild("compound-skip-clean");
    const body = entity.addComponent(Rigidbody);
    body.useGravity = false;
    body.isKinematic = true;

    const boxes = [0, 4, 8].map((x, index) => {
      const child = entity.createChild(`box-${index}`);
      child.transform.setPosition(x, 0, 0);
      return child.addComponent(BoxCollider);
    });
    const plane = entity.createChild("plane").addComponent(PlaneCollider);
    expect(cast(50)).toBe(plane);

    const boxSyncSpies = boxes.map((box) => vi.spyOn(box, "_sync"));
    const planeSyncSpy = vi.spyOn(plane, "_sync");
    const clearSpies = () => {
      for (const spy of boxSyncSpies) spy.mockClear();
      planeSyncSpy.mockClear();
    };

    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // Toggling isKinematic in both directions skips clean attached boxes and syncs only the plane.
      body.isKinematic = false;
      expect(cast(50)).toBeNull();
      expect(cast(4)).toBe(boxes[1]);
      for (const spy of boxSyncSpies) expect(spy).not.toHaveBeenCalled();
      expect(planeSyncSpy).toHaveBeenCalledTimes(1);
      clearSpies();

      body.isKinematic = true;
      expect(cast(50)).toBe(plane);
      for (const spy of boxSyncSpies) expect(spy).not.toHaveBeenCalled();
      expect(planeSyncSpy).toHaveBeenCalledTimes(1);
      clearSpies();

      // Moving one child box before switching to dynamic syncs only that box and the plane.
      boxes[1].entity.transform.setPosition(12, 0, 0);
      body.isKinematic = false;
      expect(cast(12)).toBe(boxes[1]);
      expect(cast(4)).toBeNull();
      expect(boxSyncSpies[0]).not.toHaveBeenCalled();
      expect(boxSyncSpies[1]).toHaveBeenCalledTimes(1);
      expect(boxSyncSpies[2]).not.toHaveBeenCalled();
      expect(planeSyncSpy).toHaveBeenCalledTimes(1);
    } finally {
      errors.mockRestore();
    }

    // Disabling and re-enabling an unchanged body skips resyncing all attached boxes.
    boxes[1].entity.transform.setPosition(4, 0, 0);
    expect(cast(4)).toBe(boxes[1]);
    clearSpies();

    body.enabled = false;
    body.enabled = true;
    expect(cast(4)).toBe(boxes[1]);
    for (const spy of boxSyncSpies) expect(spy).not.toHaveBeenCalled();

    // Disabling the body, moving a child box, translating and rotating the body, then re-enabling updates all world poses and COM.
    body.enabled = false;
    boxes[1].entity.transform.setPosition(13, 0, 0);
    entity.transform.setPosition(100, 0, 20);
    entity.transform.setRotation(0, 90, 0);
    body.enabled = true;

    expect(cast(100, 20)).toBe(boxes[0]);
    expect(cast(100, 7)).toBe(boxes[1]);
    expect(cast(100, 12)).toBe(boxes[2]);
    expect(cast(4, 0)).toBeNull();
    expect(body.centerOfMass.x).toBeCloseTo(7, 4);
  });

  it("wakes dynamic bodies on kinematic release, re-enable, gravity enable, and constraint unlock without manual wakeUp", () => {
    const physics = engine.sceneManager.activeScene.physics;
    const step = (count: number) => {
      for (let i = 0; i < count; i++) physics._update(physics.fixedTimeStep);
    };

    // 1. Active kinematic -> dynamic falls immediately without calling wakeUp().
    const activeDrop = addBox(new Vector3(1, 1, 1), true, new Vector3(0, 10, 0));
    const activeBody = activeDrop.getComponent(Rigidbody)!;
    activeBody.isKinematic = true;
    step(5);
    activeBody.isKinematic = false;
    expect(activeBody.isSleeping()).toBe(false);
    step(10);
    expect(activeDrop.transform.worldPosition.y).toBeLessThan(9.9);

    // 2. Disabled kinematic -> dynamic -> re-enable falls immediately without calling wakeUp().
    const reenableDrop = addBox(new Vector3(1, 1, 1), true, new Vector3(5, 10, 0));
    const reenableBody = reenableDrop.getComponent(Rigidbody)!;
    reenableBody.isKinematic = true;
    step(5);
    reenableBody.enabled = false;
    reenableBody.isKinematic = false;
    reenableBody.enabled = true;
    expect(reenableBody.isSleeping()).toBe(false);
    step(10);
    expect(reenableDrop.transform.worldPosition.y).toBeLessThan(9.9);

    // 3. Auto-slept zero-gravity body wakes and falls when useGravity becomes true.
    const gravityDrop = addBox(new Vector3(1, 1, 1), true, new Vector3(10, 10, 0));
    const gravityBody = gravityDrop.getComponent(Rigidbody)!;
    gravityBody.useGravity = false;
    step(60);
    expect(gravityBody.isSleeping()).toBe(true);
    gravityBody.useGravity = true;
    expect(gravityBody.isSleeping()).toBe(false);
    step(10);
    expect(gravityDrop.transform.worldPosition.y).toBeLessThan(9.9);

    // 4. Auto-slept constrained body wakes on axis unlock, while adding locks keeps a sleeping body asleep.
    const constraintDrop = addBox(new Vector3(1, 1, 1), true, new Vector3(15, 10, 0));
    const constraintBody = constraintDrop.getComponent(Rigidbody)!;
    constraintBody.constraints = RigidbodyConstraints.FreezePositionY;
    step(60);
    expect(constraintBody.isSleeping()).toBe(true);
    constraintBody.constraints = RigidbodyConstraints.FreezePositionY | RigidbodyConstraints.FreezePositionX;
    expect(constraintBody.isSleeping()).toBe(true);
    constraintBody.constraints = RigidbodyConstraints.None;
    expect(constraintBody.isSleeping()).toBe(false);
    step(10);
    expect(constraintDrop.transform.worldPosition.y).toBeLessThan(9.9);
  });
});
