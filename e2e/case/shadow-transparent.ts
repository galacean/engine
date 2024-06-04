/**
 * @title Shadow Transparent
 * @category Shadow
 */

import {
  Camera,
  DirectLight,
  GLTFResource,
  Logger,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  ShadowResolution,
  ShadowType,
  Vector3,
  WebGLEngine,
  WebGLMode
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";
Logger.enable();

WebGLEngine.create({
  canvas: "canvas",
  graphicDeviceOptions: {
    webGLMode: WebGLMode.WebGL2
  }
}).then((engine) => {
  engine.canvas.resizeByClientSize();
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();
  scene.shadowResolution = ShadowResolution.Medium;
  scene.shadowDistance = 10;
  const cameraEntity = rootEntity.createChild("camera_node");
  cameraEntity.transform.setPosition(0, 2, 3);
  cameraEntity.transform.lookAt(new Vector3(0));
  const camera = cameraEntity.addComponent(Camera);
  const lightEntity = rootEntity.createChild("light_node");
  const light = lightEntity.addComponent(DirectLight);
  lightEntity.transform.setPosition(-6, 10, 0);
  lightEntity.transform.lookAt(new Vector3(0, 0, -10));
  light.shadowType = ShadowType.Hard;

  const planeEntity = rootEntity.createChild("plane_node");
  const renderer = planeEntity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createPlane(engine, 10, 10);
  const planeMaterial = new PBRMaterial(engine);
  renderer.setMaterial(planeMaterial);

  engine.resourceManager
    .load<GLTFResource>("https://mdn.alipayobjects.com/oasis_be/afts/file/A*kgYIRo36270AAAAAAAAAAAAADkp5AQ/bottle.glb")
    .then((asset) => {
      const defaultSceneRoot = asset.instantiateSceneRoot();
      rootEntity.addChild(defaultSceneRoot);
      defaultSceneRoot.transform.scale.set(0.05, 0.05, 0.05);
      scene.enableTransparentShadow = true;

      updateForE2E(engine, 500);
      initScreenshot(engine, camera);
    });
});
