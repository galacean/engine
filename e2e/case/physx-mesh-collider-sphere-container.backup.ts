/**
 * @title PhysX Mesh Collider Sphere Container
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

function setLayerRecursively(entity: Entity, layer: Layer): void {
  entity.layer = layer;
  const children = entity.children;
  for (let i = 0, n = children.length; i < n; i++) {
    setLayerRecursively(children[i], layer);
  }
}

/**
 * 颠锅脚本 - 模拟锅的轻微位移和旋转，使用 move 方法
 */
class PotShakeScript extends Script {
  /** 基准旋转（度），用于调整锅的初始朝向 */
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
    // 收集所有子节点的 DynamicCollider
    this._colliders = this.entity.getComponentsIncludeChildren(DynamicCollider, []);
  }

  onUpdate(): void {
    this._time += this.engine.time.deltaTime;

    // 位移：y 轴上下
    const y = this._basePosition.y + Math.sin(this._time * 3) * 0.06;
    this._tempPosition.set(this._basePosition.x, y, this._basePosition.z);

    // 旋转：在基准旋转上轻微摇晃
    const rotX = this.baseRotationX + Math.sin(this._time * 2.5) * 9;
    const rotZ = this.baseRotationZ + Math.cos(this._time * 2) * 6;
    Quaternion.rotationEuler(
      MathUtil.degreeToRadian(rotX),
      MathUtil.degreeToRadian(this.baseRotationY),
      MathUtil.degreeToRadian(rotZ),
      this._tempQuaternion
    );

    // 使用 move 方法移动所有 kinematic collider
    for (const collider of this._colliders) {
      collider.move(this._tempPosition, this._tempQuaternion);
    }
  }
}

/**
 * 点击交互脚本
 * - 点击空白处：从高处落下一个新物体
 * - 按住物体：设为 kinematic 并向上移动
 * - 松开物体：恢复非 kinematic，自由落下
 */
class ClickToTest extends Script {
  camera: Camera;

  private _ray = new Ray();
  private _hitResult = new HitResult();
  private _sphereCount = 0;
  private _heldCollider: DynamicCollider | null = null;
  private _tempPosition = new Vector3();

  onUpdate(): void {
    const inputManager = this.engine.inputManager;

    // 按下瞬间
    if (inputManager.isPointerDown(PointerButton.Primary)) {
      const pointerPosition = inputManager.pointers[0].position;
      this.camera.screenPointToRay(pointerPosition, this._ray);
      const hit = this.scene.physics.raycast(this._ray, 100, DYNAMIC_LAYER, this._hitResult);

      if (hit) {
        // 点击到物体，设为 kinematic
        const collider = this._hitResult.entity.getComponent(DynamicCollider);
        if (collider) {
          this._heldCollider = collider;
          this._heldCollider.collisionDetectionMode = CollisionDetectionMode.Discrete;
          collider.isKinematic = true;
        }
      } else {
        // 点击空白处，创建新物体
        this._createFallingObject();
      }
    }

    // 按住状态，持续向上移动
    if (this._heldCollider && inputManager.isPointerHeldDown(PointerButton.Primary)) {
      const pos = this._heldCollider.entity.transform.position;
      this._tempPosition.set(pos.x, pos.y + 0.5 * this.engine.time.deltaTime, pos.z);
      this._heldCollider.move(this._tempPosition);
    }

    // 松开
    if (inputManager.isPointerUp(PointerButton.Primary) && this._heldCollider) {
      this._heldCollider.isKinematic = false;
      this._heldCollider.collisionDetectionMode = CollisionDetectionMode.Continuous;
      this._heldCollider = null;
    }
  }

  private _createFallingObject(): void {
    const rootEntity = this.scene.rootEntities[0];
    const shapeTypes = ["sphere", "box", "capsule"];
    const shapeType = shapeTypes[Math.floor(Math.random() * shapeTypes.length)];
    const entity = rootEntity.createChild(`物体_${this._sphereCount++}`);
    entity.layer = DYNAMIC_LAYER;

    // 随机位置（容器中心上方）
    const x = (Math.random() - 0.5) * 0.2;
    const z = (Math.random() - 0.5) * 0.2;
    entity.transform.setPosition(x, 0.5, z);

    // 视觉
    const meshRenderer = entity.addComponent(MeshRenderer);
    const material = new PBRMaterial(this.engine);
    material.baseColor.set(Math.random(), Math.random(), Math.random(), 1);
    material.roughness = 0.5;
    material.metallic = 0.3;
    meshRenderer.setMaterial(material);

    // 物理
    const collider = entity.addComponent(DynamicCollider);
    collider.collisionDetectionMode = CollisionDetectionMode.Continuous;

    if (shapeType === "sphere") {
      meshRenderer.mesh = PrimitiveMesh.createSphere(this.engine, 0.05, 16);
      const shape = new SphereColliderShape();
      shape.radius = 0.05;
      collider.addShape(shape);
    } else if (shapeType === "box") {
      meshRenderer.mesh = PrimitiveMesh.createCuboid(this.engine);
      entity.transform.setScale(0.1, 0.1, 0.1);
      const shape = new BoxColliderShape();
      collider.addShape(shape);
    } else {
      meshRenderer.mesh = PrimitiveMesh.createCapsule(this.engine);
      entity.transform.setScale(0.01, 0.01, 0.01);
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

  // Camera
  const cameraEntity = rootEntity.createChild("camera");
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.transform.setPosition(0, 1, 3);
  cameraEntity.transform.lookAt(new Vector3(0, 0, 0));
  cameraEntity.addComponent(OrbitControl);

  // 添加点击测试脚本
  const clickScript = cameraEntity.addComponent(ClickToTest);
  clickScript.camera = camera;

  // Light
  const lightEntity = rootEntity.createChild("light");
  lightEntity.transform.setPosition(10, 20, 10);
  lightEntity.addComponent(PointLight);

  // 加载球形容器模型
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

    // 添加球形容器
    const container = gltf.instantiateSceneRoot();
    container.name = "sphereContainer";
    setLayerRecursively(container, CONTAINER_LAYER);
    rootEntity.addChild(container);

    // 为容器的每个 mesh 添加 MeshCollider (DynamicCollider + isKinematic)
    const renderers = container.getComponentsIncludeChildren(MeshRenderer, []);
    for (const renderer of renderers) {
      const mesh = renderer.mesh as ModelMesh;
      if (mesh) {
        const meshEntity = renderer.entity;
        const collider = meshEntity.addComponent(DynamicCollider);
        collider.isKinematic = true;

        const meshShape = new MeshColliderShape(false);
        meshShape.doubleSided = true;
        meshShape.setMesh(mesh);
        collider.addShape(meshShape);
        collider.entity.transform.setScale(1, 1, 1);
        collider.entity.transform.position.y = 0;
        collider.entity.transform.position.z -= 0.3;
      }
    }

    // 为容器添加颠锅脚本
    container.addComponent(PotShakeScript);

    console.log("=== MeshCollider Sphere Container ===");
    console.log("点击空白处：创建随机形状物体落下");
    console.log("点击物体：重置位置到高处");

    engine.run();
  });
});
