/**
 * @title Particle TextureSheetAnimation
 * @category Particle
 */
import {
  AssetType,
  BlendMode,
  Camera,
  Color,
  Logger,
  ParticleCurveMode,
  ParticleMaterial,
  ParticleRenderer,
  Vector3,
  WebGLEngine,
  Vector2,
  BoxShape,
  Entity
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
      type: AssetType.Texture2D,
      params: {
        isSRGBColorSpace: true
      }
    })
    .then((texture) => {
      const particleEntity = new Entity(engine);
      const particleRenderer = particleEntity.addComponent(ParticleRenderer);

      const material = new ParticleMaterial(engine);
      material.baseColor = new Color(1.0, 1.0, 1.0, 1.0);
      material.blendMode = BlendMode.Additive;
      material.baseTexture = texture;
      particleRenderer.setMaterial(material);

      particleRenderer.generator.useAutoRandomSeed = false;

      const shape = new BoxShape();
      shape.size.set(22, 1, 0);
      particleRenderer.generator.emission.shape = shape;

      const { textureSheetAnimation } = particleRenderer.generator;
      textureSheetAnimation.enabled = true;
      textureSheetAnimation.tiling = new Vector2(5, 3);

      textureSheetAnimation.frameOverTime.mode = ParticleCurveMode.TwoConstants;
      textureSheetAnimation.frameOverTime.constantMin = 0;
      textureSheetAnimation.frameOverTime.constantMax = 3 / 15;

      cameraEntity.addChild(particleEntity);

      updateForE2E(engine, 500);
      initScreenshot(engine, camera);
    });
});
