/**
 * @title LitePhysics Collision Group
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
  Entity,
  Layer
} from "@galacean/engine";

import { LitePhysics } from "@galacean/engine-physics-lite";
import { initScreenshot, updateForE2E } from "./.mockForE2E";
class MoveScript extends Script {
  onUpdate() {
    this.entity.transform.position.y -= 0.1;
  }

  onTriggerEnter(other: ColliderShape) {
    // Change color to green when collision occurs
    (this.entity.getComponent(MeshRenderer).getMaterial() as PBRMaterial).baseColor.set(0, 1, 0, 1);
  }
}
// Create a sphere with physics
function createPhysicsSphere(
  rootEntity: Entity,
  name: string,
  position: Vector3,
  radius: number,
  color: Vector3,
  layer: Layer
) {
  const sphereEntity = rootEntity.createChild(name);
  sphereEntity.transform.setPosition(position.x, position.y, position.z);
  sphereEntity.addComponent(MoveScript);

  // Add visual representation
  const sphereMtl = new PBRMaterial(rootEntity.engine);
  const sphereRenderer = sphereEntity.addComponent(MeshRenderer);
  sphereMtl.baseColor.set(color.x, color.y, color.z, 1.0);
  sphereMtl.metallic = 0.0;
  sphereMtl.roughness = 0.5;
  sphereRenderer.mesh = PrimitiveMesh.createSphere(rootEntity.engine, radius);
  sphereRenderer.setMaterial(sphereMtl);

  // Add physics
  const physicsSphere = new SphereColliderShape();
  physicsSphere.radius = radius;
  sphereEntity.layer = layer;

  const sphereCollider = sphereEntity.addComponent(DynamicCollider);

  sphereCollider.addShape(physicsSphere);

  return sphereEntity;
}

WebGLEngine.create({ canvas: "canvas", physics: new LitePhysics() }).then((engine) => {
  engine.canvas.resizeByClientSize();
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity("root");

  // Set up ambient lighting
  scene.ambientLight.diffuseSolidColor.set(1, 1, 1, 1);
  scene.ambientLight.diffuseIntensity = 1.2;

  // Set up camera
  const cameraEntity = rootEntity.createChild("camera");
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.transform.setPosition(0, 3, 15);
  cameraEntity.transform.lookAt(new Vector3(0, 0, 0));

  // Add point light
  const light = rootEntity.createChild("light");
  light.transform.setPosition(0, 10, 0);
  const pointLight = light.addComponent(PointLight);
  pointLight.intensity = 1.5;

  const groundEntity = rootEntity.createChild("ground");

  // 设置立方体的位置和大小
  groundEntity.transform.setPosition(0, 1, 0);
  // groundEntity.isActive = false;

  // Visual representation of the ground cube
  const groundMtl = new PBRMaterial(engine);
  groundMtl.baseColor.set(0.5, 0.5, 0.5, 1.0);
  groundMtl.roughness = 0.7;

  const cubeSize = new Vector3(10, 0.2, 10);
  const groundRenderer = groundEntity.addComponent(MeshRenderer);
  groundRenderer.mesh = PrimitiveMesh.createCuboid(engine, cubeSize.x, cubeSize.y, cubeSize.z);
  groundRenderer.setMaterial(groundMtl);

  // Physics for the ground cube
  const groundCollider = groundEntity.addComponent(StaticCollider);
  const groundShape = new BoxColliderShape();
  groundShape.size = cubeSize;
  groundCollider.addShape(groundShape);

  groundEntity.layer = Layer.Layer3;

  const sphere1 = createPhysicsSphere(
    rootEntity,
    "RedSphere",
    new Vector3(-2, 5, 0),
    0.5,
    new Vector3(1, 0, 0),
    Layer.Layer1
  );

  const sphere2 = createPhysicsSphere(
    rootEntity,
    "BlueSphere",
    new Vector3(2, 5, 0),
    0.5,
    new Vector3(0, 0, 1),
    Layer.Layer2
  );

  scene.physics.setColliderGroupCollision(2, 3, false);
  updateForE2E(engine, 1000, 38);
  initScreenshot(engine, camera);
});
