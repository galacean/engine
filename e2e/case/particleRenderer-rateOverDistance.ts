/**
 * @title Particle Rate Over Distance
 * @category Particle
 */
import {
  AssetType,
  BlendMode,
  Camera,
  Color,
  Engine,
  Entity,
  ParticleCompositeCurve,
  ParticleCurveMode,
  ParticleGradientMode,
  ParticleMaterial,
  ParticleRenderer,
  ParticleSimulationSpace,
  Script,
  SphereShape,
  Texture2D,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();
  scene.background.solidColor = new Color(0, 0, 0, 1);

  const cameraEntity = rootEntity.createChild("camera");
  cameraEntity.transform.setPosition(0, 0, 12);
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 60;

  engine.resourceManager
    .load({
      url: "https://mdn.alipayobjects.com/huamei_9ahbho/afts/img/A*OiP_RLwuFqAAAAAAQBAAAAgAegDwAQ/original",
      type: AssetType.Texture
    })
    .then((texture) => {
      const particleEntity = createTrailParticle(engine, <Texture2D>texture);
      particleEntity.addComponent(OrbitScript);
      rootEntity.addChild(particleEntity);

      updateForE2E(engine, 100, 40);
      initScreenshot(engine, camera);
    });
});

function createTrailParticle(engine: Engine, texture: Texture2D): Entity {
  const particleEntity = new Entity(engine, "RateOverDistance");

  const particleRenderer = particleEntity.addComponent(ParticleRenderer);
  const generator = particleRenderer.generator;
  generator.useAutoRandomSeed = false;

  const material = new ParticleMaterial(engine);
  material.baseColor = new Color(0.4, 0.8, 1.0, 1.0);
  material.blendMode = BlendMode.Additive;
  material.baseTexture = texture;
  particleRenderer.setMaterial(material);

  const { main, emission, colorOverLifetime, sizeOverLifetime } = generator;

  // Main: world space so the trail stays put while the emitter moves.
  main.duration = 5;
  main.isLoop = true;
  main.startLifetime.constant = 2;
  main.startSpeed.constant = 0;
  main.startSize.constantMin = 0.15;
  main.startSize.constantMax = 0.3;
  main.startSize.mode = ParticleCurveMode.TwoConstants;
  main.gravityModifier.constant = 0;
  main.simulationSpace = ParticleSimulationSpace.World;
  main.maxParticles = 2000;

  // Emission: only distance-driven.
  emission.rateOverTime = new ParticleCompositeCurve(0);
  emission.rateOverDistance = new ParticleCompositeCurve(15);

  const sphereShape = new SphereShape();
  sphereShape.radius = 0.05;
  emission.shape = sphereShape;

  // Fade in/out along lifetime.
  colorOverLifetime.enabled = true;
  colorOverLifetime.color.mode = ParticleGradientMode.Gradient;
  const gradient = colorOverLifetime.color.gradient;
  gradient.alphaKeys[0].alpha = 0;
  gradient.alphaKeys[1].alpha = 0;
  gradient.addAlphaKey(0.2, 1.0);
  gradient.addAlphaKey(0.8, 1.0);
  gradient.colorKeys[0].color.set(0.4, 0.8, 1.0, 1.0);
  gradient.colorKeys[1].color.set(1.0, 0.3, 0.8, 1.0);

  // Shrink to nothing.
  sizeOverLifetime.enabled = true;
  sizeOverLifetime.size.mode = ParticleCurveMode.Curve;
  const sizeCurve = sizeOverLifetime.size.curve;
  sizeCurve.keys[0].value = 1;
  sizeCurve.keys[1].value = 0;

  return particleEntity;
}

class OrbitScript extends Script {
  private _radius: number = 4;
  private _angle: number = 0;
  private _speed: number = 1.5;

  onUpdate(deltaTime: number): void {
    this._angle += deltaTime * this._speed;
    const x = Math.cos(this._angle) * this._radius;
    const y = Math.sin(this._angle * 2) * this._radius * 0.5;
    this.entity.transform.setPosition(x, y, 0);
  }
}
