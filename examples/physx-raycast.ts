/**
 * @title PhysX Raycast
 * @category Physics
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*8as1SLJgJ6EAAAAAAAAAAAAADiR2AQ/original
 */

import {
  AmbientLight,
  AssetType,
  BoxColliderShape,
  Camera,
  CapsuleColliderShape,
  Color,
  DirectLight,
  DynamicCollider,
  Entity,
  Font,
  HitResult,
  Layer,
  MeshRenderer,
  PBRMaterial,
  PlaneColliderShape,
  PointerButton,
  PrimitiveMesh,
  Quaternion,
  Ray,
  Script,
  ShadowType,
  SphereColliderShape,
  StaticCollider,
  TextRenderer,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";
import { OrbitControl } from "@galacean/engine-toolkit-controls";

import { PhysXPhysics } from "@galacean/engine-physics-physx";

class GeometryGenerator extends Script {
  quat: Quaternion;

  onAwake() {
    this.quat = new Quaternion(0, 0, 0.3, 0.7);
    this.quat.normalize();
  }

  onUpdate(deltaTime: number) {
    const quat = this.quat;
    const inputManager = this.engine.inputManager;
    if (inputManager.isPointerDown(PointerButton.Secondary)) {
      if (Math.random() > 0.5) {
        addSphere(
          this.entity,
          0.5,
          new Vector3(
            Math.floor(Math.random() * 6) - 2.5,
            5,
            Math.floor(Math.random() * 6) - 2.5
          ),
          quat
        );
      } else {
        addCapsule(
          this.entity,
          0.5,
          2.0,
          new Vector3(
            Math.floor(Math.random() * 6) - 2.5,
            5,
            Math.floor(Math.random() * 6) - 2.5
          ),
          quat
        );
      }
    }
  }
}

class Raycast extends Script {
  camera: Camera;
  ray = new Ray();
  hit = new HitResult();

  onAwake() {
    this.camera = this.entity.getComponent(Camera);
  }

  onUpdate(deltaTime: number) {
    const engine = this.engine;
    const ray = this.ray;
    const hit = this.hit;
    const inputManager = this.engine.inputManager;
    const pointers = inputManager.pointers;
    if (pointers && inputManager.isPointerDown(PointerButton.Primary)) {
      const pointerPosition = pointers[0].position;
      this.camera.screenPointToRay(pointerPosition, ray);

      const result = engine.physicsManager.raycast(
        ray,
        Number.MAX_VALUE,
        Layer.Layer0,
        hit
      );
      if (result) {
        const mtl = new PBRMaterial(engine);
        mtl.baseColor.set(Math.random(), Math.random(), Math.random(), 1.0);
        mtl.metallic = 0.0;
        mtl.roughness = 0.5;

        const meshes: MeshRenderer[] = [];
        hit.entity.getComponentsIncludeChildren(MeshRenderer, meshes);
        meshes.forEach((mesh: MeshRenderer) => {
          mesh.setMaterial(mtl);
        });
      }
    }
  }
}

// init scene
function init(rootEntity: Entity) {
  const quat = new Quaternion(0, 0, 0.3, 0.7);
  quat.normalize();
  addPlane(
    rootEntity,
    new Vector3(30, 0.0, 30),
    new Vector3(),
    new Quaternion()
  );
  // eslint-disable-next-line no-plusplus
  for (let i = 0; i < 8; i++) {
    // eslint-disable-next-line no-plusplus
    for (let j = 0; j < 8; j++) {
      const random = Math.floor(Math.random() * 3) % 3;
      switch (random) {
        case 0:
          addBox(
            rootEntity,
            new Vector3(1, 1, 1),
            new Vector3(-4 + i, Math.floor(Math.random() * 6) + 1, -4 + j),
            quat
          );
          break;
        case 1:
          addSphere(
            rootEntity,
            0.5,
            new Vector3(
              Math.floor(Math.random() * 16) - 4,
              5,
              Math.floor(Math.random() * 16) - 4
            ),
            quat
          );
          break;
        case 2:
          addCapsule(
            rootEntity,
            0.5,
            2.0,
            new Vector3(
              Math.floor(Math.random() * 16) - 4,
              5,
              Math.floor(Math.random() * 16) - 4
            ),
            quat
          );
          break;
        default:
          break;
      }
    }
  }
}

function addPlane(
  rootEntity: Entity,
  size: Vector3,
  position: Vector3,
  rotation: Quaternion
): Entity {
  const mtl = new PBRMaterial(rootEntity.engine);
  mtl.baseColor.set(
    0.2179807202597362,
    0.2939682161541871,
    0.31177952549087604,
    1
  );
  mtl.roughness = 0.0;
  mtl.metallic = 0.0;
  const planeEntity = rootEntity.createChild();
  planeEntity.layer = Layer.Layer1;

  const renderer = planeEntity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createCuboid(
    rootEntity.engine,
    size.x,
    size.y,
    size.z
  );
  renderer.setMaterial(mtl);
  planeEntity.transform.position = position;
  planeEntity.transform.rotationQuaternion = rotation;

  const physicsPlane = new PlaneColliderShape();
  physicsPlane.position.set(0, size.y, 0);
  const planeCollider = planeEntity.addComponent(StaticCollider);
  planeCollider.addShape(physicsPlane);

  return planeEntity;
}

function addBox(
  rootEntity: Entity,
  size: Vector3,
  position: Vector3,
  rotation: Quaternion
): Entity {
  const mtl = new PBRMaterial(rootEntity.engine);
  mtl.baseColor.set(Math.random(), Math.random(), Math.random(), 1.0);
  mtl.metallic = 0.0;
  mtl.roughness = 0.5;
  const boxEntity = rootEntity.createChild();
  const renderer = boxEntity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createCuboid(
    rootEntity.engine,
    size.x,
    size.y,
    size.z
  );
  renderer.setMaterial(mtl);
  boxEntity.transform.position = position;
  boxEntity.transform.rotationQuaternion = rotation;

  const physicsBox = new BoxColliderShape();
  physicsBox.size = size;
  physicsBox.isTrigger = false;
  const boxCollider = boxEntity.addComponent(DynamicCollider);
  boxCollider.addShape(physicsBox);

  return boxEntity;
}

function addSphere(
  rootEntity: Entity,
  radius: number,
  position: Vector3,
  rotation: Quaternion
): Entity {
  const mtl = new PBRMaterial(rootEntity.engine);
  mtl.baseColor.set(Math.random(), Math.random(), Math.random(), 1.0);
  mtl.metallic = 0.0;
  mtl.roughness = 0.5;
  const sphereEntity = rootEntity.createChild();
  const renderer = sphereEntity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createSphere(rootEntity.engine, radius);
  renderer.setMaterial(mtl);
  sphereEntity.transform.position = position;
  sphereEntity.transform.rotationQuaternion = rotation;

  const physicsSphere = new SphereColliderShape();
  physicsSphere.radius = radius;
  const sphereCollider = sphereEntity.addComponent(DynamicCollider);
  sphereCollider.addShape(physicsSphere);

  return sphereEntity;
}

function addCapsule(
  rootEntity: Entity,
  radius: number,
  height: number,
  position: Vector3,
  rotation: Quaternion
): Entity {
  const mtl = new PBRMaterial(rootEntity.engine);
  mtl.baseColor.set(Math.random(), Math.random(), Math.random(), 1.0);
  mtl.metallic = 0.0;
  mtl.roughness = 0.5;
  const capsuleEntity = rootEntity.createChild();
  const renderer = capsuleEntity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createCapsule(
    rootEntity.engine,
    radius,
    height,
    20
  );
  renderer.setMaterial(mtl);
  capsuleEntity.transform.position = position;
  capsuleEntity.transform.rotationQuaternion = rotation;

  const physicsCapsule = new CapsuleColliderShape();
  physicsCapsule.radius = radius;
  physicsCapsule.height = height;
  const capsuleCollider = capsuleEntity.addComponent(DynamicCollider);
  capsuleCollider.addShape(physicsCapsule);

  return capsuleEntity;
}

//----------------------------------------------------------------------------------------------------------------------
WebGLEngine.create({ canvas: "canvas", physics: new PhysXPhysics() }).then((engine) => {

  engine.canvas.resizeByClientSize();
  const scene = engine.sceneManager.activeScene;
  scene.shadowDistance = 50;
  const rootEntity = scene.createRootEntity();
  rootEntity.addComponent(GeometryGenerator);

  // init camera
  const cameraEntity = rootEntity.createChild("camera");
  cameraEntity.addComponent(Camera);
  const pos = cameraEntity.transform.position;
  pos.set(20, 20, 20);
  cameraEntity.transform.lookAt(new Vector3());
  cameraEntity.addComponent(OrbitControl);
  cameraEntity.addComponent(Raycast);

  const entity = cameraEntity.createChild("text");
  entity.transform.position = new Vector3(0, 3.5, -10);
  const renderer = entity.addComponent(TextRenderer);
  renderer.color = new Color();
  renderer.text = "Use mouse to click the entity";
  renderer.font = Font.createFromOS(entity.engine, "Arial");
  renderer.fontSize = 40;

  // init directional light
  const light = rootEntity.createChild("light");
  light.transform.setPosition(-0.3, 1, 0.4);
  light.transform.lookAt(new Vector3(0, 0, 0));
  const directLight = light.addComponent(DirectLight);
  directLight.intensity = 1;
  directLight.shadowType = ShadowType.SoftLow;
  directLight.shadowStrength = 1;

  init(rootEntity);

  engine.resourceManager
    .load<AmbientLight>({
      type: AssetType.Env,
      url: "https://gw.alipayobjects.com/os/bmw-prod/89c54544-1184-45a1-b0f5-c0b17e5c3e68.bin",
    })
    .then((ambientLight) => {
      scene.ambientLight = ambientLight;
      engine.run();
    });
});
