import { CapsuleColliderShape, CharacterController, Entity } from "@galacean/engine-core";
import { Vector3 } from "@galacean/engine-math";
import { PhysXPhysics } from "@galacean/engine-physics-physx";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { expect } from "chai";

describe("physics collider test", function () {
  this.timeout(5000);
  let engine: WebGLEngine;
  let rootEntity: Entity;
  let controllerEntity: Entity;

  before(async function () {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: new PhysXPhysics() });
    const scene = engine.sceneManager.activeScene;
    rootEntity = scene.createRootEntity("root");

    engine.run();
  });

  beforeEach(function () {
    rootEntity.clearChildren();

    controllerEntity = rootEntity.createChild("controller");
  });

  it("Set Position", function () {
    const physicsCapsule = new CapsuleColliderShape();
    physicsCapsule.radius = 0.15;
    physicsCapsule.height = 0.2;
    const characterController = controllerEntity.addComponent(CharacterController);
    characterController.addShape(physicsCapsule);

    physicsCapsule.position = new Vector3(5, 3, 3);
    expect(physicsCapsule.position.x).to.equal(5);
    expect(physicsCapsule.position.y).to.equal(3);
    expect(physicsCapsule.position.z).to.equal(3);
  });
});
