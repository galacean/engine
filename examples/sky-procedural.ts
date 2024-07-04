/**
 * @title Procedural Sky
 * @category Sky
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*Zb3FRYQi9sIAAAAAAAAAAAAADiR2AQ/original
 */
import * as dat from "dat.gui";
import {
  BackgroundMode,
  Camera,
  DirectLight,
  Entity,
  Logger,
  PrimitiveMesh,
  SkyProceduralMaterial,
  SunMode,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";

Logger.enable();
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();
  const cameraEntity = rootEntity.createChild("camera");
  cameraEntity.addComponent(Camera).fieldOfView = 60;
  cameraEntity.transform.setPosition(0, 0, 10);

  scene.ambientLight.diffuseSolidColor.set(1, 1, 1, 1);

  // Create sky
  const background = scene.background;
  background.mode = BackgroundMode.Sky;

  const sky = background.sky;
  const skyMaterial = new SkyProceduralMaterial(engine);
  sky.material = skyMaterial;
  sky.mesh = PrimitiveMesh.createSphere(engine, 1, 64);

  // Create light
  const lightEntity = rootEntity.createChild("light");
  lightEntity.transform.setPosition(0, 0.5, -1.0);
  lightEntity.transform.lookAt(new Vector3(0, 0, 0));

  lightEntity.addComponent(DirectLight);

  engine.run();

  // Add debug GUI
  addDebugGUI(lightEntity, skyMaterial);
});

function addDebugGUI(
  lightEntity: Entity,
  skyMaterial: SkyProceduralMaterial
): void {
  const gui = new dat.GUI({ width: 360 });
  const skyTint = skyMaterial.skyTint;
  const groundTint = skyMaterial.groundTint;
  const debugInfos = {
    "light rotation": lightEntity.transform.rotation.x,
    "sun mode": skyMaterial.sunMode,
    "sun size": skyMaterial.sunSize,
    "sun size convergence": skyMaterial.sunSizeConvergence,
    "sky tint": [skyTint.r * 255, skyTint.g * 255, skyTint.b * 255],
    "ground tint": [groundTint.r * 255, groundTint.g * 255, groundTint.b * 255],
    "atmosphere thickness": skyMaterial.atmosphereThickness,
    exposure: skyMaterial.exposure,
  };

  gui
    .add(debugInfos, "sun mode", {
      None: SunMode.None,
      Simple: SunMode.Simple,
      HighQuality: SunMode.HighQuality,
    })
    .onChange((v) => {
      const sunMode = parseInt(v);
      skyMaterial.sunMode = sunMode;
    });

  gui.add(debugInfos, "sun size", 0, 1).onChange((v) => {
    skyMaterial.sunSize = v;
  });

  gui.add(debugInfos, "sun size convergence", 0, 20).onChange((v) => {
    skyMaterial.sunSizeConvergence = v;
  });

  gui.add(debugInfos, "light rotation", -180, 180).onChange((v) => {
    lightEntity.transform.rotation.x = v;
  });

  gui.addColor(debugInfos, "sky tint").onChange((v) => {
    skyMaterial.skyTint.set(v[0] / 255, v[1] / 255, v[2] / 255, 1.0);
  });

  gui.addColor(debugInfos, "ground tint").onChange((v) => {
    skyMaterial.groundTint.set(v[0] / 255, v[1] / 255, v[2] / 255, 1.0);
  });

  gui.add(debugInfos, "atmosphere thickness", 0, 5).onChange((v) => {
    skyMaterial.atmosphereThickness = v;
  });

  gui.add(debugInfos, "exposure", 0, 8).onChange((v) => {
    skyMaterial.exposure = v;
  });
}
