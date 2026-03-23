/**
 * @title Particle Horizontal Billboard
 * @category Particle
 */
import {
  AssetType,
  Camera,
  Color,
  Logger,
  ParticleMaterial,
  ParticleRenderer,
  ParticleRenderMode,
  Texture2D,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

WebGLEngine.create({
  canvas: "canvas"
}).then((engine) => {
  Logger.enable();
  engine.canvas.resizeByClientSize();

  const rootEntity = engine.sceneManager.activeScene.createRootEntity("Root");

  // Create camera
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.position = new Vector3(0, 0.9, 1.5);
  cameraEntity.transform.rotation = new Vector3(-15, 0, 0);
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 60;
  camera.nearClipPlane = 0.3;
  camera.farClipPlane = 1000;

  engine.resourceManager
    .load([
      {
        url: "https://mdn.alipayobjects.com/huamei_9ahbho/afts/img/A*QJvmQ6g4ujYAAAAAgCAAAAgAegDwAQ/original",
        type: AssetType.Texture2D
      }
    ])
    .then((resources) => {
      const particleEntity = rootEntity.createChild("Particle");
      const particleRenderer = particleEntity.addComponent(ParticleRenderer);

      // Material
      const material = new ParticleMaterial(engine);
      material.baseColor = new Color(1.0, 1.0, 1.0, 1.0);
      material.baseTexture = <Texture2D>resources[0];
      particleRenderer.setMaterial(material);

      // Render mode
      particleRenderer.renderMode = ParticleRenderMode.HorizontalBillboard;

      const generator = particleRenderer.generator;
      generator.useAutoRandomSeed = false;
      const { main, emission, rotationOverLifetime } = generator;

      // Main module
      main.duration = 5;
      main.isLoop = true;
      main.startDelay.constant = 0;
      main.startLifetime.constant = 5;
      main.startSpeed.constant = 1;
      main.startSize.constant = 1;
      main.startRotationZ.constant = -90;
      main.startColor.constant = new Color(1.0, 1.0, 1.0, 1.0);
      main.gravityModifier.constant = 0;
      main.maxParticles = 1000;

      // Emission module
      emission.rateOverTime.constant = 10;

      // Rotation over lifetime module
      rotationOverLifetime.enabled = true;
      rotationOverLifetime.rotationZ.constant = 45;

      updateForE2E(engine, 300);
      initScreenshot(engine, camera);
    });
});
