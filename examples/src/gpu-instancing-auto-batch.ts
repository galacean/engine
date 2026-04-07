/**
 * @title GPU Instancing Auto Batch
 * @category Mesh
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*jjZMTrp-vU8AAAAAAAAAAAAADiR2AQ/original
 */
import { OrbitControl } from "@galacean/engine-toolkit";
import {
  BlinnPhongMaterial,
  Camera,
  Color,
  DirectLight,
  Logger,
  MeshRenderer,
  PrimitiveMesh,
  Vector3,
  WebGLEngine
} from "@galacean/engine";

Logger.enable();
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity("Root");

  // Camera
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.setPosition(0, 10, 80);
  cameraEntity.transform.lookAt(new Vector3(0, 0, 0));
  const camera = cameraEntity.addComponent(Camera);
  camera.farClipPlane = 300;
  cameraEntity.addComponent(OrbitControl);

  // Light
  const lightEntity = rootEntity.createChild("Light");
  lightEntity.transform.setRotation(-45, -45, 0);
  lightEntity.addComponent(DirectLight).color = new Color(1, 1, 1, 1);

  // Shared mesh and material — all renderers use the same instances to enable auto-batching
  const mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
  const material = new BlinnPhongMaterial(engine);
  material.baseColor = new Color(0.6, 0.75, 1.0, 1.0);

  // Create 1000 cubes with random positions
  const count = 1000;
  const spread = 50;
  for (let i = 0; i < count; i++) {
    const entity = rootEntity.createChild("Cube" + i);
    entity.transform.setPosition(
      (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * spread
    );
    entity.transform.setRotation(Math.random() * 360, Math.random() * 360, Math.random() * 360);

    const renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.setMaterial(material);
  }

  engine.run();
});
