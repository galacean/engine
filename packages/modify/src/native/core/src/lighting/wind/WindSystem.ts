import type { WeatherWindState } from "../weather/WeatherState";
import {
  createDefaultWindSystemConfig,
  type WindEmitter,
  type WindExposureSampler,
  type WindGpuFieldDescriptorBuffer,
  type WindGpuContext,
  type WindGustSnapshot,
  type WindLayer,
  type WindLocalFieldBounds,
  type WindLocalSample,
  type WindSample,
  type WindSystemConfig,
  type WindSystemSnapshot,
  type WindVector2Tuple,
  type WindVector3Like,
  type WindVector3Tuple
} from "./WindTypes";

interface ActiveGust {
  active: boolean;
  startTime: number;
  duration: number;
  amplitude: number;
  releaseStartTime: number;
  originX: number;
  originY: number;
  originZ: number;
  directionX: number;
  directionZ: number;
}

interface WindSpectrumSample {
  macro: number;
  meso: number;
  micro: number;
}

interface WindDampingResult {
  value: number;
  derivative: number;
}

const ZERO_RECEIVER_VELOCITY: WindVector3Like = Object.freeze({ x: 0, y: 0, z: 0 });
const MIN_DIRECTION_LENGTH = 1e-6;
const MAXIMUM_GUST_MULTIPLIER = 1.25;
const GUST_SATURATION_SOFTNESS = 0.5;

/**
 * Engine-level wind velocity field shared by rendering, particles, climate, audio and gameplay.
 *
 * @remarks
 * The system is independent from Scene and GPU resource ownership. It evaluates a deterministic
 * macro wind in metres per second, travelling gusts, height layers, analytical local emitters and
 * optional exposure. {@link WindSceneBridge} publishes the reused render state and textures.
 */
export class WindSystem {
  readonly config: WindSystemConfig;

  private readonly _emitters: WindEmitter[] = [];
  private readonly _gpuContext: WindGpuContext;
  private readonly _currentVelocity: WindVector3Tuple = [0, 0, 0];
  private readonly _velocityDerivative: WindVector3Tuple = [0, 0, 0];
  private readonly _targetVelocity: WindVector3Tuple = [0, 0, 0];
  private readonly _baseDirection: WindVector3Tuple = [1, 0, 0];
  private readonly _spectrumAdvectionOffsetXZ: WindVector2Tuple = [0, 0];
  private readonly _referencePosition = { x: 0, y: 0, z: 0 };
  private readonly _exposureDirection = { x: 1, y: 0, z: 0 };
  private readonly _spectrumSample: WindSpectrumSample = { macro: 0, meso: 0, micro: 0 };
  private readonly _dampingResult: WindDampingResult = { value: 0, derivative: 0 };
  private _baseSpeedMps: number;
  private _weather: WeatherWindState = {
    forceMultiplier: 1,
    directionOffsetDegrees: 0,
    gustStrength: 0,
    turbulence: 0
  };
  private _exposureSampler: WindExposureSampler | null = null;
  private _elapsedTime = 0;
  private _randomState: number;
  private _nextGustTime = Number.POSITIVE_INFINITY;
  private _gustSchedulingBlockedUntil = 0;
  private readonly _gusts: ActiveGust[] = [];
  private _localFieldRevision = 0;
  private _emitterRevision = 0;
  private _gustRevision = 0;
  private _exposureRevision = 0;
  private _observedExposureSourceRevision = 0;

  constructor(config: Readonly<Partial<WindSystemConfig>> = {}) {
    this.config = resolveConfig(config);
    this._baseSpeedMps = this.config.baseSpeedMps;
    this._randomState = this.config.seed >>> 0;
    for (let index = 0; index < this.config.maxActiveGusts; index++) {
      this._gusts.push({
        active: false,
        startTime: 0,
        duration: 0,
        amplitude: 0,
        releaseStartTime: -1,
        originX: 0,
        originY: 0,
        originZ: 0,
        directionX: 1,
        directionZ: 0
      });
    }
    copyNormalizedDirection(this.config.baseDirection, this._baseDirection);
    this._refreshTargetVelocity();
    copyTuple(this._targetVelocity, this._currentVelocity);
    this._gpuContext = {
      velocityWS: [0, 0, 0],
      directionWS: [1, 0, 0],
      spectrumAdvectionOffsetXZ: [0, 0],
      layerMultipliers: [
        this.config.layerMultipliers.ground,
        this.config.layerMultipliers.canopy,
        this.config.layerMultipliers.cloud
      ],
      speedMps: 0,
      gust: 0,
      turbulence: 0,
      elapsedTime: 0,
      spectrum: this.config.spectrum
    };
    this._scheduleNextGust(0);
    this._refreshGpuContext();
  }

  /** Changes the authored macro wind while retaining critically damped physical response. */
  setBaseWind(direction: WindVector3Like | readonly number[], speedMps: number): void {
    validateNonNegativeFinite("Wind base speed", speedMps);
    copyNormalizedDirection(direction, this._baseDirection);
    this._baseSpeedMps = speedMps;
    this._refreshTargetVelocity();
  }

  /** Applies WeatherSystem's independent wind channel to the physical baseline. */
  applyWeatherForcing(forcing: Readonly<WeatherWindState>): void {
    validateWeatherForcing(forcing);
    const weather = this._weather;
    if (
      weather.forceMultiplier === forcing.forceMultiplier &&
      weather.directionOffsetDegrees === forcing.directionOffsetDegrees &&
      weather.gustStrength === forcing.gustStrength &&
      weather.turbulence === forcing.turbulence
    ) {
      return;
    }
    const previousGustStrength = this._weather.gustStrength;
    weather.forceMultiplier = forcing.forceMultiplier;
    weather.directionOffsetDegrees = forcing.directionOffsetDegrees;
    weather.gustStrength = forcing.gustStrength;
    weather.turbulence = forcing.turbulence;
    this._refreshTargetVelocity();
    if (forcing.gustStrength <= 0) {
      // A zero weather multiplier makes every packet contribution exactly zero on both CPU and
      // GPU. Retire the descriptors immediately so the retained receiver response can begin its
      // physical release instead of keeping the field pass awake for the packet travel horizon.
      this._retireAllGusts();
      this._nextGustTime = Number.POSITIVE_INFINITY;
    } else if (forcing.gustStrength < previousGustStrength) {
      // A weather-regime unload must not leave an already travelling packet in its attack phase.
      // Freeze each packet at its current local envelope and release that stored load smoothly;
      // otherwise the air field keeps adding energy while woody receivers are trying to recover.
      const activeReleaseSeconds = this._beginGustRelease();
      this._gustSchedulingBlockedUntil = Math.max(
        this._gustSchedulingBlockedUntil,
        this._elapsedTime + Math.max(this.config.gust.decaySeconds, activeReleaseSeconds)
      );
      this._nextGustTime = Number.POSITIVE_INFINITY;
    } else if (previousGustStrength <= 0 && forcing.gustStrength > 0) {
      this._gustSchedulingBlockedUntil = this._elapsedTime;
      this._scheduleNextGust(this._elapsedTime);
    } else if (previousGustStrength !== forcing.gustStrength) {
      // The scheduled packet is a sample from a rate-dependent arrival process. Retain its
      // normalized waiting-time quantile when weather changes the rate; keeping the old absolute
      // timestamp leaks the former gale cadence into an unloading transition and can re-excite
      // a tree that is already returning towards its breeze equilibrium.
      const previousFrequency = this._gustFrequencyPerMinute(previousGustStrength);
      const nextFrequency = this._gustFrequencyPerMinute(forcing.gustStrength);
      const remainingTime = Math.max(this._nextGustTime - this._elapsedTime, 0);
      if (Number.isFinite(remainingTime) && previousFrequency > 0 && nextFrequency > 0) {
        this._nextGustTime = this._elapsedTime + remainingTime * (previousFrequency / nextFrequency);
      } else {
        this._gustSchedulingBlockedUntil = this._elapsedTime;
        this._scheduleNextGust(this._elapsedTime);
      }
    }
  }

  /** Camera/player reference used to originate finite travelling gust fronts. */
  setReferencePosition(position: WindVector3Like): void {
    validateVector("Wind reference position", position);
    this._referencePosition.x = position.x;
    this._referencePosition.y = position.y;
    this._referencePosition.z = position.z;
  }

  /** Installs an optional terrain/canopy exposure lookup. */
  setExposureSampler(sampler: WindExposureSampler | null): void {
    if (this._exposureSampler === sampler) return;
    this._exposureSampler = sampler;
    this._observedExposureSourceRevision = readExposureRevision(sampler);
    this._exposureRevision++;
    this._localFieldRevision++;
  }

  /** Adds or atomically replaces one stable analytical local source. */
  setEmitter(emitter: Readonly<WindEmitter>): void {
    validateEmitter(emitter);
    const existingIndex = this._emitters.findIndex((candidate) => candidate.id === emitter.id);
    if (existingIndex >= 0) {
      if (emittersEqual(this._emitters[existingIndex], emitter)) return;
      const detached = cloneEmitter(emitter);
      this._emitters[existingIndex] = detached;
    } else {
      if (this._emitters.length >= this.config.maxEmitters) {
        throw new RangeError(`WindSystem supports at most ${this.config.maxEmitters} local emitters`);
      }
      this._emitters.push(cloneEmitter(emitter));
    }
    this._emitters.sort(compareEmitterPriority);
    this._emitterRevision++;
    this._localFieldRevision++;
  }

  /** Removes one local source by stable id. */
  removeEmitter(id: string): boolean {
    const index = this._emitters.findIndex((emitter) => emitter.id === id);
    if (index < 0) return false;
    this._emitters.splice(index, 1);
    this._emitterRevision++;
    this._localFieldRevision++;
    return true;
  }

  /** Clears all local sources while preserving macro weather state. */
  clearEmitters(): void {
    if (this._emitters.length === 0) return;
    this._emitters.length = 0;
    this._emitterRevision++;
    this._localFieldRevision++;
  }

  /** Immediately synchronizes current macro velocity with the target, useful during Scene startup. */
  snapToTarget(): void {
    copyTuple(this._targetVelocity, this._currentVelocity);
    this._velocityDerivative[0] = 0;
    this._velocityDerivative[1] = 0;
    this._velocityDerivative[2] = 0;
    this._refreshGpuContext();
  }

  /** Creates a deterministic gust now for authoring, tests and gameplay events. */
  triggerGust(amplitude = 1, durationScale = 1): void {
    validateUnitInterval("Wind gust amplitude", amplitude);
    validatePositiveFinite("Wind gust duration scale", durationScale);
    this._startGust(amplitude, this._elapsedTime, durationScale);
  }

  /** Advances macro response and deterministic gust scheduling. */
  update(deltaTime: number): void {
    validateNonNegativeFinite("WindSystem delta time", deltaTime);
    if (deltaTime > 0) {
      const previousVelocityX = this._currentVelocity[0];
      const previousVelocityZ = this._currentVelocity[2];
      this._elapsedTime += deltaTime;
      const responseTime = this.config.responseTimeSeconds;
      for (let axis = 0; axis < 3; axis++) {
        smoothDamp(
          this._currentVelocity[axis],
          this._targetVelocity[axis],
          this._velocityDerivative[axis],
          responseTime,
          deltaTime,
          this._dampingResult
        );
        this._currentVelocity[axis] = this._dampingResult.value;
        this._velocityDerivative[axis] = this._dampingResult.derivative;
      }
      // Taylor's frozen-turbulence hypothesis advects the spectrum by the time integral of
      // velocity. Multiplying the current velocity by absolute runtime introduces the
      // non-physical t * dv/dt term and makes every receiver jump when weather changes speed or
      // direction. Trapezoidal integration keeps phase continuous through those transitions.
      this._spectrumAdvectionOffsetXZ[0] += (previousVelocityX + this._currentVelocity[0]) * 0.5 * deltaTime;
      this._spectrumAdvectionOffsetXZ[1] += (previousVelocityZ + this._currentVelocity[2]) * 0.5 * deltaTime;
      this._advanceGustScheduler();
    }
    this._refreshGpuContext();
  }

  /**
   * Samples air and relative velocity at one world-space receiver, writing into reusable receiver-owned output.
   */
  sample(
    position: WindVector3Like,
    layer: WindLayer = "ground",
    receiverVelocity: WindVector3Like = ZERO_RECEIVER_VELOCITY,
    out: WindSample = createWindSample()
  ): WindSample {
    validateVector("Wind sample position", position);
    validateVector("Wind receiver velocity", receiverVelocity);
    const layerMultiplier = this.config.layerMultipliers[layer];
    const meanVelocityX = this._currentVelocity[0] * layerMultiplier;
    const meanVelocityY = this._currentVelocity[1] * layerMultiplier;
    const meanVelocityZ = this._currentVelocity[2] * layerMultiplier;
    let velocityX = meanVelocityX;
    let velocityY = meanVelocityY;
    let velocityZ = meanVelocityZ;
    const baseSpeed = Math.hypot(meanVelocityX, meanVelocityY, meanVelocityZ);
    const directionX = baseSpeed > MIN_DIRECTION_LENGTH ? meanVelocityX / baseSpeed : this._baseDirection[0];
    const directionY = baseSpeed > MIN_DIRECTION_LENGTH ? meanVelocityY / baseSpeed : this._baseDirection[1];
    const directionZ = baseSpeed > MIN_DIRECTION_LENGTH ? meanVelocityZ / baseSpeed : this._baseDirection[2];
    const gust = this._sampleGust(position);
    const gustMultiplier = 1 + gust * this._weather.gustStrength;
    velocityX *= gustMultiplier;
    velocityY *= gustMultiplier;
    velocityZ *= gustMultiplier;

    let turbulence = this._weather.turbulence;
    const spectrum = this._sampleSpectrum(position, directionX, directionZ);
    const variation = spectrum.meso * this._weather.turbulence * this.config.spectrum.directionalVariation;
    velocityX += -directionZ * baseSpeed * variation;
    velocityZ += directionX * baseSpeed * variation;
    velocityY += spectrum.micro * baseSpeed * this._weather.turbulence * 0.025;
    const strengthVariation = 1 + spectrum.macro * (0.08 + this._weather.turbulence * 0.12);
    velocityX *= strengthVariation;
    velocityY *= strengthVariation;
    velocityZ *= strengthVariation;
    turbulence = clamp01(turbulence * (0.7 + Math.abs(spectrum.micro) * 0.6));

    const localVelocity = out.localVelocityWS;
    const localTurbulence = this._sampleEmitters(position, localVelocity);
    const exposure = this._sampleExposure(position, directionX, directionY, directionZ);
    velocityX = velocityX * exposure + localVelocity[0];
    velocityY = velocityY * exposure + localVelocity[1];
    velocityZ = velocityZ * exposure + localVelocity[2];
    turbulence = clamp01(Math.max(turbulence * exposure, localTurbulence));

    out.velocityWS[0] = velocityX;
    out.velocityWS[1] = velocityY;
    out.velocityWS[2] = velocityZ;
    out.relativeVelocityWS[0] = velocityX - receiverVelocity.x;
    out.relativeVelocityWS[1] = velocityY - receiverVelocity.y;
    out.relativeVelocityWS[2] = velocityZ - receiverVelocity.z;
    out.meanVelocityWS[0] = meanVelocityX * exposure;
    out.meanVelocityWS[1] = meanVelocityY * exposure;
    out.meanVelocityWS[2] = meanVelocityZ * exposure;
    const gustScale = (gustMultiplier - 1) * exposure;
    out.gustVelocityWS[0] = meanVelocityX * gustScale;
    out.gustVelocityWS[1] = meanVelocityY * gustScale;
    out.gustVelocityWS[2] = meanVelocityZ * gustScale;
    const speed = Math.hypot(velocityX, velocityY, velocityZ);
    if (speed > MIN_DIRECTION_LENGTH) {
      out.directionWS[0] = velocityX / speed;
      out.directionWS[1] = velocityY / speed;
      out.directionWS[2] = velocityZ / speed;
    } else {
      out.directionWS[0] = directionX;
      out.directionWS[1] = directionY;
      out.directionWS[2] = directionZ;
    }
    out.speedMps = speed;
    out.gust = gust;
    out.turbulence = turbulence;
    out.exposure = exposure;
    out.layer = layer;
    out.timeSeconds = this._elapsedTime;
    return out;
  }

  /** Samples only emitters and shelter for the Tier 2 camera-centred field texture. */
  sampleLocalField(
    position: WindVector3Like,
    out: WindLocalSample = createWindLocalSample(),
    macroDirectionX = this._gpuContext.directionWS[0],
    macroDirectionY = this._gpuContext.directionWS[1],
    macroDirectionZ = this._gpuContext.directionWS[2]
  ): WindLocalSample {
    validateVector("Wind local-field position", position);
    out.turbulence = this._sampleEmitters(position, out.velocityDeltaWS);
    out.gust = 0;
    out.exposure = this._sampleExposure(position, macroDirectionX, macroDirectionY, macroDirectionZ);
    return out;
  }

  private _sampleExposure(
    position: WindVector3Like,
    macroDirectionX: number,
    macroDirectionY: number,
    macroDirectionZ: number
  ): number {
    const sampler = this._exposureSampler;
    if (!sampler) {
      return 1;
    }
    const direction = this._exposureDirection;
    direction.x = macroDirectionX;
    direction.y = macroDirectionY;
    direction.z = macroDirectionZ;
    const sampled = sampler.sampleExposure(position, direction);
    if (!Number.isFinite(sampled)) {
      throw new RangeError("Wind exposure sampler must return a finite value");
    }
    return clamp01(sampled);
  }

  private _sampleEmitters(position: WindVector3Like, velocityDeltaWS: WindVector3Tuple): number {
    let velocityX = 0;
    let velocityY = 0;
    let velocityZ = 0;
    let turbulence = 0;
    const emitters = this._emitters;
    for (let index = 0; index < emitters.length; index++) {
      const emitter = emitters[index];
      if (emitter.enabled === false) continue;
      const dx = position.x - emitter.position[0];
      const dy = position.y - emitter.position[1];
      const dz = position.z - emitter.position[2];
      const distance = Math.hypot(dx, dy, dz);
      if (distance >= emitter.radiusMeters) continue;
      const normalizedDistance = distance / emitter.radiusMeters;
      const attenuation = square(1 - smoothstep01(normalizedDistance));
      let sourceX = 0;
      let sourceY = 0;
      let sourceZ = 0;
      const horizontalLength = Math.hypot(dx, dz);
      switch (emitter.type) {
        case "directional": {
          const directionLength = Math.hypot(emitter.direction[0], emitter.direction[1], emitter.direction[2]);
          sourceX = emitter.direction[0] / directionLength;
          sourceY = emitter.direction[1] / directionLength;
          sourceZ = emitter.direction[2] / directionLength;
          break;
        }
        case "radial":
          if (horizontalLength > MIN_DIRECTION_LENGTH) {
            sourceX = dx / horizontalLength;
            sourceZ = dz / horizontalLength;
          }
          break;
        case "vortex":
          if (horizontalLength > MIN_DIRECTION_LENGTH) {
            sourceX = -dz / horizontalLength;
            sourceZ = dx / horizontalLength;
          }
          break;
        case "updraft":
          sourceY = 1;
          break;
      }
      velocityX += sourceX * emitter.strengthMps * attenuation;
      velocityY += sourceY * emitter.strengthMps * attenuation;
      velocityZ += sourceZ * emitter.strengthMps * attenuation;
      turbulence = Math.max(turbulence, emitter.turbulence * attenuation);
    }
    velocityDeltaWS[0] = velocityX;
    velocityDeltaWS[1] = velocityY;
    velocityDeltaWS[2] = velocityZ;
    return clamp01(turbulence);
  }

  /** Prepares optional spatial exposure data once before a dense local-field sampling batch. */
  prepareLocalFieldSampling(bounds: Readonly<WindLocalFieldBounds>): void {
    validateLocalFieldBounds(bounds);
    this._exposureSampler?.prepareSampling?.(bounds);
  }

  /**
   * Samples the horizontal delta packed into the camera-centred render field.
   *
   * @remarks
   * CPU receivers evaluate travelling gusts directly in {@link sample}. GPU vegetation cannot
   * afford that analytical packet loop per vertex, so the bridge reuses the local RG channels for
   * the spatial gust delta as well as emitters. The gust contribution is evaluated at canopy scale
   * (the unscaled macro velocity) and already includes shelter; receiver SLOD blends it back to the
   * reference-position gust outside the near field.
   */
  sampleRenderLocalField(position: WindVector3Like, out: WindLocalSample = createWindLocalSample()): WindLocalSample {
    this.sampleLocalField(
      position,
      out,
      this._gpuContext.directionWS[0],
      this._gpuContext.directionWS[1],
      this._gpuContext.directionWS[2]
    );
    const gust = this._sampleGust(position) * this._weather.gustStrength;
    if (gust > 0) {
      const shelteredGust = gust * out.exposure;
      out.gust = shelteredGust;
      out.velocityDeltaWS[0] += this._currentVelocity[0] * shelteredGust;
      out.velocityDeltaWS[2] += this._currentVelocity[2] * shelteredGust;
    }
    return out;
  }

  /** Raster-facing emitter/gust sample using an already cached exposure value. */
  sampleRenderDynamicLocalField(
    position: WindVector3Like,
    exposure: number,
    out: WindLocalSample = createWindLocalSample()
  ): WindLocalSample {
    validateVector("Wind dynamic local-field position", position);
    validateUnitInterval("Wind dynamic local-field exposure", exposure);
    out.turbulence = this._sampleEmitters(position, out.velocityDeltaWS);
    out.exposure = exposure;
    out.gust = 0;
    const gust = this._sampleGust(position) * this._weather.gustStrength;
    if (gust > 0) {
      const shelteredGust = gust * exposure;
      out.gust = shelteredGust;
      out.velocityDeltaWS[0] += this._currentVelocity[0] * shelteredGust;
      out.velocityDeltaWS[2] += this._currentVelocity[2] * shelteredGust;
    }
    return out;
  }

  /** Reused render-facing state; callers must not mutate the returned tuples. */
  getGpuContext(): Readonly<WindGpuContext> {
    return this._gpuContext;
  }

  /** Reused target velocity for allocation-sensitive runtime adapters. */
  getTargetVelocityWS(): readonly [number, number, number] {
    return this._targetVelocity;
  }

  /** Monotonic invalidation token for the camera-centred emitter/exposure texture. */
  getLocalFieldRevision(): number {
    this.getExposureRevision();
    return this._localFieldRevision;
  }

  /** Monotonic token changed only by local analytical emitter data. */
  getEmitterRevision(): number {
    return this._emitterRevision;
  }

  /** Allocation-free count of enabled analytical sources that still require the local wind field. */
  getActiveEmitterCount(): number {
    let count = 0;
    for (let index = 0; index < this._emitters.length; index++) {
      if (this._emitters[index].enabled !== false) count++;
    }
    return count;
  }

  /** Monotonic token changed when the fixed travelling-packet descriptors change. */
  getGustRevision(): number {
    return this._gustRevision;
  }

  /** Current authored gust multiplier used by the visual field rasterizer. */
  getRenderFieldGustStrength(): number {
    return this._weather.gustStrength;
  }

  /** Writes fixed-capacity GPU descriptors without exposing mutable simulation storage. */
  writeGpuFieldDescriptors(out: WindGpuFieldDescriptorBuffer): void {
    validateDescriptorCapacity(out, this.config.maxEmitters, this.config.maxActiveGusts);
    let emitterCount = 0;
    for (let index = 0; index < this._emitters.length; index++) {
      const emitter = this._emitters[index];
      if (emitter.enabled === false) continue;
      const offset = emitterCount * 4;
      out.emitterPositionRadius[offset] = emitter.position[0];
      out.emitterPositionRadius[offset + 1] = emitter.position[1];
      out.emitterPositionRadius[offset + 2] = emitter.position[2];
      out.emitterPositionRadius[offset + 3] = emitter.radiusMeters;
      out.emitterDirectionStrength[offset] = emitter.direction[0];
      out.emitterDirectionStrength[offset + 1] = emitter.direction[1];
      out.emitterDirectionStrength[offset + 2] = emitter.direction[2];
      out.emitterDirectionStrength[offset + 3] = emitter.strengthMps;
      out.emitterParameters[offset] = emitterTypeIndex(emitter.type);
      out.emitterParameters[offset + 1] = emitter.turbulence;
      out.emitterParameters[offset + 2] = 0;
      out.emitterParameters[offset + 3] = 0;
      emitterCount++;
    }
    let gustCount = 0;
    for (let index = 0; index < this._gusts.length; index++) {
      const gust = this._gusts[index];
      if (!gust.active) continue;
      const offset = gustCount * 4;
      out.gustOriginDirection[offset] = gust.originX;
      out.gustOriginDirection[offset + 1] = gust.originZ;
      out.gustOriginDirection[offset + 2] = gust.directionX;
      out.gustOriginDirection[offset + 3] = gust.directionZ;
      out.gustTiming[offset] = gust.startTime;
      out.gustTiming[offset + 1] = gust.duration;
      out.gustTiming[offset + 2] = gust.amplitude;
      // Negative means the packet follows its authored envelope. A non-negative timestamp starts
      // a position-local release cap in the GPU raster, matching analytical CPU sampling.
      out.gustTiming[offset + 3] = gust.releaseStartTime;
      gustCount++;
    }
    out.emitterCount = emitterCount;
    out.gustCount = gustCount;
  }

  /** Monotonic token changed by exposure binding, height data, or residency. */
  getExposureRevision(): number {
    const sourceRevision = readExposureRevision(this._exposureSampler);
    if (sourceRevision !== this._observedExposureSourceRevision) {
      this._observedExposureSourceRevision = sourceRevision;
      this._exposureRevision++;
      this._localFieldRevision++;
    }
    return this._exposureRevision;
  }

  /** Allocation-free live packet count for runtime diagnostics and bounded scheduling checks. */
  getActiveGustCount(): number {
    return this._countActiveGusts();
  }

  private _countActiveGusts(): number {
    let count = 0;
    for (let index = 0; index < this._gusts.length; index++) {
      if (this._gusts[index].active) count++;
    }
    return count;
  }

  /** Detached diagnostics suitable for tests and authoring panels. */
  getSnapshot(): WindSystemSnapshot {
    const activeGusts: WindGustSnapshot[] = [];
    for (let index = 0; index < this._gusts.length; index++) {
      const gust = this._gusts[index];
      if (!gust.active) continue;
      activeGusts.push({
        amplitude: gust.amplitude,
        elapsed: this._elapsedTime - gust.startTime,
        duration: gust.duration,
        originWS: [gust.originX, gust.originY, gust.originZ] as WindVector3Tuple
      });
    }
    return {
      velocityWS: [...this._gpuContext.velocityWS],
      directionWS: [...this._gpuContext.directionWS],
      spectrumAdvectionOffsetXZ: [...this._gpuContext.spectrumAdvectionOffsetXZ],
      layerMultipliers: [...this._gpuContext.layerMultipliers],
      targetVelocityWS: [...this._targetVelocity],
      referencePositionWS: [this._referencePosition.x, this._referencePosition.y, this._referencePosition.z],
      speedMps: this._gpuContext.speedMps,
      gust: this._gpuContext.gust,
      turbulence: this._gpuContext.turbulence,
      elapsedTime: this._gpuContext.elapsedTime,
      spectrum: { ...this.config.spectrum },
      emitterCount: this._emitters.length,
      activeGusts
    };
  }

  private _refreshTargetVelocity(): void {
    const angle = (this._weather.directionOffsetDegrees * Math.PI) / 180;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const directionX = this._baseDirection[0] * cosine + this._baseDirection[2] * sine;
    const directionZ = -this._baseDirection[0] * sine + this._baseDirection[2] * cosine;
    const speed = this._baseSpeedMps * this._weather.forceMultiplier;
    this._targetVelocity[0] = directionX * speed;
    this._targetVelocity[1] = this._baseDirection[1] * speed;
    this._targetVelocity[2] = directionZ * speed;
  }

  private _refreshGpuContext(): void {
    const context = this._gpuContext;
    const speed = Math.hypot(this._currentVelocity[0], this._currentVelocity[1], this._currentVelocity[2]);
    copyTuple(this._currentVelocity, context.velocityWS);
    if (speed > MIN_DIRECTION_LENGTH) {
      context.directionWS[0] = this._currentVelocity[0] / speed;
      context.directionWS[1] = this._currentVelocity[1] / speed;
      context.directionWS[2] = this._currentVelocity[2] / speed;
    }
    context.speedMps = speed;
    context.spectrumAdvectionOffsetXZ[0] = this._spectrumAdvectionOffsetXZ[0];
    context.spectrumAdvectionOffsetXZ[1] = this._spectrumAdvectionOffsetXZ[1];
    context.gust = this._sampleGust(this._referencePosition) * this._weather.gustStrength;
    context.turbulence = this._weather.turbulence;
    context.elapsedTime = this._elapsedTime;
  }

  private _advanceGustScheduler(): void {
    const profile = this.config.gust;
    const featherSeconds = profile.frontWidthMeters / profile.frontSpeedMps;
    const baseDuration = gustDuration(this.config);
    // A travelling packet is complete only after its tail has crossed the configured sampling
    // domain. Retiring it when the origin envelope ends truncates every downwind receiver.
    const propagationSeconds = (profile.maximumTravelDistanceMeters ?? 0) / profile.frontSpeedMps;
    for (let index = 0; index < this._gusts.length; index++) {
      const gust = this._gusts[index];
      const releaseDuration = profile.decaySeconds * (gust.duration / baseDuration);
      const releaseCompleted =
        gust.releaseStartTime >= 0 && this._elapsedTime >= gust.releaseStartTime + releaseDuration;
      if (
        gust.active &&
        (releaseCompleted || this._elapsedTime >= gust.startTime + gust.duration + featherSeconds + propagationSeconds)
      ) {
        gust.active = false;
        this._gustRevision++;
      }
    }
    if (
      this._weather.gustStrength > 0 &&
      this._elapsedTime >= this._gustSchedulingBlockedUntil &&
      !Number.isFinite(this._nextGustTime)
    ) {
      this._scheduleNextGust(this._elapsedTime);
    }
    while (
      this._weather.gustStrength > 0 &&
      this._elapsedTime >= this._gustSchedulingBlockedUntil &&
      this._elapsedTime >= this._nextGustTime
    ) {
      const scheduledTime = this._nextGustTime;
      // Keep one descriptor available for an explicit gameplay/authored gust. More importantly,
      // never replace a travelling material packet: doing so changes the air load discontinuously
      // at every receiver which has not yet seen that packet's tail.
      const automaticCapacity = this._gusts.length > 1 ? this._gusts.length - 1 : 1;
      if (this._countActiveGusts() < automaticCapacity) {
        const amplitude = lerp(this.config.gust.amplitudeMin, this.config.gust.amplitudeMax, this._nextRandom());
        this._startGust(amplitude, scheduledTime);
      }
      this._scheduleNextGust(scheduledTime);
    }
  }

  private _startGust(amplitude: number, startTime = this._elapsedTime, durationScale = 1): boolean {
    let slot: ActiveGust | null = null;
    for (let index = 0; index < this._gusts.length; index++) {
      const candidate = this._gusts[index];
      if (!candidate.active) {
        slot = candidate;
        break;
      }
    }
    // A full pool represents real packets that are still propagating through the field. Dropping
    // a new request preserves load continuity; overwriting any active packet cannot.
    if (!slot) return false;

    const direction = this._gpuContext.directionWS;
    const perpendicularOffset = (this._nextRandom() * 2 - 1) * this.config.gust.frontWidthMeters * 0.8;
    slot.active = true;
    slot.startTime = startTime;
    slot.duration = gustDuration(this.config) * lerp(0.82, 1.22, this._nextRandom()) * durationScale;
    slot.amplitude = amplitude;
    slot.releaseStartTime = -1;
    slot.originX = this._referencePosition.x - direction[2] * perpendicularOffset;
    slot.originY = this._referencePosition.y;
    slot.originZ = this._referencePosition.z + direction[0] * perpendicularOffset;
    slot.directionX = direction[0];
    slot.directionZ = direction[2];
    this._gustRevision++;
    return true;
  }

  private _scheduleNextGust(fromTime: number): void {
    const frequency = this._gustFrequencyPerMinute(this._weather.gustStrength);
    if (frequency <= 0) {
      this._nextGustTime = Number.POSITIVE_INFINITY;
      return;
    }
    const meanInterval = 60 / frequency;
    const exponentialInterval = -Math.log(Math.max(1e-6, 1 - this._nextRandom())) * meanInterval;
    this._nextGustTime = fromTime + clamp(exponentialInterval, meanInterval * 0.3, meanInterval * 2.8);
  }

  private _gustFrequencyPerMinute(gustStrength: number): number {
    return gustStrength > 0 ? this.config.gust.frequencyPerMinute * (0.45 + gustStrength * 0.55) : 0;
  }

  private _beginGustRelease(): number {
    const baseDuration = gustDuration(this.config);
    let maximumReleaseSeconds = 0;
    let changed = false;
    for (let index = 0; index < this._gusts.length; index++) {
      const gust = this._gusts[index];
      if (!gust.active) continue;
      maximumReleaseSeconds = Math.max(
        maximumReleaseSeconds,
        this.config.gust.decaySeconds * (gust.duration / baseDuration)
      );
      if (gust.releaseStartTime < 0) {
        gust.releaseStartTime = this._elapsedTime;
        changed = true;
      }
    }
    if (changed) this._gustRevision++;
    return maximumReleaseSeconds;
  }

  private _retireAllGusts(): void {
    let changed = false;
    for (let index = 0; index < this._gusts.length; index++) {
      const gust = this._gusts[index];
      if (!gust.active) continue;
      gust.active = false;
      gust.releaseStartTime = -1;
      changed = true;
    }
    if (changed) this._gustRevision++;
  }

  private _sampleGust(position: WindVector3Like): number {
    const positionX = position.x;
    const positionZ = position.z;
    const profile = this.config.gust;
    const frontFeatherSeconds = profile.frontWidthMeters / profile.frontSpeedMps;
    const baseDuration = gustDuration(this.config);
    let gust = 0;
    for (let index = 0; index < this._gusts.length; index++) {
      const active = this._gusts[index];
      if (!active.active) continue;
      const offsetX = positionX - active.originX;
      const offsetZ = positionZ - active.originZ;
      const distanceAlong = offsetX * active.directionX + offsetZ * active.directionZ;
      const distanceAcross = -offsetX * active.directionZ + offsetZ * active.directionX;
      const arrivalTime = active.startTime + distanceAlong / profile.frontSpeedMps;
      const localTime = this._elapsedTime - arrivalTime;
      const durationScale = active.duration / baseDuration;
      let envelope = gustEnvelope(
        localTime,
        profile.attackSeconds * durationScale,
        profile.holdSeconds * durationScale,
        profile.decaySeconds * durationScale,
        frontFeatherSeconds
      );
      if (active.releaseStartTime >= 0) {
        const releaseLocalTime = active.releaseStartTime - arrivalTime;
        const releaseBaseline = gustEnvelope(
          releaseLocalTime,
          profile.attackSeconds * durationScale,
          profile.holdSeconds * durationScale,
          profile.decaySeconds * durationScale,
          frontFeatherSeconds
        );
        const releaseElapsed = this._elapsedTime - active.releaseStartTime;
        const releaseDuration = profile.decaySeconds * durationScale;
        const releaseEnvelope = releaseBaseline * (1 - smoothstep01(releaseElapsed / releaseDuration));
        envelope = Math.min(envelope, releaseEnvelope);
      }
      const lateralScale = profile.frontWidthMeters * 1.35;
      const normalizedAcross = distanceAcross / lateralScale;
      const lateralEnvelope = Math.exp(-0.5 * normalizedAcross * normalizedAcross);
      gust += envelope * active.amplitude * lateralEnvelope;
    }
    return smoothMinimum(gust, MAXIMUM_GUST_MULTIPLIER, GUST_SATURATION_SOFTNESS);
  }

  private _sampleSpectrum(position: WindVector3Like, directionX: number, directionZ: number): WindSpectrumSample {
    const crossX = -directionZ;
    const crossZ = directionX;
    const advectedX = position.x - this._spectrumAdvectionOffsetXZ[0];
    const advectedZ = position.z - this._spectrumAdvectionOffsetXZ[1];
    const along = advectedX * directionX + advectedZ * directionZ;
    const across = advectedX * crossX + advectedZ * crossZ;
    const spectrum = this.config.spectrum;
    const sample = this._spectrumSample;
    sample.macro = Math.sin(along / spectrum.macroScaleMeters + Math.sin(across / 43) * 0.73);
    sample.meso = Math.sin(along / spectrum.mesoScaleMeters + across / 31 + 1.7);
    sample.micro = Math.sin(along / spectrum.microScaleMeters - across / 8.5 + 3.1);
    return sample;
  }

  private _nextRandom(): number {
    this._randomState = (Math.imul(this._randomState, 1_664_525) + 1_013_904_223) >>> 0;
    return this._randomState / 0x1_0000_0000;
  }
}

/** Creates an allocation that can be retained by a receiver and reused every frame. */
export function createWindSample(): WindSample {
  return {
    velocityWS: [0, 0, 0],
    meanVelocityWS: [0, 0, 0],
    gustVelocityWS: [0, 0, 0],
    localVelocityWS: [0, 0, 0],
    relativeVelocityWS: [0, 0, 0],
    directionWS: [1, 0, 0],
    speedMps: 0,
    gust: 0,
    turbulence: 0,
    exposure: 1,
    layer: "ground",
    timeSeconds: 0
  };
}

/** Creates one allocation-safe local-field sample. */
export function createWindLocalSample(): WindLocalSample {
  return { velocityDeltaWS: [0, 0, 0], turbulence: 0, exposure: 1, gust: 0 };
}

function resolveConfig(config: Readonly<Partial<WindSystemConfig>>): WindSystemConfig {
  const defaults = createDefaultWindSystemConfig();
  const resolved: WindSystemConfig = {
    ...defaults,
    ...config,
    baseDirection: [...(config.baseDirection ?? defaults.baseDirection)],
    layerMultipliers: { ...defaults.layerMultipliers, ...config.layerMultipliers },
    gust: { ...defaults.gust, ...config.gust },
    spectrum: { ...defaults.spectrum, ...config.spectrum }
  };
  validateConfig(resolved);
  return resolved;
}

function validateConfig(config: Readonly<WindSystemConfig>): void {
  if (!Number.isSafeInteger(config.seed)) throw new RangeError("Wind seed must be a safe integer");
  validateTuple("Wind base direction", config.baseDirection);
  validateNonNegativeFinite("Wind base speed", config.baseSpeedMps);
  validatePositiveFinite("Wind response time", config.responseTimeSeconds);
  for (const [name, value] of Object.entries(config.layerMultipliers)) {
    validateNonNegativeFinite(`Wind ${name} layer multiplier`, value);
  }
  validatePositiveFinite("Wind gust frequency", config.gust.frequencyPerMinute);
  validateUnitInterval("Wind minimum gust amplitude", config.gust.amplitudeMin);
  validateUnitInterval("Wind maximum gust amplitude", config.gust.amplitudeMax);
  if (config.gust.amplitudeMin > config.gust.amplitudeMax) {
    throw new RangeError("Wind gust amplitudeMin must not exceed amplitudeMax");
  }
  for (const [name, value] of Object.entries(config.gust)) {
    if (name.startsWith("amplitude") || name === "frequencyPerMinute") continue;
    validatePositiveFinite(`Wind gust ${name}`, value);
  }
  for (const [name, value] of Object.entries(config.spectrum)) {
    validatePositiveFinite(`Wind spectrum ${name}`, value);
  }
  if (!Number.isSafeInteger(config.maxActiveGusts) || config.maxActiveGusts <= 0) {
    throw new RangeError("Wind maxActiveGusts must be a positive safe integer");
  }
  if (!Number.isSafeInteger(config.maxEmitters) || config.maxEmitters <= 0) {
    throw new RangeError("Wind maxEmitters must be a positive safe integer");
  }
}

function validateWeatherForcing(forcing: Readonly<WeatherWindState>): void {
  if (
    !Number.isFinite(forcing.forceMultiplier) ||
    !Number.isFinite(forcing.directionOffsetDegrees) ||
    !Number.isFinite(forcing.gustStrength) ||
    !Number.isFinite(forcing.turbulence)
  ) {
    throw new RangeError("Wind weather values must be finite");
  }
  if (forcing.forceMultiplier < 0) throw new RangeError("Wind force multiplier must be non-negative");
  validateUnitInterval("Wind weather gust strength", forcing.gustStrength);
  validateUnitInterval("Wind weather turbulence", forcing.turbulence);
}

function validateEmitter(emitter: Readonly<WindEmitter>): void {
  if (!emitter.id) throw new Error("Wind emitter id is required");
  if (!["directional", "radial", "vortex", "updraft"].includes(emitter.type)) {
    throw new RangeError(`Unknown wind emitter type: ${String(emitter.type)}`);
  }
  validateTuple("Wind emitter position", emitter.position);
  validateTuple("Wind emitter direction", emitter.direction);
  if (emitter.type === "directional" && tupleLength(emitter.direction) <= MIN_DIRECTION_LENGTH) {
    throw new RangeError("Directional wind emitter requires a non-zero direction");
  }
  validatePositiveFinite("Wind emitter radius", emitter.radiusMeters);
  validateFinite("Wind emitter strength", emitter.strengthMps);
  validateUnitInterval("Wind emitter turbulence", emitter.turbulence);
  if (emitter.priority !== undefined) validateFinite("Wind emitter priority", emitter.priority);
}

function cloneEmitter(emitter: Readonly<WindEmitter>): WindEmitter {
  return {
    ...emitter,
    position: [...emitter.position],
    direction: [...emitter.direction]
  };
}

function emittersEqual(left: Readonly<WindEmitter>, right: Readonly<WindEmitter>): boolean {
  return (
    left.id === right.id &&
    left.type === right.type &&
    tuplesEqual(left.position, right.position) &&
    tuplesEqual(left.direction, right.direction) &&
    left.radiusMeters === right.radiusMeters &&
    left.strengthMps === right.strengthMps &&
    left.turbulence === right.turbulence &&
    (left.priority ?? 0) === (right.priority ?? 0) &&
    (left.enabled ?? true) === (right.enabled ?? true)
  );
}

function tuplesEqual(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function readExposureRevision(sampler: WindExposureSampler | null): number {
  const revision = sampler?.getRevision?.() ?? 0;
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new RangeError("Wind exposure revision must be a non-negative safe integer");
  }
  return revision;
}

function validateLocalFieldBounds(bounds: Readonly<WindLocalFieldBounds>): void {
  if (
    !Number.isFinite(bounds.minimumX) ||
    !Number.isFinite(bounds.minimumZ) ||
    !Number.isFinite(bounds.maximumX) ||
    !Number.isFinite(bounds.maximumZ) ||
    bounds.minimumX > bounds.maximumX ||
    bounds.minimumZ > bounds.maximumZ
  ) {
    throw new RangeError("Wind local-field bounds must be finite and ordered");
  }
}

function validateDescriptorCapacity(
  out: WindGpuFieldDescriptorBuffer,
  maximumEmitters: number,
  maximumGusts: number
): void {
  const emitterValues = maximumEmitters * 4;
  const gustValues = maximumGusts * 4;
  if (
    out.emitterPositionRadius.length < emitterValues ||
    out.emitterDirectionStrength.length < emitterValues ||
    out.emitterParameters.length < emitterValues ||
    out.gustOriginDirection.length < gustValues ||
    out.gustTiming.length < gustValues
  ) {
    throw new RangeError("Wind GPU descriptor storage is smaller than the configured fixed pools");
  }
}

function emitterTypeIndex(type: WindEmitter["type"]): number {
  switch (type) {
    case "directional":
      return 0;
    case "radial":
      return 1;
    case "vortex":
      return 2;
    case "updraft":
      return 3;
  }
}

function compareEmitterPriority(left: Readonly<WindEmitter>, right: Readonly<WindEmitter>): number {
  return (right.priority ?? 0) - (left.priority ?? 0) || left.id.localeCompare(right.id);
}

function gustEnvelope(
  localTime: number,
  attackSeconds: number,
  holdSeconds: number,
  decaySeconds: number,
  featherSeconds: number
): number {
  const effectiveAttackSeconds = attackSeconds + featherSeconds;
  if (localTime <= 0 || localTime >= effectiveAttackSeconds + holdSeconds + decaySeconds) {
    return 0;
  }
  // Arrival is causal: no receiver may react before the travelling front reaches it, and a newly
  // spawned descriptor must begin at zero load. The authored attack and the physical front width
  // are consecutive rise distances, so frontWidth/frontSpeed extends the continuous loading ramp
  // after arrival instead of preloading the receiver before localTime == 0.
  if (localTime < effectiveAttackSeconds) {
    return smoothstep01(localTime / effectiveAttackSeconds);
  }
  if (localTime < effectiveAttackSeconds + holdSeconds) return 1;
  return 1 - smoothstep01((localTime - effectiveAttackSeconds - holdSeconds) / decaySeconds);
}

function gustDuration(config: Readonly<WindSystemConfig>): number {
  return config.gust.attackSeconds + config.gust.holdSeconds + config.gust.decaySeconds;
}

function smoothDamp(
  current: number,
  target: number,
  derivative: number,
  responseTime: number,
  deltaTime: number,
  out: WindDampingResult
): void {
  const omega = 2 / responseTime;
  const x = omega * deltaTime;
  const exponential = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temporary = (derivative + omega * change) * deltaTime;
  out.value = target + (change + temporary) * exponential;
  out.derivative = (derivative - omega * temporary) * exponential;
}

function copyNormalizedDirection(direction: WindVector3Like | readonly number[], out: WindVector3Tuple): void {
  const x = "x" in direction ? direction.x : direction[0];
  const y = "y" in direction ? direction.y : direction[1];
  const z = "z" in direction ? direction.z : direction[2];
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    throw new RangeError("Wind direction must be finite");
  }
  const length = Math.hypot(x, y, z);
  if (length <= MIN_DIRECTION_LENGTH) throw new RangeError("Wind direction must be non-zero");
  out[0] = x / length;
  out[1] = y / length;
  out[2] = z / length;
}

function copyTuple(source: readonly number[], target: WindVector3Tuple): void {
  target[0] = source[0];
  target[1] = source[1];
  target[2] = source[2];
}

function validateVector(name: string, value: WindVector3Like): void {
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y) || !Number.isFinite(value.z)) {
    throw new RangeError(`${name} must be finite`);
  }
}

function validateTuple(name: string, value: readonly number[]): void {
  if (value.length !== 3 || !value.every(Number.isFinite))
    throw new RangeError(`${name} must contain three finite values`);
}

function tupleLength(value: readonly number[]): number {
  return Math.hypot(value[0], value[1], value[2]);
}

function validateFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
}

function validateNonNegativeFinite(name: string, value: number): void {
  validateFinite(name, value);
  if (value < 0) throw new RangeError(`${name} must be non-negative`);
}

function validatePositiveFinite(name: string, value: number): void {
  validateFinite(name, value);
  if (value <= 0) throw new RangeError(`${name} must be positive`);
}

function validateUnitInterval(name: string, value: number): void {
  validateFinite(name, value);
  if (value < 0 || value > 1) throw new RangeError(`${name} must be in [0, 1]`);
}

function smoothstep01(value: number): number {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
}

/** C1-continuous upper saturation: linear below the knee and zero-slope at the hard ceiling. */
function smoothMinimum(left: number, right: number, softness: number): number {
  const blend = Math.max(softness - Math.abs(left - right), 0) / softness;
  return Math.min(left, right) - blend * blend * softness * 0.25;
}

function square(value: number): number {
  return value * value;
}

function lerp(from: number, to: number, value: number): number {
  return from + (to - from) * value;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
