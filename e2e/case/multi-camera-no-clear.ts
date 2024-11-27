/**
 * @title Multi camera no clear
 * @category Advance
 */
import {
  BlinnPhongMaterial,
  Camera,
  CameraClearFlags,
  Color,
  Engine,
  Layer,
  Logger,
  MeshRenderer,
  PrimitiveMesh,
  Scene,
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

  initFirstScene(engine);
  engine.run();
});

function initFirstScene(engine: Engine): Scene {
  const scene = engine.sceneManager.scenes[0];
  const rootEntity = scene.createRootEntity();

  // Create full screen camera
  const cameraEntity = rootEntity.createChild("fullscreen-camera");
  const camera = cameraEntity.addComponent(Camera);
  camera.cullingMask = Layer.Layer0;
  cameraEntity.transform.setPosition(0, 0, 20);

  // Create cube
  const cubeEntity = rootEntity.createChild("cube");
  cubeEntity.transform.setPosition(-3, 0, 3);
  const renderer = cubeEntity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createSphere(engine, 2, 24);
  const material = new BlinnPhongMaterial(engine);
  material.baseColor = new Color(1, 0, 0, 1);
  renderer.setMaterial(material);

  {
    const cameraEntity = rootEntity.createChild("window-camera");
    const camera2 = cameraEntity.addComponent(Camera);
    camera2.cullingMask = Layer.Layer1;
    camera2.enablePostProcess = true;
    camera2.enableHDR = true;
    camera2.clearFlags = CameraClearFlags.None;
    // camera.msaaSamples = 4;

    // @ts-ignore
    const bloomEffect = scene._postProcessManager._bloomEffect;
    // @ts-ignore
    const tonemappingEffect = scene._postProcessManager._tonemappingEffect;

    bloomEffect.enabled = true;
    tonemappingEffect.enabled = true;
    bloomEffect.threshold = 0.1;
    bloomEffect.intensity = 2;
    cameraEntity.transform.setPosition(0, 0, 20);

    // Create cube
    const cubeEntity = rootEntity.createChild("cube");
    cubeEntity.layer = Layer.Layer1;
    cubeEntity.transform.setPosition(-2, 0, 3);
    const renderer = cubeEntity.addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createSphere(engine, 2, 24);
    const material = new BlinnPhongMaterial(engine);
    material.baseColor = new Color(1, 0, 0, 1);
    material.emissiveColor.set(1, 0, 0, 1);
    renderer.setMaterial(material);

    updateForE2E(engine);
    initScreenshot(engine, [camera, camera2]);
  }

  return scene;
}
