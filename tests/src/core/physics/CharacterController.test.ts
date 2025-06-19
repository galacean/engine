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
  ControllerCollisionFlag,
  Layer,
  ColliderShapeUpAxis
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
    expect(controller.slopeLimit).eq(45);
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

    expect(controller.shapes[0].contactOffset).eq(0.02);
    controller.move(new Vector3(0, 0, 0.1), 0.0001, 1);
    controller.move(new Vector3(0, 0, 0.1), 0.0001, 1);
    engine.update();
    expect(formatValue(roleEntity.transform.position.y)).eq(0.52);

    controller.shapes[0].contactOffset = 1;
    controller.move(new Vector3(0, 0, 0.1), 0.0001, 1);
    controller.move(new Vector3(0, 0, 0.1), 0.0001, 1);
    engine.update();
    expect(formatValue(roleEntity.transform.position.y)).eq(1.5);
  });

  it("slopeLimit notPass", () => {
    const { fixedTimeStep } = engine.sceneManager.activeScene.physics;
    const moveScript = roleEntity.getComponent(MoveScript);
    const controller = roleEntity.getComponent(CharacterController);
    expect(controller.slopeLimit).eq(45);
    controller.slopeLimit = 0;
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
    expect(controller.slopeLimit).eq(45);
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

    controller.enabled = true;

    expect(capsuleColliderShape.contactOffset).eq(0.1);
    expect(capsuleColliderShape.radius).eq(0.2);
    expect(capsuleColliderShape.height).eq(1);
  });

  it("clone", () => {
    const newRole = roleEntity.clone();
    roleEntity.isActive = false;
    rootEntity.addChild(newRole);
    const { fixedTimeStep } = engine.sceneManager.activeScene.physics;
    const moveScript = newRole.getComponent(MoveScript);
    const controller = newRole.getComponent(CharacterController);
    expect(controller.slopeLimit).eq(45);
    const slope = addPlane(new Vector3(0, 0, 2), new Quaternion().rotateX(-Math.PI / 4));
    moveScript.moveTo(new Vector3(0, 0, 3), 50);
    // @ts-ignore
    engine.sceneManager.activeScene._componentsManager.callScriptOnStart();
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(fixedTimeStep * 50);
    expect(formatValue(newRole.transform.position.z)).eq(3);
  });

  it("inActive modification", function () {
    roleEntity.isActive = false;
    const controller = roleEntity.getComponent(CharacterController);
    controller.stepOffset = 1;
    controller.slopeLimit = 1;
    controller.nonWalkableMode = ControllerNonWalkableMode.PreventClimbingAndForceSliding;
    controller.upDirection = new Vector3(0, -1, 0);
    controller.move(new Vector3(0, 0, 1), 0.0001, 0.1);
    roleEntity.isActive = true;
    controller.move(new Vector3(0, 0, 1), 0.0001, 0.1);
    expect(roleEntity.transform.position.z).eq(1);
    roleEntity.isActive = false;
    controller.destroy();
  });

  it("collision group", () => {
    const controller = roleEntity.getComponent(CharacterController);

    const obstacleEntity = rootEntity.createChild("obstacle");
    obstacleEntity.transform.position = new Vector3(0, 0, 2);

    const obstacleCollider = obstacleEntity.addComponent(StaticCollider);
    const triggerShape = new BoxColliderShape();
    triggerShape.size = new Vector3(1, 1, 1);
    triggerShape.isTrigger = true;
    obstacleCollider.addShape(triggerShape);

    class TriggerDetectionScript extends Script {
      triggerEntered = false;

      onTriggerEnter() {
        this.triggerEntered = true;
      }

      reset() {
        this.triggerEntered = false;
      }
    }

    const triggerScript = obstacleEntity.addComponent(TriggerDetectionScript);

    roleEntity.layer = Layer.Layer1;
    obstacleEntity.layer = Layer.Layer2;

    controller.move(new Vector3(0, 0, 2), 0.0001, 0.1);

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);

    expect(triggerScript.triggerEntered).toBe(true);

    roleEntity.transform.position = new Vector3(0, 0, 0);
    triggerScript.reset();

    engine.sceneManager.activeScene.physics.setColliderLayerCollision(Layer.Layer1, Layer.Layer2, false);

    controller.move(new Vector3(0, 0, 2), 0.0001, 0.1);

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);

    expect(triggerScript.triggerEntered).toBe(false);

    // 恢复默认设置
    engine.sceneManager.activeScene.physics.setColliderLayerCollision(1, 2, true);
  });

  it("should handle manual collision group setting with trigger", () => {
    const controller = roleEntity.getComponent(CharacterController);

    const obstacleEntity = rootEntity.createChild("obstacle");
    obstacleEntity.transform.position = new Vector3(0, 0, 2);

    const obstacleCollider = obstacleEntity.addComponent(StaticCollider);
    const triggerShape = new BoxColliderShape();
    triggerShape.size = new Vector3(1, 1, 1);
    triggerShape.isTrigger = true;
    obstacleCollider.addShape(triggerShape);

    class TriggerDetectionScript extends Script {
      triggerEntered = false;

      onTriggerEnter() {
        this.triggerEntered = true;
      }

      reset() {
        this.triggerEntered = false;
      }
    }

    const triggerScript = obstacleEntity.addComponent(TriggerDetectionScript);

    roleEntity.layer = Layer.Layer1;
    obstacleEntity.layer = Layer.Layer2;

    controller.move(new Vector3(0, 0, 2), 0.0001, 0.1);

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);

    expect(triggerScript.triggerEntered).toBe(true);

    roleEntity.transform.position = new Vector3(0, 0, 0);
    triggerScript.reset();

    controller.collisionLayer = Layer.Layer10;

    engine.sceneManager.activeScene.physics.setColliderLayerCollision(Layer.Layer10, Layer.Layer2, false);

    controller.move(new Vector3(0, 0, 2), 0.0001, 0.1);

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);

    expect(triggerScript.triggerEntered).toBe(false);

    engine.sceneManager.activeScene.physics.setColliderLayerCollision(Layer.Layer10, Layer.Layer2, true);

    // 恢复默认设置
    engine.sceneManager.activeScene.physics.setColliderLayerCollision(Layer.Layer1, Layer.Layer2, true);
  });

  it("keep entity position when disabled", () => {
    roleEntity.transform.position = new Vector3(0, 0, 3);
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    const controller = roleEntity.getComponent(CharacterController);
    controller.enabled = false;
    controller.enabled = true;
    // @ts-ignore
    controller._syncWorldPositionFromPhysicalSpace();
    expect(roleEntity.transform.position.z).eq(3);
  });

  it("CapsuleColliderShape upAxis warning message", () => {
    const controller = roleEntity.getComponent(CharacterController);
    controller.clearShapes();

    const capsuleShape = new CapsuleColliderShape();
    controller.addShape(capsuleShape);

    // Mock console.warn to capture warning messages
    const originalWarn = console.warn;
    let warningMessage = "";
    console.warn = (message: string) => {
      warningMessage = message;
    };

    try {
      // Trigger the warning by setting upAxis when controller has shapes
      capsuleShape.upAxis = ColliderShapeUpAxis.X;

      // Verify the warning message has correct grammar and format
      expect(warningMessage).to.include(
        "Capsule character controller `upAxis` is not supported in PhysX and will be ignored"
      );
    } finally {
      // Restore original console.warn
      console.warn = originalWarn;
    }
  });

  it("BoxColliderShape rotation warning message", () => {
    const controller = roleEntity.getComponent(CharacterController);
    controller.clearShapes();

    const boxShape = new BoxColliderShape();
    controller.addShape(boxShape);

    // Mock console.warn to capture warning messages
    const originalWarn = console.warn;
    let warningMessage = "";
    console.warn = (message: string) => {
      warningMessage = message;
    };

    try {
      // Trigger the warning by setting rotation when controller has shapes
      boxShape.rotation = new Vector3(0, 45, 0);

      // Verify the warning message has correct grammar and format
      expect(warningMessage).to.include(
        "Box character controller `rotation` is not supported in PhysX and will be ignored"
      );
    } finally {
      // Restore original console.warn
      console.warn = originalWarn;
    }
  });

  it("PhysXCharacterController Box rotation warning on controller creation", () => {
    const controller = roleEntity.getComponent(CharacterController);
    controller.clearShapes();

    // Mock console.warn to capture warning messages
    const originalWarn = console.warn;
    let warningMessage = "";
    console.warn = (message: string) => {
      warningMessage = message;
    };

    try {
      const boxShape = new BoxColliderShape();
      // Set rotation before adding to controller to trigger warning during controller creation
      boxShape.rotation = new Vector3(45, 0, 0);

      // This should trigger the warning in PhysXCharacterController._createPXController
      controller.addShape(boxShape);

      // Verify the warning message has correct grammar and format
      expect(warningMessage).to.include(
        "Box character controller `rotation` is not supported in PhysX and will be ignored"
      );
    } finally {
      // Restore original console.warn
      console.warn = originalWarn;
    }
  });

  it("CapsuleColliderShape rotation warning message on controller creation", () => {
    const controller = roleEntity.getComponent(CharacterController);
    controller.clearShapes();

    // Mock console.warn to capture warning messages
    const originalWarn = console.warn;
    let warningMessage = "";
    console.warn = (message: string) => {
      warningMessage = message;
    };

    try {
      const capsuleShape = new CapsuleColliderShape();
      // Set rotation before adding to controller to trigger warning during controller creation
      capsuleShape.rotation = new Vector3(45, 0, 0);

      // This should trigger the warning in PhysXCharacterController._createPXController
      controller.addShape(capsuleShape);

      // Verify the warning message has correct grammar and format
      expect(warningMessage).to.include(
        "Capsule character controller `rotation` is not supported in PhysX and will be ignored"
      );
    } finally {
      // Restore original console.warn
      console.warn = originalWarn;
    }
  });

  it("PhysXCharacterController Capsule upAxis warning on controller creation", () => {
    const controller = roleEntity.getComponent(CharacterController);
    controller.clearShapes();

    // Mock console.warn to capture warning messages
    const originalWarn = console.warn;
    let warningMessage = "";
    console.warn = (message: string) => {
      warningMessage = message;
    };

    try {
      const capsuleShape = new CapsuleColliderShape();
      capsuleShape.upAxis = ColliderShapeUpAxis.X;

      // This should trigger the warning in PhysXCharacterController._createPXController
      controller.addShape(capsuleShape);

      // Verify the warning message has correct grammar and format
      expect(warningMessage).to.include(
        "Capsule character controller `upAxis` is not supported in PhysX and will be ignored"
      );
    } finally {
      // Restore original console.warn
      console.warn = originalWarn;
    }
  });

  it("BoxColliderShape size update affects collision detection", () => {
    const { fixedTimeStep } = engine.sceneManager.activeScene.physics;
    const controller = roleEntity.getComponent(CharacterController);
    controller.clearShapes();

    // Create a box shape with initial size
    const boxShape = new BoxColliderShape();
    boxShape.size = new Vector3(1, 2, 1); // Initial size: width=1, height=2, depth=1
    controller.addShape(boxShape);

    // Create an obstacle at a specific position that would collide if the controller is wide enough
    const obstacleEntity = rootEntity.createChild("obstacle");
    obstacleEntity.transform.position = new Vector3(1.2, 1, 0); // Positioned to the right
    const obstacleCollider = obstacleEntity.addComponent(StaticCollider);
    const obstacleShape = new BoxColliderShape();
    obstacleShape.size = new Vector3(1, 2, 1);
    obstacleCollider.addShape(obstacleShape);

    // Position the character controller at origin
    roleEntity.transform.position = new Vector3(0, 1, 0);

    // Try to move right - should not collide with initial narrow width (0.5 half-width)
    const moveDistance = new Vector3(1, 0, 0);
    controller.move(moveDistance, 0.0001, fixedTimeStep);
    const positionAfterFirstMove = roleEntity.transform.position.x;

    // Reset position
    roleEntity.transform.position = new Vector3(0, 1, 0);

    // Now increase the box size to make it wider
    boxShape.size = new Vector3(3, 2, 1); // Wider: width=3, height=2, depth=1 (half-width=1.5)

    // Try to move right again - should now collide due to increased width
    controller.move(moveDistance, 0.0001, fixedTimeStep);
    const positionAfterSecondMove = roleEntity.transform.position.x;

    // The character should move less distance (or not at all) when the box is wider due to collision
    expect(positionAfterSecondMove).toBeLessThan(positionAfterFirstMove);
  });

  it("BoxColliderShape height update affects step ability", () => {
    const { fixedTimeStep } = engine.sceneManager.activeScene.physics;
    const controller = roleEntity.getComponent(CharacterController);
    controller.stepOffset = 0.1;
    controller.clearShapes();

    // Create a box shape with initial size
    const boxShape = new BoxColliderShape();
    boxShape.size = new Vector3(1, 1, 1); // Initial height=1 (half-height=0.5)
    controller.addShape(boxShape);

    // Create a low step that only a short character can pass under
    const stepEntity = rootEntity.createChild("step");
    stepEntity.transform.position = new Vector3(0, 1.5, 2);
    const stepCollider = stepEntity.addComponent(StaticCollider);
    const stepShape = new BoxColliderShape();
    stepShape.size = new Vector3(5, 0.4, 1); // Low horizontal barrier
    stepCollider.addShape(stepShape);

    // Position the character controller at origin
    roleEntity.transform.position = new Vector3(0, 0.5, 0);

    // Try to move forward - should pass under with short height
    const moveDistance = new Vector3(0, 0, 3);
    controller.move(moveDistance, 0.0001, fixedTimeStep);
    const zPositionWithShortHeight = roleEntity.transform.position.z;
    console.log(roleEntity.transform.position, zPositionWithShortHeight);

    // Reset position
    roleEntity.transform.position = new Vector3(0, 0.5, 0);

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    // Now increase the box height to make it taller
    boxShape.size = new Vector3(1, 2, 1); // Taller: height=2 (half-height=1)

    // Try to move forward again - should now be blocked by the low ceiling
    controller.move(moveDistance, 0.0001, fixedTimeStep);
    const zPositionWithTallHeight = roleEntity.transform.position.z;

    // The taller character should move less distance due to collision with ceiling
    expect(zPositionWithTallHeight).toBeLessThan(zPositionWithShortHeight);
  });
});
