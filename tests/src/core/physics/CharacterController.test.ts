import {
  Engine,
  CharacterController,
  Entity,
  ControllerNonWalkableMode,
  BoxColliderShape,
  StaticCollider,
  CapsuleColliderShape,
  PlaneColliderShape,
  DynamicCollider,
  Script,
  ControllerCollisionFlag
} from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { PhysXPhysics } from "@galacean/engine-physics-physx";
import { Quaternion, Vector3 } from "@galacean/engine-math";
import { describe, beforeAll, beforeEach, expect, it } from "vitest";

describe("CharacterController", function () {
  let engine: Engine;
  let rootEntity: Entity;
  let roleEntity: Entity;

  function addPlane(position: Vector3, rotation: Quaternion): Entity {
    const planeEntity = rootEntity.createChild();

    planeEntity.transform.position = position;
    planeEntity.transform.rotationQuaternion = rotation;

    const physicsPlane = new PlaneColliderShape();
    const planeCollider = planeEntity.addComponent(StaticCollider);
    planeCollider.addShape(physicsPlane);

    return planeEntity;
  }

  function addBox(cubeSize: Vector3, type: typeof DynamicCollider | typeof StaticCollider, pos: Vector3) {
    const boxEntity = rootEntity.createChild("BoxEntity");
    boxEntity.transform.setPosition(pos.x, pos.y, pos.z);

    const physicsBox = new BoxColliderShape();
    physicsBox.material.dynamicFriction = 0;
    physicsBox.material.staticFriction = 0;
    physicsBox.size = cubeSize;
    const boxCollider = boxEntity.addComponent(type);
    boxCollider.addShape(physicsBox);
    return boxEntity;
  }

  function formatValue(value: number) {
    return Math.round(value * 100000) / 100000;
  }

  class MoveScript extends Script {
    distancePerStep = new Vector3();
    fallAccumulateTime = 0;
    yAxisMove = new Vector3();
    onPhysicsUpdate(): void {
      const controller = this.entity.getComponent(CharacterController);
      const { fixedTimeStep } = engine.sceneManager.activeScene.physics;
      const flag = controller.move(this.distancePerStep, 0.0001, fixedTimeStep);

      const physicsManager = this.engine.sceneManager.activeScene.physics;
      physicsManager.gravity = new Vector3(0, -9.8, 0);
      const gravity = physicsManager.gravity;
      this.fallAccumulateTime += fixedTimeStep;

      if (flag & ControllerCollisionFlag.Down) {
        this.fallAccumulateTime = 0;
      } else {
        const { yAxisMove } = this;
        yAxisMove.set(0, gravity.y * fixedTimeStep * this.fallAccumulateTime, 0);
        controller.move(yAxisMove, 0.0001, fixedTimeStep);
      }
    }

    moveTo(pos: Vector3, step: number = 2): void {
      this.distancePerStep = pos.subtract(this.entity.transform.position).scale(1 / step);
    }
  }

  beforeAll(async function () {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: new PhysXPhysics() });

    rootEntity = engine.sceneManager.activeScene.createRootEntity("root");
  });

  beforeEach(() => {
    rootEntity.clearChildren();
    roleEntity = rootEntity.createChild("role");
    const moveScript = roleEntity.addComponent(MoveScript);
    const controller = roleEntity.addComponent(CharacterController);
    controller.addShape(new BoxColliderShape());
    const ground = addPlane(new Vector3(), new Quaternion());
  });

  it("constructor", () => {
    // Test that the constructor works correctly.
    const controller = roleEntity.getComponent(CharacterController);
    expect(controller.stepOffset).eq(0.5);
    expect(controller.nonWalkableMode).eq(ControllerNonWalkableMode.PreventClimbing);
    expect(controller.upDirection).deep.include({ x: 0, y: 1, z: 0 });
    expect(controller.slopeLimit).eq(0.707);
  });

  it("addShape and removeShape", () => {
    // Test that addShape works correctly if add more shapes.
    const controller = roleEntity.getComponent(CharacterController);
    try {
      controller.addShape(new BoxColliderShape());
    } catch (err) {
      expect(err).eq("only allow single shape on controller!");
      expect(controller.shapes.length).eq(1);
    }

    // Test that removeShape works correctly if remove the shape.
    const shape = controller.shapes[0];
    controller.removeShape(shape);
    expect(controller.shapes.length).eq(0);

    controller.addShape(new BoxColliderShape());
    // Test that clearShapes works correctly if clear the shapes.
    controller.clearShapes();
    expect(controller.shapes.length).eq(0);

    controller.addShape(new BoxColliderShape());
    expect(controller.shapes.length).eq(1);
  });

  it("shape position", () => {
    const controller = roleEntity.getComponent(CharacterController);
    controller.clearShapes();

    const boxColliderShape = new BoxColliderShape();
    controller.addShape(boxColliderShape);
    boxColliderShape.position = new Vector3(0, 2, -1);

    // Test that set collider shape position works correctly.
    expect(boxColliderShape.position).deep.include({ x: 0, y: 2, z: -1 });
  });

  it("move", () => {
    const controller = roleEntity.getComponent(CharacterController);
    controller.move(new Vector3(0, 0, 1), 0.0001, 0.1);
    expect(roleEntity.transform.position.z).eq(1);
  });

  it("upDirection", () => {
    const controller = roleEntity.getComponent(CharacterController);

    controller.upDirection = controller.upDirection;
    expect(controller.upDirection).deep.include({ x: 0, y: 1, z: 0 });
    let flag = controller.move(new Vector3(0, 0, 1), 0.0001, 0.1);
    expect(flag).eq(ControllerCollisionFlag.Down);

    controller.upDirection = new Vector3(0, -1, 0);
    flag = controller.move(new Vector3(0, 0, 1), 0.0001, 0.1);

    expect(flag).eq(ControllerCollisionFlag.Up);
  });

  it("contactOffset", () => {
    const controller = roleEntity.getComponent(CharacterController);

    expect(controller.contactOffset).eq(0.1);
    controller.move(new Vector3(0, 0, 0.1), 0.0001, 1);
    controller.move(new Vector3(0, 0, 0.1), 0.0001, 1);
    engine.update();
    expect(formatValue(roleEntity.transform.position.y)).eq(0.6);

    controller.contactOffset = 1;
    controller.move(new Vector3(0, 0, 0.1), 0.0001, 1);
    controller.move(new Vector3(0, 0, 0.1), 0.0001, 1);
    engine.update();
    expect(formatValue(roleEntity.transform.position.y)).eq(1.5);
  });

  it("slopeLimit notPass", () => {
    const { fixedTimeStep } = engine.sceneManager.activeScene.physics;
    const moveScript = roleEntity.getComponent(MoveScript);
    const controller = roleEntity.getComponent(CharacterController);
    expect(controller.slopeLimit).eq(0.707);
    controller.slopeLimit = 1;
    const slope = addPlane(new Vector3(0, 0, 2), new Quaternion().rotateX(-Math.PI / 4));
    moveScript.moveTo(new Vector3(0, 0, 3), 50);
    // @ts-ignore
    engine.sceneManager.activeScene._componentsManager.callScriptOnStart();
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(fixedTimeStep * 50);
    expect(formatValue(roleEntity.transform.position.z)).not.eq(3);
  });

  it("slopeLimit pass", () => {
    const { fixedTimeStep } = engine.sceneManager.activeScene.physics;
    const moveScript = roleEntity.getComponent(MoveScript);
    const controller = roleEntity.getComponent(CharacterController);
    expect(controller.slopeLimit).eq(0.707);
    const slope = addPlane(new Vector3(0, 0, 2), new Quaternion().rotateX(-Math.PI / 4));
    moveScript.moveTo(new Vector3(0, 0, 3), 50);
    // @ts-ignore
    engine.sceneManager.activeScene._componentsManager.callScriptOnStart();
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(fixedTimeStep * 50);
    expect(formatValue(roleEntity.transform.position.z)).eq(3);
  });

  it("stepOffset notPass", () => {
    const { fixedTimeStep } = engine.sceneManager.activeScene.physics;
    const moveScript = roleEntity.getComponent(MoveScript);
    const controller = roleEntity.getComponent(CharacterController);
    expect(controller.stepOffset).eq(0.5);

    const box = addBox(new Vector3(1, 1, 1), StaticCollider, new Vector3(0, 0.5, 3));
    moveScript.moveTo(new Vector3(0, 0, 3));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(fixedTimeStep * 2);
    expect(formatValue(roleEntity.transform.position.z)).not.eq(3);
    expect(roleEntity.transform.position.y).lessThan(1);
  });

  it("stepOffset pass", () => {
    const { fixedTimeStep } = engine.sceneManager.activeScene.physics;
    const moveScript = roleEntity.getComponent(MoveScript);
    const controller = roleEntity.getComponent(CharacterController);
    expect(controller.stepOffset).eq(0.5);

    const box = addBox(new Vector3(1, 1, 1), StaticCollider, new Vector3(0, 0.5, 3));

    controller.stepOffset = 1;
    moveScript.moveTo(new Vector3(0, 0, 3));
    // @ts-ignore
    engine.sceneManager.activeScene._componentsManager.callScriptOnStart();
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(fixedTimeStep * 2);
    expect(formatValue(roleEntity.transform.position.z)).eq(3);
    expect(roleEntity.transform.position.y).greaterThan(1);
  });

  it("nonWalkableMode PreventClimbing", () => {
    const { fixedTimeStep } = engine.sceneManager.activeScene.physics;
    const slope = addPlane(new Vector3(0, 0, 2), new Quaternion().rotateX(-Math.PI / 4));
    const controller = roleEntity.getComponent(CharacterController);
    controller.slopeLimit = 1;
    expect(controller.nonWalkableMode).eq(ControllerNonWalkableMode.PreventClimbing);
    const moveScript = roleEntity.getComponent(MoveScript);
    moveScript.moveTo(new Vector3(0, 0.02, 3), 50);
    // @ts-ignore
    engine.sceneManager.activeScene._componentsManager.callScriptOnStart();
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(fixedTimeStep * 50);
    expect(roleEntity.transform.position.y).greaterThan(1);
  });

  it("nonWalkableMode PreventClimbingAndForceSliding", () => {
    const { fixedTimeStep } = engine.sceneManager.activeScene.physics;
    const slope = addPlane(new Vector3(0, 0, 2), new Quaternion().rotateX(-Math.PI / 4));
    const controller = roleEntity.getComponent(CharacterController);
    controller.slopeLimit = 1;
    expect(controller.nonWalkableMode).eq(ControllerNonWalkableMode.PreventClimbing);
    controller.nonWalkableMode = ControllerNonWalkableMode.PreventClimbingAndForceSliding;
    const moveScript = roleEntity.getComponent(MoveScript);
    moveScript.moveTo(new Vector3(0, 0.02, 3), 50);
    // @ts-ignore
    engine.sceneManager.activeScene._componentsManager.callScriptOnStart();
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(fixedTimeStep * 50);
    expect(roleEntity.transform.position.y).lessThan(1);
  });

  it("update shape data when disabled", () => {
    const controller = roleEntity.getComponent(CharacterController);
    controller.enabled = false;
    controller.clearShapes();

    const boxColliderShape = new BoxColliderShape();
    controller.addShape(boxColliderShape);
    boxColliderShape.size = new Vector3(1, 1, 1);
    expect(boxColliderShape.size).deep.include({ x: 1, y: 1, z: 1 });

    controller.clearShapes();
    const capsuleColliderShape = new CapsuleColliderShape();
    controller.addShape(capsuleColliderShape);
    capsuleColliderShape.contactOffset = 0.1;
    capsuleColliderShape.radius = 0.2;
    capsuleColliderShape.height = 1;
    expect(capsuleColliderShape.contactOffset).eq(0.1);
    expect(capsuleColliderShape.radius).eq(0.2);
    expect(capsuleColliderShape.height).eq(1);
  });
});
