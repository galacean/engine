/**
 * @title Multi scene no clear
 * @category Advance
 */
import {
  BlinnPhongMaterial,
  Camera,
  CameraClearFlags,
  Color,
  Engine,
  Logger,
  MeshRenderer,
  PrimitiveMesh,
  Scene,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

Logger.enable();
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const firstCamera = initFirstScene(engine);
  const secondCamera = initSecondScene(engine);

  updateForE2E(engine);
  initScreenshot(engine, [firstCamera, secondCamera]);
  // initScreenshot(engine, [secondCamera, firstCamera]);
});

function initFirstScene(engine: Engine): Camera {
  const scene = engine.sceneManager.scenes[0];
  const rootEntity = scene.createRootEntity();

  // Create full screen camera
  const cameraEntity = rootEntity.createChild("fullscreen-camera");
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.transform.setPosition(0, 0, 20);

  // Create cube
  const cubeEntity = rootEntity.createChild("cube");
  cubeEntity.transform.setPosition(-2, 0, 3);
  const renderer = cubeEntity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 2);
  const material = new BlinnPhongMaterial(engine);
  material.baseColor = new Color(1, 0, 0, 1);
  renderer.setMaterial(material);

  return camera;
}

function initSecondScene(engine: Engine): Camera {
  // Init window camera
  const scene = new Scene(engine);
  engine.sceneManager.addScene(scene);
  const rootEntity = scene.createRootEntity();

  const cameraEntity = rootEntity.createChild("window-camera");
  const camera = cameraEntity.addComponent(Camera);
  camera.enablePostProcess = true;
  camera.clearFlags = CameraClearFlags.None;

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
  cubeEntity.transform.setPosition(2, 0, 3);
  const renderer = cubeEntity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 2);
  const material = new BlinnPhongMaterial(engine);
  material.baseColor = new Color(1, 0, 0, 1);
  material.emissiveColor.set(1, 0, 0, 1);
  renderer.setMaterial(material);

  return camera;
}
