import {
  BlendMode,
  ConeShape,
  Engine,
  Entity,
  GradientAlphaKey,
  GradientColorKey,
  Layer,
  ParticleCompositeGradient,
  ParticleCurveMode,
  ParticleGradient,
  ParticleMaterial,
  ParticleRenderer,
  ParticleRenderMode,
  ParticleSimulationSpace,
  ParticleStopMode,
  Texture2D,
  TextureFormat
} from "@galacean/engine-core";
import { Color } from "@galacean/engine-math";
import {
  createWaterInteractionEvent,
  WaterInteractionEventKind,
  type WaterInteractionEvent,
  type WaterInteractionEventConsumer,
  type WaterInteractionEventQueue
} from "../../runtime/interaction/WaterInteractionEventQueue";

export interface OceanSplashEmitter {
  readonly capacity: number;
  readonly isAlive: boolean;
  emitAt(
    worldX: number,
    worldY: number,
    worldZ: number,
    count: number
  ): number;
  clear(): void;
  destroy(): void;
}

export interface OceanSplashEmitterFactory {
  create(
    engine: Engine,
    parent: Entity,
    capacity: number
  ): OceanSplashEmitter;
}

export interface OceanSplashVfxControllerOptions {
  readonly getEventQueue: () => WaterInteractionEventQueue | undefined;
  readonly enabled?: boolean;
  readonly particleCapacity?: number;
  readonly maximumParticlesPerFrame?: number;
  readonly emitterFactory?: OceanSplashEmitterFactory;
}

export interface OceanSplashVfxMetrics {
  readonly enabled: boolean;
  readonly emitterCreateCount: number;
  readonly emitterDestroyCount: number;
  readonly materialCreateCount: number;
  readonly materialDestroyCount: number;
  readonly activeEmitterCount: number;
  readonly activeMaterialCount: number;
  readonly particleCapacity: number;
  readonly maximumParticlesPerFrame: number;
  readonly updateCount: number;
  readonly queueDrainCount: number;
  readonly consumedImpactCount: number;
  readonly ignoredEventCount: number;
  readonly disabledEventDropCount: number;
  readonly emissionCount: number;
  readonly emittedParticleCount: number;
  readonly peakQueuedEventCount: number;
  readonly hasLiveParticles: boolean;
  readonly lastWorldX: number;
  readonly lastWorldY: number;
  readonly lastWorldZ: number;
  readonly lastStrength: number;
}

interface MutableOceanSplashVfxMetrics {
  enabled: boolean;
  emitterCreateCount: number;
  emitterDestroyCount: number;
  materialCreateCount: number;
  materialDestroyCount: number;
  activeEmitterCount: number;
  activeMaterialCount: number;
  particleCapacity: number;
  maximumParticlesPerFrame: number;
  updateCount: number;
  queueDrainCount: number;
  consumedImpactCount: number;
  ignoredEventCount: number;
  disabledEventDropCount: number;
  emissionCount: number;
  emittedParticleCount: number;
  peakQueuedEventCount: number;
  hasLiveParticles: boolean;
  lastWorldX: number;
  lastWorldY: number;
  lastWorldZ: number;
  lastStrength: number;
}

const DEFAULT_PARTICLE_CAPACITY = 96;
const DEFAULT_MAXIMUM_PARTICLES_PER_FRAME = 48;
const MINIMUM_PARTICLES_PER_IMPACT = 4;
const PARTICLE_STRENGTH_SCALE = 14;
const SPLASH_EMITTER_SURFACE_OFFSET = 0.12;
const SPLASH_SPRITE_SIZE = 32;

export function buildOceanSplashSpritePixels(
  size: number = SPLASH_SPRITE_SIZE
): Uint8Array {
  if (!Number.isSafeInteger(size) || size < 4) {
    throw new Error(
      "Ocean splash sprite size must be an integer of at least four pixels."
    );
  }
  const pixels = new Uint8Array(size * size * 4);
  const center = (size - 1) * 0.5;
  const inverseRadius = 1 / center;
  for (let y = 0; y < size; y++) {
    const normalizedY = (y - center) * inverseRadius;
    for (let x = 0; x < size; x++) {
      const normalizedX = (x - center) * inverseRadius;
      const radiusSquared =
        normalizedX * normalizedX +
        normalizedY * normalizedY;
      const coverage = Math.pow(
        Math.max(0, 1 - radiusSquared),
        1.45
      );
      const offset = (y * size + x) * 4;
      pixels[offset] = 226;
      pixels[offset + 1] = 241;
      pixels[offset + 2] = 246;
      pixels[offset + 3] = Math.round(coverage * 255);
    }
  }
  return pixels;
}

class EngineOceanSplashEmitter implements OceanSplashEmitter {
  readonly capacity: number;

  private readonly _entity: Entity;
  private readonly _renderer: ParticleRenderer;
  private readonly _material: ParticleMaterial;
  private readonly _spriteTexture: Texture2D;
  private _destroyed = false;

  constructor(engine: Engine, parent: Entity, capacity: number) {
    this.capacity = capacity;
    this._entity = parent.createChild("ocean-splash-particle-emitter");
    this._entity.layer = Layer.Layer30;
    this._entity.transform.setRotation(90, 0, 0);
    this._renderer = this._entity.addComponent(ParticleRenderer);
    this._renderer.renderMode = ParticleRenderMode.StretchBillboard;
    this._renderer.lengthScale = 1.15;
    this._renderer.velocityScale = 0.2;

    this._material = new ParticleMaterial(engine);
    this._material.name = "OceanSplashParticleMaterial";
    this._spriteTexture = new Texture2D(
      engine,
      SPLASH_SPRITE_SIZE,
      SPLASH_SPRITE_SIZE,
      TextureFormat.R8G8B8A8,
      false,
      false
    );
    this._spriteTexture.name = "OceanSplashDropletSprite";
    this._spriteTexture.setPixelBuffer(
      buildOceanSplashSpritePixels()
    );
    this._material.baseTexture = this._spriteTexture;
    this._material.baseColor = new Color(
      0.86,
      0.93,
      0.96,
      0.64
    );
    this._material.emissiveColor = new Color(
      0.025,
      0.043,
      0.05,
      1
    );
    this._material.blendMode = BlendMode.Normal;
    this._renderer.setMaterial(this._material);

    const generator = this._renderer.generator;
    generator.useAutoRandomSeed = false;
    generator.randomSeed = 0x4f434541;
    const main = generator.main;
    main.playOnEnabled = false;
    main.isLoop = false;
    main.maxParticles = capacity;
    main.simulationSpace = ParticleSimulationSpace.World;
    main.startLifetime.mode = ParticleCurveMode.TwoConstants;
    main.startLifetime.constantMin = 0.58;
    main.startLifetime.constantMax = 1.24;
    main.startSpeed.mode = ParticleCurveMode.TwoConstants;
    main.startSpeed.constantMin = 2.1;
    main.startSpeed.constantMax = 4.8;
    main.startSize.mode = ParticleCurveMode.TwoConstants;
    main.startSize.constantMin = 0.055;
    main.startSize.constantMax = 0.16;
    main.gravityModifier.constant = 0.68;

    const shape = new ConeShape();
    shape.angle = 34;
    shape.radius = 0.22;
    shape.randomDirectionAmount = 0.28;
    generator.emission.shape = shape;
    generator.emission.rateOverTime.constant = 0;
    generator.emission.rateOverDistance.constant = 0;

    generator.colorOverLifetime.enabled = true;
    generator.colorOverLifetime.color = new ParticleCompositeGradient(
      new ParticleGradient(
        [
          new GradientColorKey(0, new Color(0.82, 0.94, 1)),
          new GradientColorKey(1, new Color(0.55, 0.76, 0.84))
        ],
        [
          new GradientAlphaKey(0, 0.62),
          new GradientAlphaKey(0.58, 0.3),
          new GradientAlphaKey(1, 0)
        ]
      )
    );
    generator.stop(false, ParticleStopMode.StopEmittingAndClear);
  }

  get isAlive(): boolean {
    return !this._destroyed && this._renderer.generator.isAlive;
  }

  emitAt(
    worldX: number,
    worldY: number,
    worldZ: number,
    count: number
  ): number {
    if (this._destroyed || count <= 0) return 0;
    const boundedCount = Math.min(
      this.capacity,
      Math.max(0, Math.floor(count))
    );
    if (boundedCount === 0) return 0;
    // Impact queries land on the displaced water surface. Starting the cone
    // slightly above that surface prevents the first droplet frames from being
    // hidden by depth-tested water while keeping the event itself authoritative.
    this._entity.transform.setPosition(
      worldX,
      worldY + SPLASH_EMITTER_SURFACE_OFFSET,
      worldZ
    );
    const generator = this._renderer.generator;
    generator.play(false);
    generator.emit(boundedCount);
    return boundedCount;
  }

  clear(): void {
    if (this._destroyed) return;
    this._renderer.generator.stop(
      false,
      ParticleStopMode.StopEmittingAndClear
    );
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._renderer.generator.stop(
      false,
      ParticleStopMode.StopEmittingAndClear
    );
    this._entity.destroy();
    this._material.baseTexture = null!;
    this._material.destroy(true);
    this._spriteTexture.destroy(true);
  }
}

const defaultOceanSplashEmitterFactory: OceanSplashEmitterFactory = {
  create(
    engine: Engine,
    parent: Entity,
    capacity: number
  ): OceanSplashEmitter {
    return new EngineOceanSplashEmitter(engine, parent, capacity);
  }
};

/**
 * Demo-only fixed-pool consumer for Ocean Impact events.
 *
 * The water runtime publishes bounded events; this adapter owns exactly one
 * ParticleRenderer and one ParticleMaterial, moves its world-space emitter,
 * and calls emit(count). It never creates presentation resources per event.
 */
export class OceanSplashVfxController
  implements WaterInteractionEventConsumer
{
  readonly root: Entity;
  readonly metrics: OceanSplashVfxMetrics;

  private readonly _getEventQueue: () =>
    | WaterInteractionEventQueue
    | undefined;
  private readonly _emitter: OceanSplashEmitter;
  private readonly _event: WaterInteractionEvent =
    createWaterInteractionEvent();
  private readonly _mutableMetrics: MutableOceanSplashVfxMetrics;
  private _remainingFrameBudget = 0;
  private _enabled: boolean;
  private _destroyed = false;

  constructor(
    engine: Engine,
    parent: Entity,
    options: Readonly<OceanSplashVfxControllerOptions>
  ) {
    const particleCapacity =
      options.particleCapacity ?? DEFAULT_PARTICLE_CAPACITY;
    const maximumParticlesPerFrame =
      options.maximumParticlesPerFrame ??
      DEFAULT_MAXIMUM_PARTICLES_PER_FRAME;
    if (
      !Number.isSafeInteger(particleCapacity) ||
      particleCapacity < 1 ||
      !Number.isSafeInteger(maximumParticlesPerFrame) ||
      maximumParticlesPerFrame < 1 ||
      maximumParticlesPerFrame > particleCapacity
    ) {
      throw new Error("Ocean splash particle budgets are invalid.");
    }
    this._getEventQueue = options.getEventQueue;
    this._enabled = options.enabled ?? true;
    this.root = parent.createChild("ocean-splash-vfx");
    try {
      this._emitter = (
        options.emitterFactory ?? defaultOceanSplashEmitterFactory
      ).create(engine, this.root, particleCapacity);
    } catch (error) {
      this.root.destroy();
      throw error;
    }
    this._mutableMetrics = {
      enabled: this._enabled,
      emitterCreateCount: 1,
      emitterDestroyCount: 0,
      materialCreateCount: 1,
      materialDestroyCount: 0,
      activeEmitterCount: 1,
      activeMaterialCount: 1,
      particleCapacity,
      maximumParticlesPerFrame,
      updateCount: 0,
      queueDrainCount: 0,
      consumedImpactCount: 0,
      ignoredEventCount: 0,
      disabledEventDropCount: 0,
      emissionCount: 0,
      emittedParticleCount: 0,
      peakQueuedEventCount: 0,
      hasLiveParticles: false,
      lastWorldX: 0,
      lastWorldY: 0,
      lastWorldZ: 0,
      lastStrength: 0
    };
    this.metrics = this._mutableMetrics;
    if (!this._enabled) this._emitter.clear();
  }

  update(): void {
    if (this._destroyed) return;
    const queue = this._getEventQueue();
    this._mutableMetrics.updateCount++;
    this._mutableMetrics.hasLiveParticles = this._emitter.isAlive;
    if (!queue) return;
    const queuedCount = queue.count;
    this._mutableMetrics.peakQueuedEventCount = Math.max(
      this._mutableMetrics.peakQueuedEventCount,
      queuedCount
    );
    if (!this._enabled) {
      this._mutableMetrics.disabledEventDropCount += queuedCount;
      queue.clearEvents();
      this._mutableMetrics.hasLiveParticles = false;
      return;
    }
    this._remainingFrameBudget =
      this._mutableMetrics.maximumParticlesPerFrame;
    if (queuedCount > 0) {
      queue.drain(this);
      this._mutableMetrics.queueDrainCount++;
    }
    this._mutableMetrics.hasLiveParticles = this._emitter.isAlive;
  }

  consumeInteractionEvent(
    queue: WaterInteractionEventQueue,
    index: number
  ): void {
    if (!queue.read(index, this._event)) return;
    const event = this._event;
    if (event.kind !== WaterInteractionEventKind.Impact) {
      this._mutableMetrics.ignoredEventCount++;
      return;
    }
    this._mutableMetrics.consumedImpactCount++;
    if (this._remainingFrameBudget <= 0) return;
    const requestedCount = Math.min(
      this._remainingFrameBudget,
      MINIMUM_PARTICLES_PER_IMPACT +
        Math.round(
          Math.min(1, Math.max(0, event.strength)) *
            PARTICLE_STRENGTH_SCALE
        )
    );
    const emittedCount = this._emitter.emitAt(
      event.worldX,
      event.worldY,
      event.worldZ,
      requestedCount
    );
    this._remainingFrameBudget -= emittedCount;
    if (emittedCount <= 0) return;
    this._mutableMetrics.emissionCount++;
    this._mutableMetrics.emittedParticleCount += emittedCount;
    this._mutableMetrics.lastWorldX = event.worldX;
    this._mutableMetrics.lastWorldY = event.worldY;
    this._mutableMetrics.lastWorldZ = event.worldZ;
    this._mutableMetrics.lastStrength = event.strength;
  }

  setEnabled(enabled: boolean): void {
    if (this._destroyed || enabled === this._enabled) return;
    this._enabled = enabled;
    this._mutableMetrics.enabled = enabled;
    if (!enabled) {
      const queue = this._getEventQueue();
      if (queue) {
        this._mutableMetrics.disabledEventDropCount += queue.count;
        queue.clearEvents();
      }
      this._emitter.clear();
      this._mutableMetrics.hasLiveParticles = false;
    }
  }

  reset(): void {
    if (this._destroyed) return;
    this._getEventQueue()?.clearEvents();
    this._emitter.clear();
    this._remainingFrameBudget = 0;
    this._mutableMetrics.hasLiveParticles = false;
    this._mutableMetrics.lastWorldX = 0;
    this._mutableMetrics.lastWorldY = 0;
    this._mutableMetrics.lastWorldZ = 0;
    this._mutableMetrics.lastStrength = 0;
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._getEventQueue()?.clearEvents();
    this._emitter.destroy();
    this.root.destroy();
    this._mutableMetrics.enabled = false;
    this._mutableMetrics.emitterDestroyCount++;
    this._mutableMetrics.materialDestroyCount++;
    this._mutableMetrics.activeEmitterCount = 0;
    this._mutableMetrics.activeMaterialCount = 0;
    this._mutableMetrics.hasLiveParticles = false;
  }
}
