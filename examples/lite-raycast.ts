/**
 * @title Lite Raycast
 * @category Physics
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*3jekSqyUAFgAAAAAAAAAAAAADiR2AQ/original
 */
import {
  AmbientLight,
  AssetType,
  BoxColliderShape,
  Camera,
  Color,
  Font,
  HitResult,
  Layer,
  MeshRenderer,
  PBRMaterial,
  PointerPhase,
  PointLight,
  PrimitiveMesh,
  Ray,
  Script,
  SphereColliderShape,
  StaticCollider,
  TextRenderer,
  Vector2,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";
import { OrbitControl } from "@galacean/engine-toolkit-controls";

import { LitePhysics } from "@galacean/engine-physics-lite";

class Raycast extends Script {
  camera: Camera;
  originalColor: Color = new Color();
  point = new Vector2();
  ray = new Ray();
  hit = new HitResult();

  onAwake() {
    this.camera = this.entity.getComponent(Camera);
  }

  onUpdate(deltaTime: number) {
    const { engine, ray, hit, originalColor } = this;
    const { inputManager } = engine;
    const { pointers } = inputManager;
    if (!pointers) {
      return;
    }
    for (let i = pointers.length - 1; i >= 0; i--) {
      const pointer = pointers[i];
      this.camera.screenPointToRay(pointer.position, ray);
      const result = engine.physicsManager.raycast(
        ray,
        Number.MAX_VALUE,
        Layer.Everything,
        hit
      );
      if (result) {
        const pickedMeshRenderer = hit.entity.getComponent(MeshRenderer);
        switch (pointer.phase) {
          case PointerPhase.Down:
            const material = <PBRMaterial>pickedMeshRenderer.getMaterial();
            originalColor.copyFrom(material.baseColor);
            material.baseColor = new Color(0.3, 0.3, 0.3, 1);
            break;
          case PointerPhase.Up:
          case PointerPhase.Leave:
            (<PBRMaterial>pickedMeshRenderer.getMaterial()).baseColor =
              originalColor;
            break;
          default:
            break;
        }
      }
    }
  }
}

WebGLEngine.create({ canvas: "canvas", physics: new LitePhysics() }).then(
  (engine) => {
    engine.canvas.resizeByClientSize();
    const scene = engine.sceneManager.activeScene;
    const rootEntity = scene.createRootEntity("root");

    scene.ambientLight.diffuseSolidColor.set(1, 1, 1, 1);
    scene.ambientLight.diffuseIntensity = 1.2;

    // init camera
    const cameraEntity = rootEntity.createChild("camera");
    cameraEntity.addComponent(Camera);
    cameraEntity.transform.setPosition(10, 10, 10);
    cameraEntity.addComponent(OrbitControl);
    cameraEntity.addComponent(Raycast);

    const entity = cameraEntity.createChild("text");
    entity.transform.position = new Vector3(0, 3.5, -10);
    const renderer = entity.addComponent(TextRenderer);
    renderer.color = new Color();
    renderer.text = "Use mouse to click the entity";
    renderer.font = Font.createFromOS(entity.engine, "Arial");
    renderer.fontSize = 40;

    // init point light
    const lightEntity = rootEntity.createChild("light");
    lightEntity.transform.setPosition(0, 3, 0);
    lightEntity.addComponent(PointLight);

    // create sphere test entity
    const radius = 1.25;
    const sphereEntity = rootEntity.createChild("SphereEntity");
    sphereEntity.transform.setPosition(-3, 0, 0);

    const sphereMtl = new PBRMaterial(engine);
    const sphereRenderer = sphereEntity.addComponent(MeshRenderer);
    sphereMtl.baseColor.set(0.7, 0.1, 0.1, 1.0);
    sphereMtl.roughness = 0.5;
    sphereMtl.metallic = 0.0;
    sphereRenderer.mesh = PrimitiveMesh.createSphere(engine, radius);
    sphereRenderer.setMaterial(sphereMtl);

    const sphereCollider = sphereEntity.addComponent(StaticCollider);
    const sphereColliderShape = new SphereColliderShape();
    sphereColliderShape.radius = radius;
    sphereCollider.addShape(sphereColliderShape);

    // create box test entity
    const cubeSize = 2.0;
    const boxEntity = rootEntity.createChild("BoxEntity");

    const boxMtl = new PBRMaterial(engine);
    const boxRenderer = boxEntity.addComponent(MeshRenderer);
    boxMtl.baseColor.set(0.1, 0.7, 0.1, 1.0);
    boxMtl.roughness = 0.5;
    boxMtl.metallic = 0.0;
    boxRenderer.mesh = PrimitiveMesh.createCuboid(
      engine,
      cubeSize,
      cubeSize,
      cubeSize
    );
    boxRenderer.setMaterial(boxMtl);

    const boxCollider = boxEntity.addComponent(StaticCollider);
    const boxColliderShape = new BoxColliderShape();
    boxColliderShape.size.set(cubeSize, cubeSize, cubeSize);
    boxCollider.addShape(boxColliderShape);

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
);
