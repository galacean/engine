/**
 * @title GPU Instancing Auto Batch
 * @category Mesh
 */
import {
  AmbientLight,
  AssetType,
  Camera,
  Color,
  DirectLight,
  GLTFResource,
  Logger,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

Logger.enable();
WebGLEngine.create({ canvas: "canvas" }).then(async (engine) => {
  engine.canvas.setAutoResolution(2);

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity("Root");

  // Camera
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.setPosition(0, 10, 80);
  cameraEntity.transform.lookAt(new Vector3(0, 0, 0));
  const camera = cameraEntity.addComponent(Camera);
  camera.farClipPlane = 300;

  // Light
  const lightEntity = rootEntity.createChild("Light");
  lightEntity.transform.setRotation(-45, -45, 0);
  lightEntity.addComponent(DirectLight).color = new Color(1, 1, 1, 1);

  // Load Duck model and ambient light
  const [glTF, ambientLight] = await Promise.all([
    engine.resourceManager.load<GLTFResource>({
      url: "https://gw.alipayobjects.com/os/bmw-prod/6cb8f543-285c-491a-8cfd-57a1160dc9ab.glb",
      type: AssetType.GLTF
    }),
    engine.resourceManager.load<AmbientLight>({
      url: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*eRJ8QKzf5zAAAAAAgBAAAAgAekp5AQ/ambient.ambLight",
      type: AssetType.AmbientLight
    })
  ]);
  scene.ambientLight = ambientLight;

  // Clone ducks with fixed seed positions for deterministic output
  const count = 500;
  const spread = 50;
  for (let i = 0; i < count; i++) {
    const duck = glTF.instantiateSceneRoot();
    // Use deterministic positions based on index
    const t = i / count;
    duck.transform.setPosition(
      Math.sin(t * 137.5) * spread * 0.5,
      Math.cos(t * 97.3) * spread * 0.5,
      Math.sin(t * 59.1) * spread * 0.5
    );
    duck.transform.setRotation(t * 360, t * 720, t * 1080);
    rootEntity.addChild(duck);
  }

  updateForE2E(engine);
  initScreenshot(engine, camera);
});
