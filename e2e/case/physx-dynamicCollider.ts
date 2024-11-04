/**
 * @title Physx DynamicCollider
 * @category Physics
 */
import {
  WebGLEngine,
  BoxColliderShape,
  Vector3,
  MeshRenderer,
  PrimitiveMesh,
  Camera,
  StaticCollider,
  PBRMaterial,
  Entity,
  PlaneColliderShape,
  DynamicCollider,
  Script,
  FixedJoint,
  SpringJoint,
  CapsuleColliderShape,
  HingeJoint,
  SphereColliderShape,
  InputManager,
  PointerButton,
  Quaternion,
  JointMotor,
  JointLimits,
  DynamicColliderConstraints
} from "@galacean/engine";
import { WireframeManager } from "@galacean/engine-toolkit";

import { PhysXPhysics } from "@galacean/engine-physics-physx";
import { initScreenshot, updateForE2E } from "./.mockForE2E";
import { Collision } from "@galacean/engine-core/types/physics/Collision";

function addPlane(rootEntity: Entity, x: number, y: number, z: number) {
  const planeEntity = rootEntity.createChild("PlaneEntity");
  planeEntity.transform.setPosition(x, y, z);
  planeEntity.transform.setScale(20, 1, 20);

  const planeMtl = new PBRMaterial(rootEntity.engine);
  const planeRenderer = planeEntity.addComponent(MeshRenderer);
  planeMtl.baseColor.set(0.6, 0.6, 0.6, 1.0);
  planeMtl.roughness = 0.5;
  planeMtl.metallic = 0.0;
  planeRenderer.mesh = PrimitiveMesh.createPlane(rootEntity.engine, 1, 1);
  planeRenderer.setMaterial(planeMtl);

  const physicsPlane = new PlaneColliderShape();
  physicsPlane.material.dynamicFriction = 0;
  physicsPlane.material.staticFriction = 0;
  const planeCollider = planeEntity.addComponent(StaticCollider);
  planeCollider.addShape(physicsPlane);
  return planeEntity;
}
function addBox(rootEntity: Entity, cubeSize: number, x: number, y: number, z: number, index: number) {
  const boxEntity = rootEntity.createChild("BoxEntity");
  boxEntity.transform.setPosition(x, y, z);

  const boxMtl = new PBRMaterial(rootEntity.engine);
  const boxRenderer = boxEntity.addComponent(MeshRenderer);
  boxMtl.baseColor.set(0.6, 0.3, 0.3, 1.0);
  boxMtl.roughness = 0.5;
  boxMtl.metallic = 0.0;
  boxRenderer.mesh = PrimitiveMesh.createCuboid(rootEntity.engine, cubeSize, cubeSize, cubeSize);
  boxRenderer.setMaterial(boxMtl);
  if (index === 0) {
    boxMtl.baseColor.set(1, 0, 0, 1.0);
  } else {
    boxMtl.baseColor.set(0, 1, 0, 1.0);
  }

  const physicsBox = new BoxColliderShape();
  const physicsBox2 = new BoxColliderShape();
  const physicsBox3 = new BoxColliderShape();
  physicsBox.position = new Vector3(0, 0, 0);
  physicsBox2.position = new Vector3(2, 0, 0);
  physicsBox3.position = new Vector3(4, 0, 0);
  physicsBox.size = new Vector3(cubeSize, cubeSize, cubeSize);
  physicsBox2.size = new Vector3(cubeSize, cubeSize, cubeSize);
  physicsBox3.size = new Vector3(cubeSize, cubeSize, cubeSize);

  const boxCollider = boxEntity.addComponent(DynamicCollider);

  boxCollider.addShape(physicsBox);
  // boxCollider.addShape(physicsBox2);

  // boxCollider.addShape(physicsBox3);
  return boxEntity;
}

function addStaticBox(rootEntity: Entity, cubeSize: number, x: number, y: number, z: number, index: number) {
  const boxEntity = rootEntity.createChild("BoxEntity");
  boxEntity.transform.setPosition(x, y, z);

  const boxMtl = new PBRMaterial(rootEntity.engine);
  const boxRenderer = boxEntity.addComponent(MeshRenderer);
  boxMtl.baseColor.set(0, 0.1, 0.3, 1.0);
  boxMtl.roughness = 0.5;
  boxMtl.metallic = 0.0;
  boxRenderer.mesh = PrimitiveMesh.createCuboid(rootEntity.engine, cubeSize, cubeSize, 1);
  boxRenderer.setMaterial(boxMtl);

  const physicsBox = new BoxColliderShape();
  physicsBox.size = new Vector3(cubeSize, cubeSize, 1);
  const boxCollider = boxEntity.addComponent(StaticCollider);

  boxCollider.addShape(physicsBox);
  return boxEntity;
}

function addCapsule(rootEntity: Entity, radius: number, height: number, x: number, y: number, z: number) {
  const capsuleEntity = rootEntity.createChild("CapsuleEntity");
  capsuleEntity.transform.setPosition(x, y, z);

  const capsuleMtl = new PBRMaterial(rootEntity.engine);
  const capsuleRenderer = capsuleEntity.addComponent(MeshRenderer);
  capsuleMtl.baseColor.set(0.3, 0.3, 0.6, 1.0);
  capsuleMtl.roughness = 0.5;
  capsuleMtl.metallic = 0.0;
  capsuleRenderer.mesh = PrimitiveMesh.createCapsule(rootEntity.engine, radius, height);
  capsuleRenderer.setMaterial(capsuleMtl);

  const physicsCapsule = new CapsuleColliderShape();
  physicsCapsule.radius = radius;
  physicsCapsule.height = height;
  const capsuleCollider = capsuleEntity.addComponent(DynamicCollider);
  capsuleCollider.addShape(physicsCapsule);
  return capsuleEntity;
}

function addBall(rootEntity: Entity, radius: number, x: number, y: number, z: number) {
  const ballEntity = rootEntity.createChild("BallEntity");
  ballEntity.transform.setPosition(x, y, z);

  const ballMtl = new PBRMaterial(rootEntity.engine);
  const ballRenderer = ballEntity.addComponent(MeshRenderer);
  ballMtl.baseColor.set(0.3, 0.6, 0.3, 1.0);
  ballMtl.roughness = 0.5;
  ballMtl.metallic = 0.0;
  ballRenderer.mesh = PrimitiveMesh.createSphere(rootEntity.engine, radius);
  ballRenderer.setMaterial(ballMtl);

  const physicsSphere = new SphereColliderShape();
  physicsSphere.radius = radius;
  const ballCollider = ballEntity.addComponent(DynamicCollider);
  ballCollider.addShape(physicsSphere);
  return ballEntity;
}

WebGLEngine.create({ canvas: "canvas", physics: new PhysXPhysics() }).then((engine) => {
  engine.canvas.resizeByClientSize();
  const scene = engine.sceneManager.activeScene;
  scene.physics.gravity = new Vector3(0, 0, 0);
  const rootEntity = scene.createRootEntity("root");

  scene.ambientLight.diffuseSolidColor.set(1, 1, 1, 1);
  scene.ambientLight.diffuseIntensity = 1.2;

  // init camera
  const cameraEntity = rootEntity.createChild("camera");
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.transform.setPosition(0, 0, 20);

  // create box test entity
  const boxEntity = addBox(rootEntity, 1, 0, 5, 0, 1);
  const boxEntity2 = addBox(rootEntity, 1, 2, 5, 0, 0);
  const collider = boxEntity.getComponent(DynamicCollider);
  collider.isKinematic = true;
  const joint = boxEntity2.addComponent(SpringJoint);
  const collider2 = (joint.connectedCollider = boxEntity.getComponent(DynamicCollider));
  joint.autoConnectedAnchor = false;
  joint.anchor = new Vector3(-0.5, 0, 0);
  joint.connectedAnchor = new Vector3(0.5, 0, 0);
  joint.stiffness = 10000000000;
  joint.damping = 1;
  joint.minDistance = 1.1;
  joint.maxDistance = 5;
  joint.tolerance = 0;
  // joint.maxDistance = 3000;
  // collider2.applyForce(new Vector3(-1000, 0, 0));
  // joint.axis = new Vector3(0, 1, 0);
  // joint.useLimits = true;
  // joint.useSpring = true;
  // const limits = new JointLimits();
  // limits.min = -Math.PI / 2;
  // limits.max = Math.PI / 2;
  // limits.stiffness = 100;
  // limits.damping = 30;
  // joint.limits = limits;

  // collider2.constraints =
  //   DynamicColliderConstraints.FreezePositionX |
  //   DynamicColliderConstraints.FreezePositionY |
  //   DynamicColliderConstraints.FreezePositionZ;

  // const motor = new JointMotor();
  // motor.targetVelocity = 30;
  // motor.forceLimit = 1000;
  // motor.gearRation = 1;
  // joint.useMotor = true;
  // joint.motor = motor;
  // joint.breakTorque = 1;
  // collider2.applyTorque(new Vector3(0, 1000, 0));
  // @ts-ignore

  // @ts-ignore
  console.log(222, boxEntity2.transform.position);
  setInterval(() => {
    // joint.motor = new JointMotor();
    // motor.targetVelocity = 0;
    // joint.motor = motor;
    console.log(555, boxEntity2.transform.position.x);
  }, 16);
  engine.run();
  cameraEntity.addComponent(
    class extends Script {
      onUpdate() {
        const { inputManager } = this.engine;
        if (inputManager.isPointerDown(PointerButton.Primary)) {
          const ball = addBall(rootEntity, 0.2, 1, 4.5, 20);
          ball.getComponent(DynamicCollider).applyForce(new Vector3(0, 0, -1000));
        }
        // console.log(boxEntity.transform.position);
        // console.log(collider1.linearDamping);
      }
    }
  );
  // console.log(boxEntity.transform.position);
  // engine.update();
  // collider.centerOfMass = new Vector3(1, 0, 0);

  // boxEntity.addComponent(
  //   class extends Script {
  //     speed = 0.05;
  //     onPhysicsUpdate() {
  //       collider.move(new Vector3(0, this.entity.transform.position.y - this.speed, 0));
  //       if (this.entity.transform.position.y < -0.5) {
  //         this.speed = -0.05;
  //       } else if (this.entity.transform.position.y > 4) {
  //         this.speed = 0.05;
  //       }
  //       // console.log(collider.linearDamping);
  //     }

  //     onCollisionEnter(other: Collision): void {
  //       console.log("enter", other);
  //       const fixedJoint = boxEntity.addComponent(SpringJoint);
  //       fixedJoint.connectedCollider = boxEntity2.getComponent(DynamicCollider);
  //       fixedJoint.stiffness = 10000;
  //       fixedJoint.anchor = new Vector3(0, -0.5, 0);
  //       fixedJoint.connectedAnchor = new Vector3(0, 1, 0);
  //     }
  //   }
  // );

  rootEntity.addComponent(MeshRenderer);
  const wireframe = rootEntity.addComponent(WireframeManager); // debug draw
  wireframe.addEntityWireframe(boxEntity);

  // engine.run();
});
