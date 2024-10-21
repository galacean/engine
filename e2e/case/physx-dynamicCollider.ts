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
  Script
} from "@galacean/engine";
import { WireframeManager } from "@galacean/engine-toolkit";

import { PhysXPhysics } from "@galacean/engine-physics-physx";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

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
  physicsBox.size = new Vector3(cubeSize, cubeSize, cubeSize);
  const boxCollider = boxEntity.addComponent(StaticCollider);

  boxCollider.addShape(physicsBox);
  return boxEntity;
}

WebGLEngine.create({ canvas: "canvas", physics: new PhysXPhysics() }).then((engine) => {
  engine.canvas.resizeByClientSize();
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity("root");

  scene.ambientLight.diffuseSolidColor.set(1, 1, 1, 1);
  scene.ambientLight.diffuseIntensity = 1.2;

  // init camera
  const cameraEntity = rootEntity.createChild("camera");
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.transform.setPosition(0, 0, 20);

  // create box test entity
  const boxEntity = addBox(rootEntity, 2, 0, 1.5, 0, 0);
  const boxEntity2 = addBox(rootEntity, 2, 0, 1.5, 0, 0);
  const ground = addPlane(rootEntity, 0, 0, 0);
  boxEntity2.getComponent(DynamicCollider).maxDepenetrationVelocity = 10;
  // const boxEntity2 = addStaticBox(rootEntity, 1, 0, 0, 0, 0);
  const collider = boxEntity.getComponent(DynamicCollider);
  // collider.centerOfMass = new Vector3(1, 0, 0);

  boxEntity.addComponent(
    class extends Script {
      onUpdate() {
        // console.log(collider.linearDamping);
      }
    }
  );

  rootEntity.addComponent(MeshRenderer);
  const wireframe = rootEntity.addComponent(WireframeManager); // debug draw
  wireframe.addEntityWireframe(boxEntity);

  engine.run();
});
