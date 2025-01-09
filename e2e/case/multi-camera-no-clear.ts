/**
 * @title Multi camera no clear
 * @category Advance
 */
import {
  BlinnPhongMaterial,
  BloomEffect,
  Camera,
  CameraClearFlags,
  Color,
  Engine,
  Layer,
  Logger,
  MeshRenderer,
  PostProcess,
  PrimitiveMesh,
  Scene,
  TonemappingEffect,
  WebGLEngine,
  WebGLMode
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

Logger.enable();
WebGLEngine.create({
  canvas: "canvas",
  graphicDeviceOptions: {
    webGLMode: WebGLMode.WebGL2,
    antialias: false
  }
}).then((engine) => {
  engine.canvas.resizeByClientSize();

  initFirstScene(engine);
  engine.run();
});

function initFirstScene(engine: Engine): Scene {
  const scene = engine.sceneManager.scenes[0];
  const rootEntity = scene.createRootEntity();

  // const renderColorTexture = new Texture2D(engine, 1024, 1024);
  // const depthTexture = new Texture2D(engine, 1024, 1024, TextureFormat.Depth24Stencil8, false);
  // const renderTarget = new RenderTarget(engine, 1024, 1024, renderColorTexture, TextureFormat.Depth);
  // const renderTarget = new RenderTarget(engine, 1024, 1024, renderColorTexture, depthTexture);

  // Create full screen camera
  const cameraEntity = rootEntity.createChild("fullscreen-camera");
  const camera = cameraEntity.addComponent(Camera);
  // camera.renderTarget = renderTarget;
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
    // camera2.renderTarget = renderTarget;
    camera2.cullingMask = Layer.Layer1;
    camera2.enablePostProcess = true;
    camera2.enableHDR = true;
    camera2.clearFlags = CameraClearFlags.None;
    camera2.msaaSamples = 1;

    const globalPostProcessEntity = scene.createRootEntity();
    const postProcess = globalPostProcessEntity.addComponent(PostProcess);
    const bloomEffect = postProcess.addEffect(BloomEffect);
    postProcess.addEffect(TonemappingEffect);

    bloomEffect.threshold.value = 0.1;
    bloomEffect.intensity.value = 2;
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
