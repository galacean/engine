import {
  Engine,
  CharacterController,
  Camera,
  Entity,
  ControllerNonWalkableMode,
  BoxColliderShape,
  StaticCollider
} from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { PhysXPhysics } from "@galacean/engine-physics-physx";
import { Vector3 } from "@galacean/engine-math";
import { expect } from "chai";

describe("CharacterController", () => {
  let engine: Engine;
  let roleEntity: Entity;

  before(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: new PhysXPhysics() });

    const root = engine.sceneManager.activeScene.createRootEntity("root");

    roleEntity = root.createChild("role");
    const controller = roleEntity.addComponent(CharacterController);
    controller.addShape(new BoxColliderShape());

    engine.physicsManager.gravity = new Vector3(0, 0, 0);

    engine.run();
  });

  it("test constructor", () => {
    // Test that the constructor works correctly.
    const controller = roleEntity.getComponent(CharacterController);
    expect(controller.stepOffset).to.equal(0.5);
    expect(controller.nonWalkableMode).to.equal(ControllerNonWalkableMode.PreventClimbing);
    expect(controller.upDirection).to.deep.include({ x: 0, y: 1, z: 0 });
    expect(controller.slopeLimit).to.equal(0.707);
  });

  it("test stepOffset", () => {
    // Test that set stepOffset will change the value of stepOffset.
    const controller = roleEntity.getComponent(CharacterController);
    controller.stepOffset = 0.5;
    expect(controller.stepOffset).to.equal(0.5);

    controller.stepOffset = 1;
    expect(controller.stepOffset).to.equal(1);

    controller.stepOffset = -1;
    expect(controller.stepOffset).to.equal(-1);

    controller.stepOffset = 0;
    expect(controller.stepOffset).to.equal(0);
  });

  it("test nonWalkableMode", () => {
    // Test that set nonWalkableMode will change the value of nonWalkableMode.
    const controller = roleEntity.getComponent(CharacterController);
    controller.nonWalkableMode = ControllerNonWalkableMode.PreventClimbing;
    expect(controller.nonWalkableMode).to.equal(ControllerNonWalkableMode.PreventClimbing);

    controller.nonWalkableMode = ControllerNonWalkableMode.PreventClimbingAndForceSliding;
    expect(controller.nonWalkableMode).to.equal(ControllerNonWalkableMode.PreventClimbingAndForceSliding);
  });

  it("test upDirection", () => {
    // Test that set upDirection will change the value of upDirection.
    const controller = roleEntity.getComponent(CharacterController);

    controller.upDirection = controller.upDirection;
    expect(controller.upDirection).to.deep.include({ x: 0, y: 1, z: 0 });

    controller.upDirection = new Vector3(1, -1, 0).normalize();
    expect(controller.upDirection.x).to.closeTo(0.707, 0.001, "expect x to close to 0.707");
    expect(controller.upDirection.y).to.closeTo(-0.707, 0.001, "expect y to close to -0.707");
    expect(controller.upDirection.z).to.eq(0);

    controller.upDirection = new Vector3(0, 0, 1);
    expect(controller.upDirection).to.deep.include({ x: 0, y: 0, z: 1 });

    controller.upDirection = new Vector3(0, -1, 0);
    expect(controller.upDirection).to.deep.include({ x: 0, y: -1, z: 0 });
  });

  it("test slopeLimit", () => {
    // Test that set slopeLimit will change the value of slopeLimit.
    const controller = roleEntity.getComponent(CharacterController);
    controller.slopeLimit = 0.707;
    expect(controller.slopeLimit).to.equal(0.707);

    controller.slopeLimit = 1;
    expect(controller.slopeLimit).to.equal(1);

    controller.slopeLimit = 0;
    expect(controller.slopeLimit).to.equal(0);

    controller.slopeLimit = -1;
    expect(controller.slopeLimit).to.equal(-1);
  });

  it("test move", () => {
    // Test that controller move successfully.
    roleEntity.transform.setPosition(0, 0, 0);
    const controller = roleEntity.getComponent(CharacterController);
    expect(controller.move(new Vector3(0, 0, 1), 1, 0.1)).to.equal(0);

    // Test that controller move be blocked by wall.
    const root = engine.sceneManager.activeScene.findEntityByName("root");
    const wall = root.createChild("wall");
    wall.transform.setPosition(0, 0, 2);
    const wallCollider = wall.addComponent(StaticCollider);
    wallCollider.addShape(new BoxColliderShape());
    expect(controller.move(new Vector3(0, 0, 2), 1, 0.1)).to.equal(1);
  });

  it("test addShape and removeShape", () => {
    // Test that addShape works correctly if add more shapes.
    const controller = roleEntity.getComponent(CharacterController);
    try {
      controller.addShape(new BoxColliderShape());
    } catch (err) {
      expect(err).to.equal("only allow single shape on controller!");
      expect(controller.shapes.length).to.equal(1);
    }

    // Test that removeShape works correctly if remove the shape.
    const shape = controller.shapes[0];
    controller.removeShape(shape);
    expect(controller.shapes.length).to.equal(0);

    controller.addShape(new BoxColliderShape());
    // Test that clearShapes works correctly if clear the shapes.
    controller.clearShapes();
    expect(controller.shapes.length).to.equal(0);

    controller.addShape(new BoxColliderShape());
    expect(controller.shapes.length).to.equal(1);
  });

  it("test setPosition", () => {
    const controller = roleEntity.getComponent(CharacterController);
    controller.clearShapes();

    const boxColliderShape = new BoxColliderShape();
    controller.addShape(boxColliderShape);
    boxColliderShape.position = new Vector3(0, 2, -1);

    // Test that set collider shape position works correctly.
    expect(boxColliderShape.position).to.deep.include({ x: 0, y: 2, z: -1 });
  });
});
