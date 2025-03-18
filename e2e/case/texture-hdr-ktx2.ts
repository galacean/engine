/**
 * @title HDR KTX2
 * @category Texture
 */
import {
  Camera,
  DirectLight,
  Logger,
  MeshRenderer,
  PrimitiveMesh,
  Texture2D,
  UnlitMaterial,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { OrbitControl } from "@galacean/engine-toolkit";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

Logger.enable();

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize(2);
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // camera
  const cameraEntity = rootEntity.createChild("camera_node");
  cameraEntity.transform.position = new Vector3(0, 1, 5);
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.addComponent(OrbitControl).target = new Vector3(0, 0, 0);

  const lightNode = rootEntity.createChild("light_node");
  lightNode.addComponent(DirectLight).intensity = 0.6;
  lightNode.transform.lookAt(new Vector3(0, 0, 1));
  lightNode.transform.rotate(new Vector3(0, 90, 0));

  const planeEntity = rootEntity.createChild("plane");
  const meshRenderer = planeEntity.addComponent(MeshRenderer);
  meshRenderer.mesh = PrimitiveMesh.createCuboid(engine);
  const mtl = new UnlitMaterial(engine);
  meshRenderer.setMaterial(mtl);

  engine.resourceManager.load<Texture2D>("/autumn_field_puresky_1k.ktx2").then((tex) => {
    mtl.baseTexture = tex;
    updateForE2E(engine);

    initScreenshot(engine, camera);
  });
});
