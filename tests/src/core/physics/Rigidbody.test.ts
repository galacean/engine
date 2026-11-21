import { createPhysics } from "../../utils/physics";
import {
  Engine,
  Entity,
  BoxCollider,
  Collider,
  FixedJoint,
  HingeJoint,
  HitResult,
  Rigidbody,
  RigidbodyConstraints,
  CollisionDetectionMode,
  Loader,
  MeshCollider,
  PlaneCollider,
  PrimitiveMesh
} from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import { Quaternion, Ray, Vector3 } from "@galacean/engine-math";
import { vi, describe, beforeAll, afterAll, beforeEach, afterEach, expect, it } from "vitest";
import { PrefabParser } from "../../../../packages/loader/src/prefab/PrefabParser";

describe("Rigidbody", function () {
  let engine: Engine;
  let rootEntity: Entity;

  function addPlane(x: number, y: number, z: number) {
    const planeEntity = rootEntity.createChild("PlaneEntity");
    planeEntity.transform.setPosition(x, y, z);
    planeEntity.transform.setScale(20, 1, 20);

    const physicsPlane = planeEntity.addComponent(PlaneCollider);
    physicsPlane.getInstanceMaterial().dynamicFriction = 0;
    physicsPlane.getInstanceMaterial().staticFriction = 0;
    return planeEntity;
  }

  function addBox(cubeSize: Vector3, dynamic: boolean, pos: Vector3) {
    const boxEntity = rootEntity.createChild("BoxEntity");
    boxEntity.transform.setPosition(pos.x, pos.y, pos.z);

    const physicsBox = boxEntity.addComponent(BoxCollider);
    physicsBox.getInstanceMaterial().dynamicFriction = 0;
    physicsBox.getInstanceMaterial().staticFriction = 0;
    physicsBox.size = cubeSize;
    if (dynamic) {
      const body = boxEntity.addComponent(Rigidbody);
      body.automaticCenterOfMass = false;
      body.automaticInertiaTensor = false;
    }
    return boxEntity;
  }

  function formatValue(value: number) {
    return Math.round(value * 100000) / 100000;
  }

  beforeAll(async function () {
    engine = await WebGLEngine.create({
      canvas: document.createElement("canvas"),
      physics: createPhysics()
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

    boxCollider.angularVelocity = new Vector3(0, 45, 0);
    boxCollider.angularDamping = 0;
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxCollider.angularVelocity.y)).eq(45);
    expect(formatValue(box.transform.rotation.y)).closeTo(45, 0.0001);
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
    expect(formatValue(boxCollider.angularVelocity.y)).eq(9.08338);

    boxCollider.inertiaTensor = new Vector3(0, 2, 0);
    boxCollider.angularVelocity.y = 0;
    boxCollider.applyTorque(new Vector3(0, 10, 0));
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxCollider.inertiaTensor.y)).eq(2);
    expect(formatValue(boxCollider.angularVelocity.y)).eq(4.54169);
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
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxCollider.isSleeping()).true;
  });

  it("solverIterations", function () {
    const box = addBox(new Vector3(2, 2, 2), true, new Vector3(0, 0, 0));
    addBox(new Vector3(2, 2, 2), false, new Vector3(1, 0, 0));
    const boxCollider = box.getComponent(Rigidbody);
    expect(boxCollider.solverIterations).eq(4);

    // Non-finite values throw; out-of-range and fractional values clamp to integer [1, 255]
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

    // With valid minimum solverIterations = 1, overlapping boxes resolve cleanly without Release-build UB
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

    // Normal collision
    expect(Math.abs(formatValue(boxCollider2.linearVelocity.x))).lessThan(4);
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
        target[automatic] = false;
        target[property].set(2, 3, 4);
        target[automatic] = true;
      }

      target.isKinematic = isKinematic;
      // Reading the property here would hide a stale cache
      target[automatic] = false;
      target.mass = 6;
      target.isKinematic = false;

      const expected =
        state === "reenabled"
          ? new Vector3(2, 3, 4)
          : property === "centerOfMass"
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
    const bodyEntity = rootEntity.createChild("mesh body");
    bodyEntity.addComponent(BoxCollider);
    const body = bodyEntity.addComponent(Rigidbody);
    body.isKinematic = true;
    const child = bodyEntity.createChild("mesh child");
    const mesh = child.addComponent(MeshCollider);
    mesh.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 2);
    const physics = engine.sceneManager.activeScene.physics;
    physics._update(physics.fixedTimeStep);

    // Reparent and switch in the same frame: the native actor must not keep the pending triangle mesh
    rootEntity.addChild(child);
    body.isKinematic = false;
    body.wakeUp();
    for (let i = 0; i < 30; i++) {
      physics._update(physics.fixedTimeStep);
    }
    expect(bodyEntity.transform.position.y).below(-0.1);
  });

  it("excludes kinematic-only colliders when switching isKinematic to false and restores them when kinematic again", function () {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const physics = engine.sceneManager.activeScene.physics;
    const entity = rootEntity.createChild("kinematic-mesh-body");
    const body = entity.addComponent(Rigidbody);
    body.isKinematic = true;
    const mesh = entity.addComponent(MeshCollider);
    mesh.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 2, { keepMeshData: true });
    const ray = new Ray(new Vector3(0, 5, 0), new Vector3(0, -1, 0));

    expect(physics.raycast(ray, 10)).toBe(true);

    body.isKinematic = false;
    expect(body.isKinematic).toBe(false);
    expect(physics.raycast(ray, 10)).toBe(false);
    expect(errors).toHaveBeenCalledTimes(1);

    body.isKinematic = true;
    expect(body.isKinematic).toBe(true);
    expect(physics.raycast(ray, 10)).toBe(true);
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

  it.each([
    CollisionDetectionMode.Discrete,
    CollisionDetectionMode.Continuous,
    CollisionDetectionMode.ContinuousDynamic,
    CollisionDetectionMode.ContinuousSpeculative
  ])("keeps collision detection mode %s effective after kinematic transitions", (mode) => {
    const box = addBox(new Vector3(1, 1, 1), true, new Vector3(-5, 0, 0));
    const body = box.getComponent(Rigidbody);
    body.useGravity = false;
    body.collisionDetectionMode = mode;
    expect(body.collisionDetectionMode).toBe(mode);
    body.isKinematic = true;
    body.move(new Vector3(-4, 0, 0));
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(box.transform.position.x).toBeCloseTo(-4, 5);
    addBox(new Vector3(0.1, 10, 10), false, new Vector3(0, 0, 0));
    body.isKinematic = false;
    body.linearVelocity.set(600, 0, 0);
    engine.sceneManager.activeScene.physics._update(1 / 60);
    if (mode === CollisionDetectionMode.Discrete) {
      expect(box.transform.position.x).toBeGreaterThan(0);
    } else {
      expect(box.transform.position.x).toBeLessThan(-0.5);
      expect(body.linearVelocity.x).toBeLessThan(600);
    }
  });

  it.each([CollisionDetectionMode.Continuous, CollisionDetectionMode.ContinuousDynamic])(
    "uses speculative CCD behavior for kinematic mode %s",
    function (mode) {
      const simulate = (kinematicMode: CollisionDetectionMode) => {
        const moving = addBox(new Vector3(1, 1, 1), true, new Vector3(-5, 0, 0));
        const target = addBox(new Vector3(1, 1, 1), true, new Vector3(0, 0, 0));
        const movingCollider = moving.getComponent(Rigidbody);
        const targetCollider = target.getComponent(Rigidbody);
        movingCollider.isKinematic = true;
        movingCollider.collisionDetectionMode = kinematicMode;
        targetCollider.useGravity = false;
        targetCollider.linearDamping = 0;
        targetCollider.collisionDetectionMode = CollisionDetectionMode.Continuous;
        engine.sceneManager.activeScene.physics._update(1 / 60);
        movingCollider.move(new Vector3(5, 0, 0));
        engine.sceneManager.activeScene.physics._update(1 / 60);
        const result = {
          targetPosition: target.transform.position.x,
          targetVelocity: targetCollider.linearVelocity.x
        };
        while (rootEntity.children.length) rootEntity.children[0].destroy();
        return result;
      };

      const fallback = simulate(mode);
      const explicit = simulate(CollisionDetectionMode.ContinuousSpeculative);
      expect(fallback.targetPosition).toBeGreaterThan(0);
      expect(fallback.targetPosition).toBeCloseTo(explicit.targetPosition, 5);
      expect(fallback.targetVelocity).toBeCloseTo(explicit.targetVelocity, 5);
    }
  );

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
    boxCollider.move(new Vector3(1, 0, 0));
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
    boxCollider.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
    boxCollider.sleep();
    boxCollider.wakeUp();
    boxCollider.applyForce(new Vector3(1, 0, 0));
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

  it("reads back authored mass properties while the simulation uses computed values", function () {
    const box = addBox(new Vector3(2, 2, 2), true, new Vector3(0, 0, 0));
    const body = box.getComponent(Rigidbody);
    body.automaticCenterOfMass = true;
    body.automaticInertiaTensor = true;
    body.useGravity = false;
    body.angularDamping = 0;

    body.centerOfMass = new Vector3(5, 6, 7);
    body.inertiaTensor.x = 8;
    body.inertiaTensor.y = 9;
    body.inertiaTensor.z = 10;
    expect(Vector3.equals(body.centerOfMass, new Vector3(5, 6, 7))).toBe(true);
    expect(Vector3.equals(body.inertiaTensor, new Vector3(8, 9, 10))).toBe(true);

    const physics = engine.sceneManager.activeScene.physics;
    body.applyForceAtPosition(new Vector3(0, 1, 0), box.transform.worldPosition);
    physics._update(physics.fixedTimeStep);
    expect(body.angularVelocity.length()).toBeCloseTo(0, 5);
    body.applyTorque(new Vector3(0, 1, 0));
    physics._update(physics.fixedTimeStep);
    expect(body.angularVelocity.y).toBeCloseTo(((physics.fixedTimeStep * 1.5) / Math.PI) * 180, 5);

    const clone = box.clone();
    rootEntity.addChild(clone);
    const clonedBody = clone.getComponent(Rigidbody);
    clonedBody.automaticCenterOfMass = false;
    clonedBody.automaticInertiaTensor = false;
    expect(Vector3.equals(clonedBody.centerOfMass, new Vector3(5, 6, 7))).toBe(true);
    expect(Vector3.equals(clonedBody.inertiaTensor, new Vector3(8, 9, 10))).toBe(true);

    clonedBody.centerOfMass.x = 11;
    clonedBody.inertiaTensor.y = 12;
    body.automaticCenterOfMass = false;
    body.automaticInertiaTensor = false;
    expect(Vector3.equals(body.centerOfMass, new Vector3(5, 6, 7))).toBe(true);
    expect(Vector3.equals(body.inertiaTensor, new Vector3(8, 9, 10))).toBe(true);
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
    expect(() => dynamicBody.applyTorque(new Vector3(0, 10, 0))).not.toThrow();

    const kinematicBox = addBox(new Vector3(2, 2, 2), true, new Vector3(5, 0, 0));
    const kinematicBody = kinematicBox.getComponent(Rigidbody);
    kinematicBody.isKinematic = true;
    kinematicBody.destroy();
    expect(kinematicBody.destroyed).toBe(true);
    expect(() => kinematicBody.move(new Vector3(1, 2, 3))).not.toThrow();
  });

  it("preserves both position and rotation when move(pos) and move(rot) are called in the same step", function () {
    const physics = engine.sceneManager.activeScene.physics;
    const targetRot = new Quaternion();
    Quaternion.rotationYawPitchRoll(Math.PI / 2, 0, 0, targetRot);

    // Case 1: move(pos) then move(rot) with non-zero centerOfMass
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

    // Case 2: move(rot) then move(pos) in the same step
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

    // Case 3: direct transform teleport between move(pos) and move(rot) starts from the teleported position
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

  it("skips subtree collider scans when toggling isKinematic on detached hierarchies", function () {
    const tree = new Entity(engine, "detached-rigidbody-tree");
    let node = tree;
    const bodies: Rigidbody[] = [];
    for (let i = 0; i < 16; i++) {
      if (i > 0) node = node.createChild(`level-${i}`);
      bodies.push(node.addComponent(Rigidbody));
      node.addComponent(BoxCollider);
    }
    const spy = vi.spyOn(Entity.prototype as any, "_getComponentsInChildren");
    try {
      for (const body of bodies) {
        body.isKinematic = true;
      }
      const colliderScans = spy.mock.calls.filter((args) => args[0] === Collider).length;
      expect(colliderScans).toBe(0);
    } finally {
      spy.mockRestore();
      tree.destroy();
    }
  });

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
});
