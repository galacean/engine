/**
 * @title PhysX Compound
 * @category Physics
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*CnfERJy_GEgAAAAAAAAAAAAADiR2AQ/original
 */

import { OrbitControl } from "@galacean/engine-toolkit-controls";
import { PhysXPhysics, PhysXRuntimeMode } from "@galacean/engine-physics-physx";
import {
  AmbientLight,
  AssetType,
  BoxColliderShape,
  Camera,
  DirectLight,
  DynamicCollider,
  Entity,
  MeshRenderer,
  PBRMaterial,
  PlaneColliderShape,
  PrimitiveMesh,
  Quaternion,
  Script,
  ShadowType,
  StaticCollider,
  Vector2,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";

class TableGenerator extends Script {
  private _totalTime: number = 0;

  onUpdate(deltaTime: number): void {
    this._totalTime += deltaTime;
    if (this._totalTime > 0.3) {
      this._addTable();
      this._totalTime = 0;
    }
  }

  private _addTable(): void {
    const entity = this.entity.createChild("entity");
    entity.transform.setPosition(
      Math.random() * 16 - 8,
      10,
      Math.random() * 16 - 8
    );
    entity.transform.setRotation(
      Math.random() * 360,
      Math.random() * 360,
      Math.random() * 360
    );
    entity.transform.setScale(3, 3, 3);
    const boxCollider = entity.addComponent(DynamicCollider);
    boxCollider.mass = 10.0;

    const boxMaterial = new PBRMaterial(this.engine);
    boxMaterial.baseColor.set(Math.random(), Math.random(), Math.random(), 1.0);
    boxMaterial.metallic = 0;
    boxMaterial.roughness = 0.5;
    {
      const physicsBox = new BoxColliderShape();
      physicsBox.size = new Vector3(0.5, 0.4, 0.045);
      physicsBox.position.set(0, 0, 0.125);
      boxCollider.addShape(physicsBox);
      const child = entity.createChild();
      child.transform.setPosition(0, 0, 0.125);
      const boxRenderer = child.addComponent(MeshRenderer);
      boxRenderer.mesh = PrimitiveMesh.createCuboid(
        this.engine,
        0.5,
        0.4,
        0.045
      );
      boxRenderer.setMaterial(boxMaterial);
    }

    {
      const physicsBox1 = new BoxColliderShape();
      physicsBox1.size = new Vector3(0.1, 0.1, 0.3);
      physicsBox1.position.set(-0.2, -0.15, -0.045);
      boxCollider.addShape(physicsBox1);
      const child = entity.createChild();
      child.transform.setPosition(-0.2, -0.15, -0.045);
      const boxRenderer = child.addComponent(MeshRenderer);
      boxRenderer.mesh = PrimitiveMesh.createCuboid(this.engine, 0.1, 0.1, 0.3);
      boxRenderer.setMaterial(boxMaterial);
    }

    {
      const physicsBox2 = new BoxColliderShape();
      physicsBox2.size = new Vector3(0.1, 0.1, 0.3);
      physicsBox2.position.set(0.2, -0.15, -0.045);
      boxCollider.addShape(physicsBox2);
      const child = entity.createChild();
      child.transform.setPosition(0.2, -0.15, -0.045);
      const boxRenderer = child.addComponent(MeshRenderer);
      boxRenderer.mesh = PrimitiveMesh.createCuboid(this.engine, 0.1, 0.1, 0.3);
      boxRenderer.setMaterial(boxMaterial);
    }

    {
      const physicsBox3 = new BoxColliderShape();
      physicsBox3.size = new Vector3(0.1, 0.1, 0.3);
      physicsBox3.position.set(-0.2, 0.15, -0.045);
      boxCollider.addShape(physicsBox3);
      const child = entity.createChild();
      child.transform.setPosition(-0.2, 0.15, -0.045);
      const boxRenderer = child.addComponent(MeshRenderer);
      boxRenderer.mesh = PrimitiveMesh.createCuboid(this.engine, 0.1, 0.1, 0.3);
      boxRenderer.setMaterial(boxMaterial);
    }

    {
      const physicsBox4 = new BoxColliderShape();
      physicsBox4.size = new Vector3(0.1, 0.1, 0.3);
      physicsBox4.position.set(0.2, 0.15, -0.045);
      boxCollider.addShape(physicsBox4);
      const child = entity.createChild();
      child.transform.setPosition(0.2, 0.15, -0.045);
      const boxRenderer = child.addComponent(MeshRenderer);
      boxRenderer.mesh = PrimitiveMesh.createCuboid(this.engine, 0.1, 0.1, 0.3);
      boxRenderer.setMaterial(boxMaterial);
    }
  }
}

function addPlane(
  rootEntity: Entity,
  size: Vector2,
  position: Vector3,
  rotation: Quaternion
): Entity {
  const engine = rootEntity.engine;
  const material = new PBRMaterial(engine);
  material.baseColor.set(
    0.2179807202597362,
    0.2939682161541871,
    0.31177952549087604,
    1
  );
  material.roughness = 0.0;
  material.metallic = 0.0;

  const entity = rootEntity.createChild();
  const renderer = entity.addComponent(MeshRenderer);
  entity.transform.position = position;
  entity.transform.rotationQuaternion = rotation;
  renderer.mesh = PrimitiveMesh.createPlane(engine, size.x, size.y);
  renderer.setMaterial(material);

  const physicsPlane = new PlaneColliderShape();
  const planeCollider = entity.addComponent(StaticCollider);
  planeCollider.addShape(physicsPlane);

  return entity;
}

//--------------------------------------------------------------------------------------------------------------------

async function main() {
  const engine = await WebGLEngine.create({
    canvas: "canvas",
    physics: new PhysXPhysics(PhysXRuntimeMode.Auto),
  });

  engine.canvas.resizeByClientSize();
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity("root");
  scene.ambientLight.diffuseSolidColor.set(0.5, 0.5, 0.5, 1);
  scene.shadowDistance = 30;

  // init camera
  const cameraEntity = rootEntity.createChild("camera");
  cameraEntity.addComponent(Camera);
  cameraEntity.transform.setPosition(10, 10, 10);
  cameraEntity.addComponent(OrbitControl);

  // init directional light
  const light = rootEntity.createChild("light");
  light.transform.setPosition(-0.3, 1, 0.4);
  light.transform.lookAt(new Vector3(0, 0, 0));
  const directLight = light.addComponent(DirectLight);
  directLight.shadowType = ShadowType.SoftLow;

  addPlane(rootEntity, new Vector2(30, 30), new Vector3(), new Quaternion());
  rootEntity.addComponent(TableGenerator);

  engine.resourceManager
    .load<AmbientLight>({
      type: AssetType.Env,
      url: "https://gw.alipayobjects.com/os/bmw-prod/89c54544-1184-45a1-b0f5-c0b17e5c3e68.bin",
    })
    .then((ambientLight) => {
      scene.ambientLight = ambientLight;
      engine.run();
    });
}

main();
