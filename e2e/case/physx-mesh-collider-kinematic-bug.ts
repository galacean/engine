/**
 * @title PhysX Mesh Collider Kinematic Bug
 * @category Physics
 * @description 点击屏幕创建随机形状物体落下，点击物体重置位置
 */
import {
  WebGLEngine,
  Vector3,
  Quaternion,
  MeshRenderer,
  PointLight,
  Camera,
  StaticCollider,
  DynamicCollider,
  CollisionDetectionMode,
  PBRMaterial,
  AmbientLight,
  AssetType,
  ModelMesh,
  MeshColliderShape,
  GLTFResource,
  SphereColliderShape,
  BoxColliderShape,
  CapsuleColliderShape,
  PrimitiveMesh,
  Script,
  Entity,
  Layer,
  PointerButton,
  HitResult,
  Ray,
  MathUtil
} from "@galacean/engine";
import { PhysXPhysics } from "@galacean/engine-physics-physx";
import { OrbitControl } from "@galacean/engine-toolkit";

const CONTAINER_LAYER = Layer.Layer1;
const DYNAMIC_LAYER = Layer.Layer2;

/**
 * 颠锅脚本 - 模拟锅的轻微位移和旋转，使用 move 方法
 */
class PotShakeScript extends Script {
  baseRotationX = -90;
  baseRotationY = 0;
  baseRotationZ = 0;

  private _time = 0;
  private _colliders: DynamicCollider[] = [];
  private _basePosition = new Vector3();
  private _tempPosition = new Vector3();
  private _tempQuaternion = new Quaternion();

  onStart(): void {
    this._basePosition.copyFrom(this.entity.transform.position);
    this._colliders = this.entity.getComponentsIncludeChildren(DynamicCollider, []);
  }

  onUpdate(): void {
    this._time += this.engine.time.deltaTime;

    const y = this._basePosition.y + Math.sin(this._time * 3) * 0.06;
    this._tempPosition.set(this._basePosition.x, y, this._basePosition.z);

    const rotX = this.baseRotationX + Math.sin(this._time * 2.5) * 9;
    const rotZ = this.baseRotationZ + Math.cos(this._time * 2) * 6;
    Quaternion.rotationEuler(
      MathUtil.degreeToRadian(rotX),
      MathUtil.degreeToRadian(this.baseRotationY),
      MathUtil.degreeToRadian(rotZ),
      this._tempQuaternion
    );

    for (const collider of this._colliders) {
      collider.move(this._tempPosition, this._tempQuaternion);
    }
  }
}

function setLayerRecursively(entity: Entity, layer: Layer): void {
  entity.layer = layer;
  const children = entity.children;
  for (let i = 0, n = children.length; i < n; i++) {
    setLayerRecursively(children[i], layer);
  }
}

/**
 * 点击交互脚本
 */
class ClickToTest extends Script {
  camera: Camera;

  private _ray = new Ray();
  private _hitResult = new HitResult();
  private _sphereCount = 0;
  private _tempPosition = new Vector3();

  onUpdate(): void {
    const inputManager = this.engine.inputManager;

    if (inputManager.isPointerDown(PointerButton.Primary)) {
      const pointerPosition = inputManager.pointers[0].position;
      this.camera.screenPointToRay(pointerPosition, this._ray);
      const hit = this.scene.physics.raycast(this._ray, 100, DYNAMIC_LAYER, this._hitResult);

      if (hit) {
        const collider = this._hitResult.entity.getComponent(DynamicCollider);
        if (collider) {
          collider.collisionDetectionMode = CollisionDetectionMode.Discrete;
          collider.isKinematic = true;
          collider.useGravity = false;
          collider.linearVelocity = new Vector3(0, 0, 0);
          collider.angularVelocity = new Vector3(0, 0, 0);

          const pos = collider.entity.transform.position;
          this._tempPosition.set(pos.x, pos.y + 0.3, pos.z);
          collider.move(this._tempPosition);

          setTimeout(() => {
            collider.isKinematic = false;
            collider.useGravity = true;
            collider.collisionDetectionMode = CollisionDetectionMode.Continuous;
            collider.wakeUp();
          }, 200);
        }
      } else {
        this._createFallingObject();
      }
    }
  }

  private _createFallingObject(): void {
    const rootEntity = this.scene.rootEntities[0];
    const shapeTypes = ["sphere", "box", "capsule"];
    const shapeType = shapeTypes[Math.floor(Math.random() * shapeTypes.length)];
    const entity = rootEntity.createChild(`物体_${this._sphereCount++}`);
    entity.layer = DYNAMIC_LAYER;

    const x = (Math.random() - 0.5) * 4;
    const z = (Math.random() - 0.5) * 4;
    entity.transform.setPosition(x, 10, z);

    const meshRenderer = entity.addComponent(MeshRenderer);
    const material = new PBRMaterial(this.engine);
    material.baseColor.set(Math.random(), Math.random(), Math.random(), 1);
    material.roughness = 0.5;
    material.metallic = 0.3;
    meshRenderer.setMaterial(material);

    const collider = entity.addComponent(DynamicCollider);
    collider.collisionDetectionMode = CollisionDetectionMode.Continuous;

    // 同步 sphere-container: 物体放大 20 倍
    if (shapeType === "sphere") {
      meshRenderer.mesh = PrimitiveMesh.createSphere(this.engine, 1, 16);
      const shape = new SphereColliderShape();
      shape.radius = 1;
      collider.addShape(shape);
    } else if (shapeType === "box") {
      meshRenderer.mesh = PrimitiveMesh.createCuboid(this.engine);
      entity.transform.setScale(2, 2, 2);
      const shape = new BoxColliderShape();
      collider.addShape(shape);
    } else {
      meshRenderer.mesh = PrimitiveMesh.createCapsule(this.engine);
      entity.transform.setScale(0.2, 0.2, 0.2);
      const shape = new CapsuleColliderShape();
      collider.addShape(shape);
    }
  }
}

WebGLEngine.create({ canvas: "canvas", physics: new PhysXPhysics() }).then((engine) => {
  engine.canvas.resizeByClientSize();
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity("root");

  scene.ambientLight.diffuseSolidColor.set(1, 1, 1, 1);
  scene.ambientLight.diffuseIntensity = 1.2;

  const cameraEntity = rootEntity.createChild("camera");
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.transform.setPosition(0, 1, 3);
  cameraEntity.transform.lookAt(new Vector3(0, 0, 0));
  cameraEntity.addComponent(OrbitControl);

  const clickScript = cameraEntity.addComponent(ClickToTest);
  clickScript.camera = camera;

  const lightEntity = rootEntity.createChild("light");
  lightEntity.transform.setPosition(10, 20, 10);
  lightEntity.addComponent(PointLight);

  // 基准状态: pot.glb + StaticCollider (和 sphere-container 一致)
  Promise.all([
    engine.resourceManager.load<GLTFResource>({
      url: "https://mdn.alipayobjects.com/rms/afts/file/A*UZO7RaRQa2kAAAAAgDAAAAgAehQnAQ/pot.glb",
      type: AssetType.GLTF,
      params: { keepMeshData: true }
    }),
    engine.resourceManager.load<AmbientLight>({
      type: AssetType.Env,
      url: "https://gw.alipayobjects.com/os/bmw-prod/89c54544-1184-45a1-b0f5-c0b17e5c3e68.bin"
    })
  ]).then(([gltf, ambientLight]) => {
    scene.ambientLight = ambientLight;

    const container = gltf.instantiateSceneRoot();
    container.name = "sphereContainer";
    setLayerRecursively(container, CONTAINER_LAYER);
    rootEntity.addChild(container);

    const renderers = container.getComponentsIncludeChildren(MeshRenderer, []);
    for (const renderer of renderers) {
      const mesh = renderer.mesh as ModelMesh;
      if (mesh) {
        const meshEntity = renderer.entity;
        // 测试1: DynamicCollider + isKinematic
        const collider = meshEntity.addComponent(DynamicCollider);
        collider.isKinematic = true;

        const meshShape = new MeshColliderShape(false);
        meshShape.doubleSided = true;
        meshShape.setMesh(mesh);
        meshShape.contactOffset = 0.05;
        collider.addShape(meshShape);
        // 同步 sphere-container: scale=20, 无 KinematicKeepAlive
        collider.entity.transform.setScale(20, 20, 20);
        collider.entity.transform.position.y = 0;
        collider.entity.transform.position.z -= 6;
      }
    }

    // 同步: 添加颠锅脚本
    container.addComponent(PotShakeScript);

    console.log("=== 同步 sphere-container ===");
    engine.run();
  });
});
