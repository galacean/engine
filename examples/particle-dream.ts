/**
 * @title Particle Dream
 * @category Particle
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*IFy1Rr_cbacAAAAAAAAAAAAADiR2AQ/original
 */
import {
  AssetType,
  BlendMode,
  BoxShape,
  Camera,
  Color,
  Engine,
  Entity,
  Logger,
  ParticleCurveMode,
  ParticleGradientMode,
  ParticleMaterial,
  ParticleRenderMode,
  ParticleRenderer,
  Texture2D,
  Vector3,
  WebGLEngine
} from "@galacean/engine";

// Create engine
WebGLEngine.create({
  canvas: "canvas"
}).then((engine) => {
  Logger.enable();
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();
  scene.background.solidColor = new Color(15 / 255, 38 / 255, 18 / 255, 1);

  // Create camera
  const cameraEntity = rootEntity.createChild("camera_entity");
  cameraEntity.transform.position = new Vector3(0, 1, 3);
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 60;

  engine.run();

  engine.resourceManager
    .load([
      {
        url: "https://mdn.alipayobjects.com/huamei_b4l2if/afts/img/A*JPsCSK5LtYkAAAAAAAAAAAAADil6AQ/original",
        type: AssetType.Texture2D
      },
      {
        url: "https://mdn.alipayobjects.com/huamei_b4l2if/afts/img/A*eWTFRZPqfDMAAAAAAAAAAAAADil6AQ/original",
        type: AssetType.Texture2D
      },
      {
        url: "https://mdn.alipayobjects.com/huamei_b4l2if/afts/img/A*J8uhRoxJtYgAAAAAAAAAAAAADil6AQ/original",
        type: AssetType.Texture2D
      },
      {
        url: "https://mdn.alipayobjects.com/huamei_b4l2if/afts/img/A*Ea3qRb1yCQMAAAAAAAAAAAAADil6AQ/original",
        type: AssetType.Texture2D
      }
    ])
    .then((textures) => {
      const fireEntity = createDebrisParticle(engine, <Texture2D>textures[0]);
      createGlowParticle(fireEntity, <Texture2D>textures[1]);
      createSparksParticle(fireEntity, <Texture2D>textures[2]);
      createHighlightsParticle(fireEntity, <Texture2D>textures[3]);

      cameraEntity.addChild(fireEntity);
    });
});

function createDebrisParticle(engine: Engine, texture: Texture2D): Entity {
  const particleEntity = new Entity(engine, "Debris");
  particleEntity.transform.position.set(0, -7.5, -8);

  const particleRenderer = particleEntity.addComponent(ParticleRenderer);

  const material = new ParticleMaterial(engine);
  material.baseColor = new Color(1.0, 1.0, 1.0, 1.0);
  material.blendMode = BlendMode.Additive;
  material.baseTexture = texture;
  particleRenderer.setMaterial(material);
  particleRenderer.priority = 2;

  const { main, emission, sizeOverLifetime, colorOverLifetime, velocityOverLifetime } = particleRenderer.generator;

  // Main module
  main.startSpeed.constant = 0;

  main.startSize.constantMin = 0.1;
  main.startSize.constantMax = 1;
  main.startSize.mode = ParticleCurveMode.TwoConstants;

  main.startRotationZ.constantMin = 0;
  main.startRotationZ.constantMax = 360;
  main.startRotationZ.mode = ParticleCurveMode.TwoConstants;

  main.startColor.constantMin.set(255 / 255, 255 / 255, 255 / 255, 1.0);
  main.startColor.constantMax.set(13 / 255, 255 / 255, 0 / 255, 1.0);
  main.startColor.mode = ParticleGradientMode.TwoConstants;

  // Emission module
  emission.rateOverTime.constant = 5;

  const boxShape = new BoxShape();
  boxShape.size.set(22, 1, 0);
  emission.shape = boxShape;

  // Color over lifetime module
  colorOverLifetime.enabled = true;
  colorOverLifetime.color.mode = ParticleGradientMode.Gradient;

  const gradient = colorOverLifetime.color.gradient;
  gradient.alphaKeys[0].alpha = 0;
  gradient.alphaKeys[1].alpha = 0;
  gradient.addAlphaKey(0.2, 1.0);
  gradient.addAlphaKey(0.8, 1.0);

  // Size over lifetime module
  sizeOverLifetime.enabled = true;
  const keys = sizeOverLifetime.size.curve.keys;
  keys[0].value = 1;
  keys[1].value = 0;

  // Velocity over lifetime module
  velocityOverLifetime.enabled = true;
  velocityOverLifetime.velocityX.constantMin = 2;
  velocityOverLifetime.velocityX.constantMax = 1;
  velocityOverLifetime.velocityX.mode = ParticleCurveMode.TwoConstants;

  velocityOverLifetime.velocityY.constantMin = 4;
  velocityOverLifetime.velocityY.constantMax = 2;
  velocityOverLifetime.velocityY.mode = ParticleCurveMode.TwoConstants;

  velocityOverLifetime.velocityZ.constantMin = 0;
  velocityOverLifetime.velocityZ.constantMax = 0;
  velocityOverLifetime.velocityZ.mode = ParticleCurveMode.TwoConstants;

  return particleEntity;
}

function createGlowParticle(fireEntity: Entity, texture: Texture2D): void {
  const particleEntity = fireEntity.createChild("Glow");
  particleEntity.transform.position.set(-1.88, 0, 0);

  const particleRenderer = particleEntity.addComponent(ParticleRenderer);
  particleRenderer.renderMode = ParticleRenderMode.StretchBillboard;
  particleRenderer.lengthScale = 2;

  const material = new ParticleMaterial(fireEntity.engine);
  material.blendMode = BlendMode.Additive;
  material.baseTexture = texture;
  particleRenderer.setMaterial(material);
  particleRenderer.priority = 1;

  const generator = particleRenderer.generator;
  const { main, emission, velocityOverLifetime, colorOverLifetime } = generator;

  // Main module
  main.startSpeed.constant = 0.0;

  main.startSize.constantMin = 5;
  main.startSize.constantMax = 9;
  main.startSize.mode = ParticleCurveMode.TwoConstants;

  main.startRotationZ.constantMin = 0;
  main.startRotationZ.constantMax = 360;
  main.startRotationZ.mode = ParticleCurveMode.TwoConstants;

  main.startColor.constantMin = new Color(0 / 255, 157 / 255, 255 / 255, 64 / 255);
  main.startColor.constantMax = new Color(13 / 255, 255 / 255, 0 / 255, 128 / 255);
  main.startColor.mode = ParticleGradientMode.TwoConstants;

  // Emission module
  emission.rateOverTime.constant = 10;

  const boxShape = new BoxShape();
  boxShape.size.set(22, 1, 0);
  emission.shape = boxShape;

  // Velocity over lifetime module
  velocityOverLifetime.enabled = true;
  velocityOverLifetime.velocityX.constantMin = 2;
  velocityOverLifetime.velocityX.constantMax = 1;
  velocityOverLifetime.velocityX.mode = ParticleCurveMode.TwoConstants;

  velocityOverLifetime.velocityY.constantMin = 4;
  velocityOverLifetime.velocityY.constantMax = 2;
  velocityOverLifetime.velocityY.mode = ParticleCurveMode.TwoConstants;

  velocityOverLifetime.velocityZ.constantMin = 0;
  velocityOverLifetime.velocityZ.constantMax = 0;
  velocityOverLifetime.velocityZ.mode = ParticleCurveMode.TwoConstants;

  // Color over lifetime module
  colorOverLifetime.enabled = true;
  colorOverLifetime.color.mode = ParticleGradientMode.Gradient;

  const gradient = colorOverLifetime.color.gradient;
  gradient.alphaKeys[0].alpha = 0;
  gradient.alphaKeys[1].alpha = 0;
  gradient.addAlphaKey(0.2, 1.0);
}

function createSparksParticle(fireEntity: Entity, texture: Texture2D): void {
  const particleEntity = fireEntity.createChild("Sparks");
  particleEntity.transform.position.set(-1.54, 0, 0);

  const particleRenderer = particleEntity.addComponent(ParticleRenderer);

  const material = new ParticleMaterial(fireEntity.engine);
  material.baseTexture = texture;
  particleRenderer.setMaterial(material);
  particleRenderer.priority = 0;

  const { main, emission, colorOverLifetime, velocityOverLifetime } = particleRenderer.generator;

  // Main module
  main.startLifetime.constant = 5;
  main.startSpeed.constant = 0;

  main.startSize.constantMin = 0.05;
  main.startSize.constantMax = 0.2;
  main.startSize.mode = ParticleCurveMode.TwoConstants;

  main.startRotationZ.constantMin = 0;
  main.startRotationZ.constantMax = 360;
  main.startRotationZ.mode = ParticleCurveMode.TwoConstants;

  main.startColor.constant = new Color(37 / 255, 133 / 255, 255 / 255, 255 / 255);

  // Emission module
  emission.rateOverTime.constant = 30;

  const boxShape = new BoxShape();
  boxShape.size.set(22, 1, 0);
  emission.shape = boxShape;

  // Velocity over lifetime module
  velocityOverLifetime.enabled = true;
  velocityOverLifetime.velocityX.constantMin = 2;
  velocityOverLifetime.velocityX.constantMax = 1;
  velocityOverLifetime.velocityX.mode = ParticleCurveMode.TwoConstants;

  velocityOverLifetime.velocityY.constantMin = 4;
  velocityOverLifetime.velocityY.constantMax = 2;
  velocityOverLifetime.velocityY.mode = ParticleCurveMode.TwoConstants;

  velocityOverLifetime.velocityZ.constantMin = 0;
  velocityOverLifetime.velocityZ.constantMax = 0;
  velocityOverLifetime.velocityZ.mode = ParticleCurveMode.TwoConstants;

  // Color over lifetime module
  colorOverLifetime.enabled = true;
  colorOverLifetime.color.mode = ParticleGradientMode.Gradient;

  const gradient = colorOverLifetime.color.gradient;
  gradient.alphaKeys[0].alpha = 0;
  gradient.alphaKeys[1].alpha = 0;
  gradient.addAlphaKey(0.2, 1.0);
  gradient.addAlphaKey(0.8, 1.0);
}

function createHighlightsParticle(fireEntity: Entity, texture: Texture2D): void {
  const particleEntity = fireEntity.createChild("Highlights");
  particleEntity.transform.position.set(-5.31, 0, 0);

  const particleRenderer = particleEntity.addComponent(ParticleRenderer);

  const material = new ParticleMaterial(fireEntity.engine);
  material.blendMode = BlendMode.Additive;
  material.baseTexture = texture;
  particleRenderer.setMaterial(material);
  particleRenderer.priority = 3;

  const generator = particleRenderer.generator;
  const { main, emission, sizeOverLifetime, colorOverLifetime, velocityOverLifetime } = generator;

  // Main module
  main.startSpeed.constant = 0;

  main.startSize.constantMin = 0.1;
  main.startSize.constantMax = 7;
  main.startSize.mode = ParticleCurveMode.TwoConstants;

  main.startRotationZ.constantMin = 0;
  main.startRotationZ.constantMax = 360;
  main.startRotationZ.mode = ParticleCurveMode.TwoConstants;

  main.startColor.constantMin.set(105 / 255, 198 / 255, 255 / 255, 64 / 255);
  main.startColor.constantMax.set(13 / 255, 255 / 255, 0 / 255, 32 / 255);
  main.startColor.mode = ParticleGradientMode.TwoConstants;

  // Emission module
  emission.rateOverTime.constant = 40;

  const boxShape = new BoxShape();
  boxShape.size.set(22, 1, 0);
  emission.shape = boxShape;

  // Velocity over lifetime module
  velocityOverLifetime.enabled = true;
  velocityOverLifetime.velocityX.constantMin = 3;
  velocityOverLifetime.velocityX.constantMax = 2;
  velocityOverLifetime.velocityX.mode = ParticleCurveMode.TwoConstants;

  velocityOverLifetime.velocityY.constantMin = 4;
  velocityOverLifetime.velocityY.constantMax = 2;
  velocityOverLifetime.velocityY.mode = ParticleCurveMode.TwoConstants;

  velocityOverLifetime.velocityZ.constantMin = 0;
  velocityOverLifetime.velocityZ.constantMax = 0;
  velocityOverLifetime.velocityZ.mode = ParticleCurveMode.TwoConstants;

  // Color over lifetime module
  colorOverLifetime.enabled = true;
  colorOverLifetime.color.mode = ParticleGradientMode.Gradient;

  const gradient = colorOverLifetime.color.gradient;
  gradient.alphaKeys[0].alpha = 0;
  gradient.alphaKeys[1].alpha = 0;
  gradient.addAlphaKey(0.2, 1.0);
  gradient.addAlphaKey(0.8, 1.0);

  // Size over lifetime module
  sizeOverLifetime.enabled = true;
  const curve = sizeOverLifetime.size.curve;
  sizeOverLifetime.size.mode = ParticleCurveMode.Curve;
  curve.keys[0].value = 1;
  curve.keys[1].value = 0;
}
