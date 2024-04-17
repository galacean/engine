/**
 * @title Physx Collision
 * @category Physics
 */
import {
  WebGLEngine,
  SphereColliderShape,
  DynamicCollider,
  BoxColliderShape,
  Vector3,
  MeshRenderer,
  PointLight,
  PrimitiveMesh,
  Camera,
  Script,
  StaticCollider,
  ColliderShape,
  PBRMaterial,
  AmbientLight,
  AssetType,
  BlinnPhongMaterial,
  Entity,
  BaseMaterial
} from "@galacean/engine";
import { WireframeManager } from "@galacean/engine-toolkit";

import { PhysXPhysics } from "@galacean/engine-physics-physx";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

function addBox(rootEntity: Entity, cubeSize: number, x: number, y: number, z: number, index: number) {
  const boxEntity = rootEntity.createChild("BoxEntity");
  boxEntity.transform.setPosition(x, y, z);
  boxEntity.transform.setScale(-1, 1, 1);

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
  physicsBox.material.staticFriction = 0.1;
  physicsBox.material.dynamicFriction = 0.2;
  physicsBox.material.bounciness = 1;
  physicsBox.isTrigger = true;

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
  cameraEntity.transform.setPosition(-5, 0, 20);

  // init point light
  const light = rootEntity.createChild("light");
  light.transform.setPosition(0, 3, 0);
  light.addComponent(PointLight);

  // create box test entity
  const boxEntity1 = addBox(rootEntity, 2, 0, 0, 0, 0);
  const boxEntity2 = addBox(rootEntity, 2, -10, 0, 0, 1);

  // create sphere test entity
  const radius = 1.25;
  const sphereEntity = rootEntity.createChild("SphereEntity");
  sphereEntity.transform.setPosition(-2, 0, 0);

  const sphereMtl = new PBRMaterial(engine);
  const sphereRenderer = sphereEntity.addComponent(MeshRenderer);
  sphereMtl.baseColor.set(Math.random(), Math.random(), Math.random(), 1.0);
  sphereMtl.metallic = 0.0;
  sphereMtl.roughness = 0.5;
  sphereRenderer.mesh = PrimitiveMesh.createSphere(engine, radius);
  sphereRenderer.setMaterial(sphereMtl);

  const physicsSphere = new SphereColliderShape();
  physicsSphere.radius = radius;
  physicsSphere.material.staticFriction = 0.1;
  physicsSphere.material.dynamicFriction = 0.2;
  physicsSphere.material.bounciness = 1;

  const sphereCollider = sphereEntity.addComponent(DynamicCollider);
  sphereCollider.isKinematic = true;
  sphereCollider.addShape(physicsSphere);

  rootEntity.addComponent(MeshRenderer);
  const wireframe = rootEntity.addComponent(WireframeManager); // debug draw
  wireframe.addEntityWireframe(sphereEntity);
  wireframe.addEntityWireframe(boxEntity1);
  wireframe.addEntityWireframe(boxEntity2);

  class MoveScript extends Script {
    pos: number = -5;
    vel: number = 0.05;
    velSign: number = -1;

    onPhysicsUpdate() {
      if (this.pos >= 5) {
        this.velSign = -1;
      }
      if (this.pos <= -15) {
        this.velSign = 1;
      }
      this.pos += this.vel * this.velSign;
      this.entity.transform.worldPosition.set(this.pos, 0, 0);
    }
  }

  // Collision Detection
  class CollisionScript extends Script {
    onTriggerExit(other: ColliderShape) {
      (<BlinnPhongMaterial>sphereRenderer.getMaterial()).baseColor.set(1, 1, 1, 1.0);
    }

    onTriggerEnter(other: ColliderShape) {
      (sphereRenderer.getMaterial() as BlinnPhongMaterial).baseColor = (
        other.collider.entity.getComponent(MeshRenderer)?.getMaterial() as PBRMaterial
      ).baseColor;
    }

    onTriggerStay(other: ColliderShape) {}
  }

  sphereEntity.addComponent(CollisionScript);
  sphereEntity.addComponent(MoveScript);

  engine.resourceManager
    .load<AmbientLight>({
      type: AssetType.Env,
      url: "https://gw.alipayobjects.com/os/bmw-prod/89c54544-1184-45a1-b0f5-c0b17e5c3e68.bin"
    })
    .then((ambientLight) => {
      scene.ambientLight = ambientLight;
      updateForE2E(engine, 95);
      initScreenshot(engine, camera);
    });
});
