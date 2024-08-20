/**
 * @title Particle TextureSheetAnimation
 * @category Particle
 */
import {
  AssetType,
  BlendMode,
  Camera,
  Color,
  ConeShape,
  Logger,
  ParticleCurveMode,
  ParticleMaterial,
  ParticleRenderer,
  Vector3,
  WebGLEngine,
  Vector2,
  CurveKey
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

// Create engine
WebGLEngine.create({
  canvas: "canvas"
}).then((engine) => {
  Logger.enable();
  engine.canvas.resizeByClientSize();
  const scene = engine.sceneManager.activeScene;

  const ambientLight = scene.ambientLight;
  ambientLight.diffuseSolidColor.set(0.8, 0.8, 1, 1);
  ambientLight.diffuseIntensity = 0.5;

  const rootEntity = scene.createRootEntity();
  scene.background.solidColor = new Color(25 / 255, 25 / 255, 112 / 255, 1);

  // Create camera
  const cameraEntity = rootEntity.createChild("camera_entity");
  cameraEntity.transform.position = new Vector3(0, 10, 30);
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 60;

  engine.run();

  engine.resourceManager
    .load({
      url: "https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*5EyLSqmA7q0AAAAAAAAAAAAADtKFAQ/original",
      type: AssetType.Texture2D
    })
    .then((texture) => {
      const particleEntity = rootEntity.createChild("Fire");

      const particleRenderer = particleEntity.addComponent(ParticleRenderer);

      const material = new ParticleMaterial(engine);
      material.baseColor = new Color(1.0, 1.0, 1.0, 1.0);
      material.blendMode = BlendMode.Additive;
      material.baseTexture = texture;
      particleRenderer.setMaterial(material);

      particleRenderer.generator.emission.shape = new ConeShape();

      const { textureSheetAnimation } = particleRenderer.generator;
      textureSheetAnimation.tiling = new Vector2(5, 3);

      textureSheetAnimation.frameOverTime.mode = ParticleCurveMode.TwoConstants;
      textureSheetAnimation.frameOverTime.curveMax.setKeys([new CurveKey(0, 0), new CurveKey(1, 12 / 15)]);

      textureSheetAnimation.frameOverTime.constantMin = 0;
      textureSheetAnimation.frameOverTime.constantMax = 3 / 15;

      textureSheetAnimation.enabled = true;

      updateForE2E(engine, 500);
      initScreenshot(engine, camera);
    });
});
