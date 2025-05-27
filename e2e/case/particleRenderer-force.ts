/**
 * @title Particle Dream
 * @category Particle
 */
import {
  AssetType,
  BlendMode,
  BoxShape,
  Camera,
  Color,
  CurveKey,
  Engine,
  Entity,
  Logger,
  ParticleCurve,
  ParticleCurveMode,
  ParticleGradientMode,
  ParticleMaterial,
  ParticleRenderMode,
  ParticleRenderer,
  Scene,
  Texture2D,
  Vector3,
  WebGLEngine,
  WebGLMode
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

// Create engine
WebGLEngine.create({
  canvas: "canvas"
}).then((engine) => {
  Logger.enable();
  engine.canvas.resizeByClientSize();

  const leftScene = engine.sceneManager.activeScene;
  const leftRootEntity = leftScene.createRootEntity();
  leftScene.background.solidColor = new Color(0.004776953480693729, 0.019382360956935723, 0.006048833022857054, 1);

  const rightScene = new Scene(engine);
  engine.sceneManager.addScene(rightScene);
  const rightRootEntity = rightScene.createRootEntity();
  rightScene.background.solidColor = new Color(0.004776953480693729, 0.019382360956935723, 0.006048833022857054, 1);

  // Create camera
  const leftCameraEntity = leftRootEntity.createChild("left-camera");
  leftCameraEntity.transform.position = new Vector3(0, 1, 3);
  const leftCamera = leftCameraEntity.addComponent(Camera);
  leftCamera.viewport.set(0, 0, 0.5, 1);
  leftCamera.fieldOfView = 60;

  const rightCameraEntity = rightRootEntity.createChild("right-camera");
  const rightCamera = rightCameraEntity.addComponent(Camera);
  rightCamera.viewport.set(0.5, 0, 0.5, 1);
  rightCamera.fieldOfView = 60;
  rightCameraEntity.transform.setPosition(10, 10, 20);
  rightCameraEntity.transform.lookAt(new Vector3(0, 0, 0));

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
      const leftFireEntity = createDebrisParticle(engine, <Texture2D>textures[0]);
      createGlowParticle(leftFireEntity, <Texture2D>textures[1]);
      createSparksParticle(leftFireEntity, <Texture2D>textures[2]);
      createHighlightsParticle(leftFireEntity, <Texture2D>textures[3]);
      leftCameraEntity.addChild(leftFireEntity);

      const rightFireEntity = createDebrisParticle(engine, <Texture2D>textures[0], true, 2);
      createGlowParticle(rightFireEntity, <Texture2D>textures[1], true, 3);
      createSparksParticle(rightFireEntity, <Texture2D>textures[2], true, 4);
      createHighlightsParticle(rightFireEntity, <Texture2D>textures[3], true, 5);
      rightCameraEntity.addChild(rightFireEntity);

      updateForE2E(engine, 500);
      initScreenshot(engine, [leftCamera, rightCamera]);
    });
});

function createDebrisParticle(
  engine: Engine,
  texture: Texture2D,
  stretch: boolean = false,
  lengthScale: number = 2
): Entity {
  const particleEntity = new Entity(engine, "Debris");
  particleEntity.transform.position.set(0, -7.5, -8);

  const particleRenderer = particleEntity.addComponent(ParticleRenderer);
  if (stretch) {
    particleRenderer.renderMode = ParticleRenderMode.StretchBillboard;
    particleRenderer.lengthScale = lengthScale;
  }

  const material = new ParticleMaterial(engine);
  material.baseColor = new Color(1.0, 1.0, 1.0, 1.0);
  material.blendMode = BlendMode.Additive;
  material.baseTexture = texture;
  particleRenderer.setMaterial(material);
  particleRenderer.priority = 2;

  particleRenderer.generator.useAutoRandomSeed = false;

  const { main, emission, sizeOverLifetime, colorOverLifetime, velocityOverLifetime, forceOverLifetime } =
    particleRenderer.generator;

  // Main module
  main.startSpeed.constant = 0;

  main.startSize.constantMin = 0.1;
  main.startSize.constantMax = 1;
  main.startSize.mode = ParticleCurveMode.TwoConstants;

  main.startRotationZ.constantMin = 0;
  main.startRotationZ.constantMax = 360;
  main.startRotationZ.mode = ParticleCurveMode.TwoConstants;

  main.startColor.constantMin.set(1.0, 1.0, 1.0, 1.0);
  main.startColor.constantMax.set(0.004024717018496307, 1.0, 0.0, 1.0);
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

  forceOverLifetime.enabled = true;
  const { forceX, forceY, forceZ } = forceOverLifetime;
  forceX.mode = ParticleCurveMode.Constant;
  forceX.constantMax = 2;
  forceX.constantMin = -10;

  forceY.mode = ParticleCurveMode.Constant;
  forceY.constantMax = 2;
  forceY.constantMin = 0;

  forceZ.mode = ParticleCurveMode.Constant;
  forceZ.constantMax = 2;
  forceZ.constantMin = 0;

  return particleEntity;
}

function createGlowParticle(
  fireEntity: Entity,
  texture: Texture2D,
  stretch: boolean = false,
  lengthScale: number = 2
): void {
  const particleEntity = fireEntity.createChild("Glow");
  particleEntity.transform.position.set(-1.88, 0, 0);

  const particleRenderer = particleEntity.addComponent(ParticleRenderer);
  if (stretch) {
    particleRenderer.renderMode = ParticleRenderMode.StretchBillboard;
    particleRenderer.lengthScale = lengthScale;
  }

  const material = new ParticleMaterial(fireEntity.engine);
  material.blendMode = BlendMode.Additive;
  material.baseTexture = texture;
  particleRenderer.setMaterial(material);
  particleRenderer.priority = 1;

  const generator = particleRenderer.generator;
  const { main, emission, velocityOverLifetime, colorOverLifetime, forceOverLifetime } = generator;
  particleRenderer.generator.useAutoRandomSeed = false;

  // Main module
  main.startSpeed.constant = 0.0;

  main.startSize.constantMin = 5;
  main.startSize.constantMax = 9;
  main.startSize.mode = ParticleCurveMode.TwoConstants;

  main.startRotationZ.constantMin = 0;
  main.startRotationZ.constantMax = 360;
  main.startRotationZ.mode = ParticleCurveMode.TwoConstants;

  main.startColor.constantMin = new Color(0.0, 0.33716361504833037, 1.0, 64 / 255);
  main.startColor.constantMax = new Color(0.004024717018496307, 1.0, 0.0, 128 / 255);
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

  forceOverLifetime.enabled = true;
  const { forceX, forceY, forceZ } = forceOverLifetime;
  forceX.mode = ParticleCurveMode.TwoConstants;
  forceX.constantMax = 0;
  forceX.constantMin = -10;

  forceY.mode = ParticleCurveMode.TwoConstants;
  forceY.constantMax = 10;
  forceY.constantMin = 0;

  forceZ.mode = ParticleCurveMode.TwoConstants;
  forceZ.constantMax = 0;
  forceZ.constantMin = 0;
}

function createSparksParticle(fireEntity: Entity, texture: Texture2D, stretch = false, lengthScale = 2): void {
  const particleEntity = fireEntity.createChild("Sparks");
  particleEntity.transform.position.set(-1.54, 0, 0);

  const particleRenderer = particleEntity.addComponent(ParticleRenderer);
  if (stretch) {
    particleRenderer.renderMode = ParticleRenderMode.StretchBillboard;
    particleRenderer.lengthScale = lengthScale;
  }

  const material = new ParticleMaterial(fireEntity.engine);
  material.baseTexture = texture;
  particleRenderer.setMaterial(material);
  particleRenderer.priority = 0;

  const { main, emission, colorOverLifetime, velocityOverLifetime, forceOverLifetime } = particleRenderer.generator;
  particleRenderer.generator.useAutoRandomSeed = false;

  // Main module
  main.startLifetime.constant = 5;
  main.startSpeed.constant = 0;

  main.startSize.constantMin = 0.05;
  main.startSize.constantMax = 0.2;
  main.startSize.mode = ParticleCurveMode.TwoConstants;

  main.startRotationZ.constantMin = 0;
  main.startRotationZ.constantMax = 360;
  main.startRotationZ.mode = ParticleCurveMode.TwoConstants;

  main.startColor.constant = new Color(0.018500220128379697, 0.23455058216100522, 1.0, 255 / 255);

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

  forceOverLifetime.enabled = true;
  const { forceX, forceY, forceZ } = forceOverLifetime;
  forceX.mode = ParticleCurveMode.Curve;
  forceX.curveMax = new ParticleCurve(new CurveKey(0, 0.2), new CurveKey(0.5, 8), new CurveKey(1, 0.8));

  forceY.mode = ParticleCurveMode.Curve;
  forceY.curveMax = new ParticleCurve(new CurveKey(0, 0.2), new CurveKey(0.5, 8), new CurveKey(1, 0.8));

  forceZ.mode = ParticleCurveMode.Curve;
  forceZ.curveMax = new ParticleCurve(new CurveKey(0, 0.2), new CurveKey(0.5, 8), new CurveKey(1, 0.8));
}

function createHighlightsParticle(fireEntity: Entity, texture: Texture2D, stretch = false, lengthScale = 2): void {
  const particleEntity = fireEntity.createChild("Highlights");
  particleEntity.transform.position.set(-5.31, 0, 0);

  const particleRenderer = particleEntity.addComponent(ParticleRenderer);
  if (stretch) {
    particleRenderer.renderMode = ParticleRenderMode.StretchBillboard;
    particleRenderer.lengthScale = lengthScale;
  }

  const material = new ParticleMaterial(fireEntity.engine);
  material.blendMode = BlendMode.Additive;
  material.baseTexture = texture;
  particleRenderer.setMaterial(material);
  particleRenderer.priority = 3;
  particleRenderer.generator.useAutoRandomSeed = false;

  const generator = particleRenderer.generator;
  const { main, emission, sizeOverLifetime, colorOverLifetime, velocityOverLifetime, forceOverLifetime } = generator;

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

  forceOverLifetime.enabled = true;
  const { forceX, forceY, forceZ } = forceOverLifetime;
  forceX.mode = ParticleCurveMode.TwoCurves;
  forceX.curveMax = new ParticleCurve(new CurveKey(0, 0.2), new CurveKey(0.5, 8), new CurveKey(1, 0.8));
  forceX.curveMin = new ParticleCurve(new CurveKey(0, 0), new CurveKey(0.5, 2), new CurveKey(1, 0));

  forceY.mode = ParticleCurveMode.TwoCurves;
  forceY.curveMax = new ParticleCurve(new CurveKey(0, 0.2), new CurveKey(0.5, 8), new CurveKey(1, 0.8));
  forceY.curveMin = new ParticleCurve(new CurveKey(0, 0), new CurveKey(0.5, 2), new CurveKey(1, 0));

  forceZ.mode = ParticleCurveMode.TwoCurves;
  forceZ.curveMax = new ParticleCurve(new CurveKey(0, 0.2), new CurveKey(0.5, 8), new CurveKey(1, 0.8));
  forceZ.curveMin = new ParticleCurve(new CurveKey(0, 0), new CurveKey(0.5, 2), new CurveKey(1, 0));
}
