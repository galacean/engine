import {
  AssetType,
  BoxShape,
  Color,
  CurveKey,
  GradientAlphaKey,
  GradientColorKey,
  ParticleCompositeCurve,
  ParticleCompositeGradient,
  ParticleCurve,
  ParticleGradient,
  ParticleMaterial,
  ParticleRenderer,
  ParticleScaleMode,
  ParticleSimulationSpace,
  Script,
  TextureWrapMode,
  type Engine,
  type Entity,
  type Texture2D
} from "@galacean/engine";

const ATLAS_URL = "https://mdn.alipayobjects.com/rms/afts/img/A*kavuQ53dG1MAAAAATiAAAAgAehQnAQ/original/sandstorm-448.png";
const EMISSION_RATE = 500;
const MAX_LIFETIME = 10;
const REGION_SIZE = 400;
const REGION_HEIGHT = 4;
const REGION_CENTER_HEIGHT = 3.68;

class SandstormMaterialLifetime extends Script {
  material!: ParticleMaterial;

  onDestroy(): void {
    this.material?.destroy(true);
  }
}

export function loadSeedSandstormAtlas(engine: Engine): PromiseLike<Texture2D> {
  return engine.resourceManager.load<Texture2D>({
    type: AssetType.Texture,
    url: ATLAS_URL,
    params: { isSRGBColorSpace: true, mipmap: true }
  });
}

export function placeSeedSandstorm(emitter: Entity, x: number, ground: number, z: number): void {
  emitter.transform.setWorldPosition(x, ground + REGION_CENTER_HEIGHT, z);
}

export function createSeedSandstorm(root: Entity, atlas: Texture2D, x: number, ground: number, z: number): Entity {
  const emitter = root.createChild("Seed desert sandstorm");
  const renderer = emitter.addComponent(ParticleRenderer);
  const generator = renderer.generator;
  const { main, emission, colorOverLifetime, velocityOverLifetime, rotationOverLifetime, textureSheetAnimation } = generator;
  main.playOnEnabled = false;
  main.scalingMode = ParticleScaleMode.Shape;
  main.simulationSpace = ParticleSimulationSpace.World;
  main.startColor = new ParticleCompositeGradient(
    new Color(135 / 255, 123 / 255, 115 / 255, 1),
    new Color(236 / 255, 214 / 255, 202 / 255, 1)
  );

  const shape = new BoxShape();
  emission.shape = shape;

  colorOverLifetime.enabled = true;
  colorOverLifetime.color = new ParticleCompositeGradient(new ParticleGradient(
    [new GradientColorKey(0, new Color(1, 1, 1)), new GradientColorKey(1, new Color(1, 1, 1))],
    [new GradientAlphaKey(0, 0), new GradientAlphaKey(32768 / 65535, 1), new GradientAlphaKey(1, 0)]
  ));

  textureSheetAnimation.enabled = true;
  textureSheetAnimation.tiling.set(7, 7);
  textureSheetAnimation.cycleCount = 3;
  textureSheetAnimation.frameOverTime.curve = new ParticleCurve(new CurveKey(0, 0), new CurveKey(1, 0.9999));

  const material = new ParticleMaterial(emitter.engine);
  renderer.setMaterial(material);
  emitter.addComponent(SandstormMaterialLifetime).material = material;

  atlas.wrapModeU = atlas.wrapModeV = TextureWrapMode.Clamp;
  material.baseTexture = atlas;
  material.baseColor.a = 1;
  shape.size.set(REGION_SIZE, REGION_HEIGHT, REGION_SIZE);

  main.duration = MAX_LIFETIME;
  main.maxParticles = EMISSION_RATE * MAX_LIFETIME;
  main.startLifetime = new ParticleCompositeCurve(7, MAX_LIFETIME);
  main.startSize = new ParticleCompositeCurve(4, 16);
  main.startSpeed = new ParticleCompositeCurve(0);
  velocityOverLifetime.enabled = true;
  velocityOverLifetime.space = ParticleSimulationSpace.World;
  velocityOverLifetime.velocityX = new ParticleCompositeCurve(2, 6);
  main.startRotationZ = new ParticleCompositeCurve(-90, 90);
  rotationOverLifetime.enabled = true;
  rotationOverLifetime.rotationZ = new ParticleCompositeCurve(-20, 20);
  emission.rateOverTime.constant = EMISSION_RATE;

  placeSeedSandstorm(emitter, x, ground, z);
  generator.play(false);
  return emitter;
}
