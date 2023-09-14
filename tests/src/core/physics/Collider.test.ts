import {
  BoxColliderShape,
  DynamicCollider,
  Entity,
  PlaneColliderShape,
  Script,
  SphereColliderShape,
  StaticCollider
} from "@galacean/engine-core";
import { Vector3 } from "@galacean/engine-math";
import { PhysXPhysics } from "@galacean/engine-physics-physx";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import chai, { expect } from "chai";

class CollisionScript extends Script {
  onTriggerEnter(): void {}
  onTriggerStay(): void {}
  onTriggerExit(): void {}
  onCollisionEnter() {}
  onCollisionStay() {}
  onCollisionExit() {}
}

class MoveScript extends Script {
  pos: Vector3 = new Vector3(0, 0, 0);
  vel: number = 1;
  velSign: number = 1;

  move() {
    if (this.pos.x >= 3) {
      this.velSign = -1;
    }
    if (this.pos.x <= -3) {
      this.velSign = 1;
    }
    this.pos.x += this.vel * this.velSign;
    this.entity.getComponent(DynamicCollider).move(this.pos);
  }
}

describe("physics collider test", function () {
  this.timeout(10000);
  let engine: WebGLEngine;
  let rootEntity: Entity;
  let boxEntity: Entity;
  let sphereEntity: Entity;
  let physicsBox: BoxColliderShape;
  let physicsSphere: SphereColliderShape;

  before(async function () {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: new PhysXPhysics() });
    const scene = engine.sceneManager.activeScene;
    rootEntity = scene.createRootEntity("root");

    engine.run();
  });

  beforeEach(function () {
    rootEntity.clearChildren();

    boxEntity = rootEntity.createChild("BoxEntity");

    sphereEntity = rootEntity.createChild("SphereEntity");

    //ground
    const ground = rootEntity.createChild("ground");
    const physicsPlane = new PlaneColliderShape();
    const planeCollider = ground.addComponent(StaticCollider);
    planeCollider.addShape(physicsPlane);

    const cubeSize = 2.0;
    boxEntity.transform.position.x = 5;
    boxEntity.transform.position.y = cubeSize / 2;
    physicsBox = new BoxColliderShape();
    physicsBox.size = new Vector3(cubeSize, cubeSize, cubeSize);

    const radius = 1.25;
    sphereEntity.transform.position.x = 0;
    sphereEntity.transform.position.y = radius;
    physicsSphere = new SphereColliderShape();
    physicsSphere.radius = radius;

    CollisionScript.prototype.onCollisionEnter = chai.spy(CollisionScript.prototype.onCollisionEnter);
    CollisionScript.prototype.onCollisionStay = chai.spy(CollisionScript.prototype.onCollisionStay);
    CollisionScript.prototype.onCollisionExit = chai.spy(CollisionScript.prototype.onCollisionExit);
    CollisionScript.prototype.onTriggerEnter = chai.spy(CollisionScript.prototype.onTriggerEnter);
    CollisionScript.prototype.onTriggerStay = chai.spy(CollisionScript.prototype.onTriggerStay);
    CollisionScript.prototype.onTriggerExit = chai.spy(CollisionScript.prototype.onTriggerExit);
  });

  it("Dynamic vs Dynamic", function () {
    const boxCollider = boxEntity.addComponent(DynamicCollider);
    boxCollider.addShape(physicsBox);
    const sphereCollider = sphereEntity.addComponent(DynamicCollider);
    sphereCollider.addShape(physicsSphere);
    const collisionScript = sphereEntity.addComponent(CollisionScript);
    sphereCollider.applyForce(new Vector3(500, 0, 0));

    for (let i = 0; i < 5; i++) {
      //@ts-ignore
      engine.physicsManager._update(16);
    }

    expect(collisionScript.onCollisionEnter).to.have.been.called.gt(1);
    expect(collisionScript.onCollisionStay).to.have.been.called.gt(1);
    expect(collisionScript.onCollisionExit).to.have.been.called.exactly(1);
    expect(boxEntity.transform.position.x).not.to.be.equal(5);
  });

  it("Dynamic vs Static", function () {
    const boxCollider = boxEntity.addComponent(StaticCollider);
    boxCollider.addShape(physicsBox);

    const sphereCollider = sphereEntity.addComponent(DynamicCollider);
    sphereCollider.addShape(physicsSphere);
    const collisionScript = sphereEntity.addComponent(CollisionScript);
    sphereCollider.applyForce(new Vector3(500, 0, 0));

    for (let i = 0; i < 5; i++) {
      //@ts-ignore
      engine.physicsManager._update(16);
    }
    expect(collisionScript.onCollisionEnter).to.have.been.called.gt(1);
    expect(collisionScript.onCollisionStay).to.have.been.called.gt(1);
    expect(collisionScript.onCollisionExit).to.have.been.called.exactly(1);
    expect(boxEntity.transform.position.x).to.be.equal(5);
  });

  it("Dynamic vs Kinematic", function () {
    const boxCollider = boxEntity.addComponent(DynamicCollider);
    boxCollider.isKinematic = true;
    boxCollider.addShape(physicsBox);

    const sphereCollider = sphereEntity.addComponent(DynamicCollider);
    sphereCollider.addShape(physicsSphere);
    const collisionScript = sphereEntity.addComponent(CollisionScript);
    sphereCollider.applyForce(new Vector3(500, 0, 0));

    for (let i = 0; i < 5; i++) {
      //@ts-ignore
      engine.physicsManager._update(16);
    }
    expect(collisionScript.onCollisionEnter).to.have.been.called.gt(1);
    expect(collisionScript.onCollisionStay).to.have.been.called.gt(1);
    expect(collisionScript.onCollisionExit).to.have.been.called.exactly(1);
    expect(boxEntity.transform.position.x).to.be.equal(5);
  });

  it("Kinematic vs Static", function () {
    const boxCollider = boxEntity.addComponent(StaticCollider);
    boxCollider.addShape(physicsBox);

    const sphereCollider = sphereEntity.addComponent(DynamicCollider);
    sphereCollider.isKinematic = true;
    sphereCollider.addShape(physicsSphere);
    const collisionScript = sphereEntity.addComponent(CollisionScript);
    const script = sphereEntity.addComponent(MoveScript);

    for (let i = 0; i < 5; i++) {
      script.move();
      //@ts-ignore
      engine.physicsManager._update(16);
    }
    expect(collisionScript.onCollisionEnter).to.have.been.called.gt(1);
    expect(collisionScript.onCollisionStay).to.have.been.called.gt(1);
    expect(collisionScript.onCollisionExit).to.have.been.called.exactly(1);
    expect(boxEntity.transform.position.x).to.be.equal(5);
  });

  it("Kinematic vs Kinematic", function () {
    const boxCollider = boxEntity.addComponent(DynamicCollider);
    boxCollider.isKinematic = true;
    boxCollider.addShape(physicsBox);

    const sphereCollider = sphereEntity.addComponent(DynamicCollider);
    sphereCollider.isKinematic = true;
    sphereCollider.addShape(physicsSphere);
    const collisionScript = sphereEntity.addComponent(CollisionScript);
    const script = sphereEntity.addComponent(MoveScript);

    for (let i = 0; i < 5; i++) {
      script.move();
      //@ts-ignore
      engine.physicsManager._update(16);
    }
    expect(collisionScript.onCollisionEnter).to.have.been.called.gt(1);
    expect(collisionScript.onCollisionStay).to.have.been.called.gt(1);
    expect(collisionScript.onCollisionExit).to.have.been.called.exactly(1);
    expect(boxEntity.transform.position.x).to.be.equal(5);
  });

  it("Dynamic vs Static Trigger", function () {
    const boxCollider = boxEntity.addComponent(StaticCollider);
    physicsBox.isTrigger = true;
    boxCollider.addShape(physicsBox);
    const sphereCollider = sphereEntity.addComponent(DynamicCollider);
    sphereCollider.addShape(physicsSphere);
    const collisionScript = sphereEntity.addComponent(CollisionScript);
    sphereCollider.applyForce(new Vector3(500, 0, 0));

    for (let i = 0; i < 5; i++) {
      //@ts-ignore
      engine.physicsManager._update(16);
    }
    expect(collisionScript.onTriggerEnter).to.have.been.called.exactly(1);
    expect(collisionScript.onTriggerStay).to.have.been.called.gt(1);
    expect(collisionScript.onTriggerExit).to.have.been.called.exactly(1);
    expect(boxEntity.transform.position.x).to.be.equal(5);
  });

  it("Kinematic vs Static Trigger", function () {
    const boxCollider = boxEntity.addComponent(StaticCollider);
    physicsBox.isTrigger = true;
    boxCollider.addShape(physicsBox);
    const sphereCollider = sphereEntity.addComponent(DynamicCollider);
    sphereCollider.addShape(physicsSphere);
    sphereCollider.isKinematic = true;
    const collisionScript = sphereEntity.addComponent(CollisionScript);
    const script = sphereEntity.addComponent(MoveScript);

    for (let i = 0; i < 5; i++) {
      script.move();
      //@ts-ignore
      engine.physicsManager._update(16);
    }
    expect(collisionScript.onTriggerEnter).to.have.been.called.exactly(1);
    expect(collisionScript.onTriggerStay).to.have.been.called.gt(1);
    expect(collisionScript.onTriggerExit).to.have.been.called.exactly(1);
    expect(boxEntity.transform.position.x).to.be.equal(5);
  });

  it("Dynamic vs Dynamic Trigger", function () {
    const boxCollider = boxEntity.addComponent(DynamicCollider);
    physicsBox.isTrigger = true;
    const physicsBox2 = new BoxColliderShape();
    physicsBox2.size = new Vector3(2, 2, 2);
    boxCollider.addShape(physicsBox);
    boxCollider.addShape(physicsBox2);
    const sphereCollider = sphereEntity.addComponent(DynamicCollider);
    sphereCollider.addShape(physicsSphere);
    const collisionScript = sphereEntity.addComponent(CollisionScript);
    sphereCollider.applyForce(new Vector3(500, 0, 0));

    for (let i = 0; i < 5; i++) {
      //@ts-ignore
      engine.physicsManager._update(16);
    }
    expect(collisionScript.onTriggerEnter).to.have.been.called.exactly(1);
    expect(collisionScript.onTriggerStay).to.have.been.called.gt(1);
    expect(collisionScript.onTriggerExit).to.have.been.called.exactly(1);
    expect(boxEntity.transform.position.x).not.to.be.equal(5);
  });

  it("Kinematic vs Dynamic Trigger", function () {
    const boxCollider = boxEntity.addComponent(DynamicCollider);
    physicsBox.isTrigger = true;
    const physicsBox2 = new BoxColliderShape();
    physicsBox2.size = new Vector3(2, 2, 2);
    boxCollider.addShape(physicsBox);
    boxCollider.addShape(physicsBox2);
    const sphereCollider = sphereEntity.addComponent(DynamicCollider);
    sphereCollider.addShape(physicsSphere);
    sphereCollider.isKinematic = true;
    const collisionScript = sphereEntity.addComponent(CollisionScript);
    const script = sphereEntity.addComponent(MoveScript);

    for (let i = 0; i < 5; i++) {
      script.move();
      //@ts-ignore
      engine.physicsManager._update(16);
    }
    expect(collisionScript.onTriggerEnter).to.have.been.called.exactly(1);
    expect(collisionScript.onTriggerStay).to.have.been.called.gt(1);
    expect(collisionScript.onTriggerExit).to.have.been.called.exactly(1);
    expect(boxEntity.transform.position.x).not.to.be.equal(5);
  });
});
