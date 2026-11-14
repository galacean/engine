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
  ParticleStopMode,
  Script,
  TextureWrapMode,
  type Engine,
  type Entity,
  type Rand,
  type Texture2D,
  type Vector3
} from "@galacean/engine";
import {
  decodeSeedWorldHeight,
  sampleSeedWorldHeight,
  seedWorldOriginX,
  seedWorldOriginZ,
  type SeedWorldFields
} from "@galacean/engine-world-planning/runtime/SeedWorldFields";

const ATLAS_URL = "https://mdn.alipayobjects.com/rms/afts/img/A*kavuQ53dG1MAAAAATiAAAAgAehQnAQ/original/sandstorm-448.png";
const EMISSION_RATE = 500;
const MAX_LIFETIME = 10;
const REGION_SIZE = 400;
const REGION_HEIGHT = 4;
const REGION_CENTER_HEIGHT = 2.35;

class TerrainEmissionShape extends BoxShape {
  constructor(
    readonly centerX: number,
    readonly centerZ: number,
    private readonly fields: SeedWorldFields,
    private readonly centerGround: number
  ) {
    super();
  }

  override _generateLocalPositionAndDirection(rand: Rand, emitTime: number, position: Vector3, direction: Vector3): void {
    super._generateLocalPositionAndDirection(rand, emitTime, position, direction);
    const ground = sampleSeedWorldHeight(this.fields, this.centerX + position.x, this.centerZ + position.z);
    position.y += (ground ?? this.centerGround) + REGION_CENTER_HEIGHT;
  }

  override _getLocalPositionRange(outMin: Vector3, outMax: Vector3): void {
    super._getLocalPositionRange(outMin, outMax);
    outMin.y += decodeSeedWorldHeight(this.fields, 0) + REGION_CENTER_HEIGHT;
    outMax.y += decodeSeedWorldHeight(this.fields, 65535) + REGION_CENTER_HEIGHT;
  }
}

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

export function placeSeedSandstorm(
  emitter: Entity,
  x: number,
  z: number,
  fields: SeedWorldFields
): void {
  const generator = emitter.getComponent(ParticleRenderer)!.generator;
  const halfSize = REGION_SIZE * 0.5;
  const worldX = seedWorldOriginX(fields);
  const worldZ = seedWorldOriginZ(fields);
  const minX = Math.max(x - halfSize, worldX);
  const maxX = Math.min(x + halfSize, worldX + fields.sizeMetres);
  const minZ = Math.max(z - halfSize, worldZ);
  const maxZ = Math.min(z + halfSize, worldZ + fields.sizeMetres);
  const centerX = (minX + maxX) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;
  const ground = sampleSeedWorldHeight(fields, centerX, centerZ);
  if (ground === undefined) throw new Error("Sandstorm emission terrain is unavailable");
  const shape = new TerrainEmissionShape(centerX, centerZ, fields, ground);
  shape.size.set(maxX - minX, REGION_HEIGHT, maxZ - minZ);

  generator.stop(false, ParticleStopMode.StopEmittingAndClear);
  generator.emission.shape = shape;
  emitter.transform.setWorldPosition(shape.centerX, 0, shape.centerZ);
  generator.play(false);
}

export function createSeedSandstorm(
  root: Entity,
  atlas: Texture2D,
  x: number,
  z: number,
  fields: SeedWorldFields
): Entity {
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

  placeSeedSandstorm(emitter, x, z, fields);
  return emitter;
}
