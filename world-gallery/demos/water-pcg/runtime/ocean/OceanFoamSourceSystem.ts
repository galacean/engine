import type { OceanNearshoreFieldResource } from "./OceanNearshoreFieldResource";
import type { OceanNearshoreStateField } from "./OceanNearshoreStateField";
import type { TemporalFoamField } from "../interaction/TemporalFoamField";
import {
  isValidWaterFoamSource,
  WaterFoamBlendMode,
  WaterFoamSourceKind,
  type WaterFoamBoundedSource
} from "../interaction/WaterFoamTypes";

export interface OceanFoamSourceSystemOptions {
  readonly bodyId: string;
  readonly pointSourceCapacity?: number;
  readonly breakerIntensity?: number;
  readonly shoreIntensity?: number;
  readonly shoreBandWidth?: number;
  /** Centre of the persistent shore wash measured seaward from the dry boundary. */
  readonly shoreSeawardOffset?: number;
}

export interface OceanFoamSourceSystemMetrics {
  readonly enabled: boolean;
  readonly analyticWhitecapEnabled: boolean;
  readonly breakerSourceEnabled: boolean;
  readonly shoreSourceEnabled: boolean;
  readonly pointSourceCapacity: number;
  readonly queuedPointSourceCount: number;
  readonly acceptedPointSourceCount: number;
  readonly droppedPointSourceCount: number;
  readonly overflowCount: number;
  readonly replacedCount: number;
  readonly consumedPointSourceCount: number;
  readonly updateCount: number;
  readonly idleSkipCount: number;
  readonly sourceRevision: number;
  readonly breakerSourcePixelCount: number;
  readonly shoreSourcePixelCount: number;
  readonly obstacleInjectionCount: number;
  readonly impactInjectionCount: number;
  readonly wakeInjectionCount: number;
  readonly sourcePeak: number;
  readonly currentSurfaceQueryCount: 0;
  readonly resourceBytes: number;
}

interface MutableOceanFoamSourceSystemMetrics {
  enabled: boolean;
  analyticWhitecapEnabled: boolean;
  breakerSourceEnabled: boolean;
  shoreSourceEnabled: boolean;
  pointSourceCapacity: number;
  queuedPointSourceCount: number;
  acceptedPointSourceCount: number;
  droppedPointSourceCount: number;
  overflowCount: number;
  replacedCount: number;
  consumedPointSourceCount: number;
  updateCount: number;
  idleSkipCount: number;
  sourceRevision: number;
  breakerSourcePixelCount: number;
  shoreSourcePixelCount: number;
  obstacleInjectionCount: number;
  impactInjectionCount: number;
  wakeInjectionCount: number;
  sourcePeak: number;
  currentSurfaceQueryCount: 0;
  resourceBytes: number;
}

const DEFAULT_POINT_SOURCE_CAPACITY = 32;
const DEFAULT_BREAKER_INTENSITY = 0.92;
const DEFAULT_SHORE_INTENSITY = 0.7;
const DEFAULT_SHORE_BAND_WIDTH = 1.8;
const DEFAULT_SHORE_SEAWARD_OFFSET = 4.5;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(minimum: number, maximum: number, value: number): number {
  const t = clamp01((value - minimum) / Math.max(maximum - minimum, 1e-8));
  return t * t * (3 - 2 * t);
}

function sourceKindCode(kind: WaterFoamSourceKind): number {
  switch (kind) {
    case WaterFoamSourceKind.Breaker:
      return 1;
    case WaterFoamSourceKind.Shore:
      return 2;
    case WaterFoamSourceKind.Obstacle:
      return 3;
    case WaterFoamSourceKind.Impact:
      return 4;
    case WaterFoamSourceKind.Wake:
      return 5;
    default:
      return 0;
  }
}

function sourceKindFromCode(code: number): WaterFoamSourceKind {
  switch (code) {
    case 1:
      return WaterFoamSourceKind.Breaker;
    case 2:
      return WaterFoamSourceKind.Shore;
    case 3:
      return WaterFoamSourceKind.Obstacle;
    case 4:
      return WaterFoamSourceKind.Impact;
    case 5:
      return WaterFoamSourceKind.Wake;
    default:
      return WaterFoamSourceKind.Shore;
  }
}

/** Bounded merger for procedural nearshore and sparse typed foam sources. */
export class OceanFoamSourceSystem {
  readonly metrics: OceanFoamSourceSystemMetrics;
  private readonly _bodyId: string;
  private readonly _breakerIntensity: number;
  private readonly _shoreIntensity: number;
  private readonly _shoreBandWidth: number;
  private readonly _shoreSeawardOffset: number;
  private readonly _mutableMetrics: MutableOceanFoamSourceSystemMetrics;
  private _proceduralSource?: Uint8Array;
  private _kinds?: Uint8Array;
  private _worldX?: Float32Array;
  private _worldZ?: Float32Array;
  private _radius?: Float32Array;
  private _intensity?: Float32Array;
  private _lifetime?: Float32Array;
  private _priority?: Float32Array;
  private _blend?: Uint8Array;
  private _pointSourceCount = 0;
  private _lastStateRevision = -1;
  private _enabled = true;
  private _breakerSourceEnabled = true;
  private _shoreSourceEnabled = true;
  private _destroyed = false;

  constructor(
    readonly resource: OceanNearshoreFieldResource,
    readonly state: OceanNearshoreStateField,
    readonly field: TemporalFoamField,
    options: Readonly<OceanFoamSourceSystemOptions>
  ) {
    const pointSourceCapacity =
      options.pointSourceCapacity ?? DEFAULT_POINT_SOURCE_CAPACITY;
    if (
      options.bodyId.length === 0 ||
      !Number.isSafeInteger(pointSourceCapacity) ||
      pointSourceCapacity < 1
    ) {
      throw new Error("Ocean foam source system options are invalid.");
    }
    this._bodyId = options.bodyId;
    this._breakerIntensity = clamp01(
      options.breakerIntensity ?? DEFAULT_BREAKER_INTENSITY
    );
    this._shoreIntensity = clamp01(
      options.shoreIntensity ?? DEFAULT_SHORE_INTENSITY
    );
    this._shoreBandWidth = Math.max(
      0.1,
      options.shoreBandWidth ?? DEFAULT_SHORE_BAND_WIDTH
    );
    this._shoreSeawardOffset = Math.max(
      0,
      options.shoreSeawardOffset ??
        DEFAULT_SHORE_SEAWARD_OFFSET
    );
    const pixelCount = field.resolutionX * field.resolutionZ;
    this._proceduralSource = new Uint8Array(pixelCount);
    this._kinds = new Uint8Array(pointSourceCapacity);
    this._worldX = new Float32Array(pointSourceCapacity);
    this._worldZ = new Float32Array(pointSourceCapacity);
    this._radius = new Float32Array(pointSourceCapacity);
    this._intensity = new Float32Array(pointSourceCapacity);
    this._lifetime = new Float32Array(pointSourceCapacity);
    this._priority = new Float32Array(pointSourceCapacity);
    this._blend = new Uint8Array(pointSourceCapacity);
    const resourceBytes =
      this._proceduralSource.byteLength +
      this._kinds.byteLength +
      this._worldX.byteLength +
      this._worldZ.byteLength +
      this._radius.byteLength +
      this._intensity.byteLength +
      this._lifetime.byteLength +
      this._priority.byteLength +
      this._blend.byteLength;
    this._mutableMetrics = {
      enabled: true,
      analyticWhitecapEnabled: true,
      breakerSourceEnabled: true,
      shoreSourceEnabled: true,
      pointSourceCapacity,
      queuedPointSourceCount: 0,
      acceptedPointSourceCount: 0,
      droppedPointSourceCount: 0,
      overflowCount: 0,
      replacedCount: 0,
      consumedPointSourceCount: 0,
      updateCount: 0,
      idleSkipCount: 0,
      sourceRevision: -1,
      breakerSourcePixelCount: 0,
      shoreSourcePixelCount: 0,
      obstacleInjectionCount: 0,
      impactInjectionCount: 0,
      wakeInjectionCount: 0,
      sourcePeak: 0,
      currentSurfaceQueryCount: 0,
      resourceBytes
    };
    this.metrics = this._mutableMetrics;
  }

  enqueue(source: Readonly<WaterFoamBoundedSource>): boolean {
    if (
      this._destroyed ||
      !this._enabled ||
      source.bodyId !== this._bodyId ||
      !isValidWaterFoamSource(source)
    ) {
      return false;
    }
    return this.enqueueBounded(
      source.kind,
      source.range.worldX,
      source.range.worldZ,
      source.range.radius,
      source.intensity,
      source.lifetimeSeconds,
      source.priority,
      source.blend
    );
  }

  enqueueBounded(
    kind: WaterFoamSourceKind,
    worldX: number,
    worldZ: number,
    radius: number,
    intensity: number,
    lifetimeSeconds: number,
    priority: number,
    blend: WaterFoamBlendMode
  ): boolean {
    if (
      this._destroyed ||
      !this._enabled ||
      kind === WaterFoamSourceKind.Whitecap ||
      !Number.isFinite(worldX) ||
      !Number.isFinite(worldZ) ||
      !Number.isFinite(radius) ||
      radius <= 0 ||
      !Number.isFinite(intensity) ||
      intensity <= 0 ||
      !Number.isFinite(lifetimeSeconds) ||
      lifetimeSeconds < 0 ||
      !Number.isFinite(priority)
    ) {
      return false;
    }
    const slot = this._reservePointSource(priority);
    if (slot < 0) return false;
    this._requireArray(this._kinds)[slot] = sourceKindCode(kind);
    this._requireArray(this._worldX)[slot] = worldX;
    this._requireArray(this._worldZ)[slot] = worldZ;
    this._requireArray(this._radius)[slot] = radius;
    this._requireArray(this._intensity)[slot] = clamp01(intensity);
    this._requireArray(this._lifetime)[slot] = lifetimeSeconds;
    this._requireArray(this._priority)[slot] = priority;
    this._requireArray(this._blend)[slot] =
      blend === WaterFoamBlendMode.Maximum ? 1 : 0;
    this._mutableMetrics.acceptedPointSourceCount++;
    this._mutableMetrics.queuedPointSourceCount = this._pointSourceCount;
    return true;
  }

  update(): boolean {
    this._assertAlive();
    if (!this._enabled) {
      this._mutableMetrics.idleSkipCount++;
      return false;
    }
    const stateRevision = this.state.metrics.revision;
    const rebuildProcedural = stateRevision !== this._lastStateRevision;
    if (!rebuildProcedural && this._pointSourceCount === 0) {
      this._mutableMetrics.idleSkipCount++;
      return false;
    }
    let injected = false;
    if (rebuildProcedural) {
      this._buildProceduralSource();
      injected = this.field.addSourceBuffer(
        this._requireArray(this._proceduralSource),
        WaterFoamBlendMode.Maximum
      );
      this._lastStateRevision = stateRevision;
      this._mutableMetrics.sourceRevision = stateRevision;
    }
    const kinds = this._requireArray(this._kinds);
    const worldX = this._requireArray(this._worldX);
    const worldZ = this._requireArray(this._worldZ);
    const radius = this._requireArray(this._radius);
    const intensity = this._requireArray(this._intensity);
    const lifetime = this._requireArray(this._lifetime);
    const blend = this._requireArray(this._blend);
    for (let index = 0; index < this._pointSourceCount; index++) {
      const kind = sourceKindFromCode(kinds[index]);
      const lifetimeScale = Math.min(
        1.5,
        Math.max(0.25, lifetime[index] / 2)
      );
      const touched = this.field.addSourceWorld(
        worldX[index],
        worldZ[index],
        radius[index],
        intensity[index] * lifetimeScale,
        blend[index] === 1
          ? WaterFoamBlendMode.Maximum
          : WaterFoamBlendMode.Add
      );
      injected = touched || injected;
      if (touched) this._countInjection(kind);
    }
    this._mutableMetrics.consumedPointSourceCount +=
      this._pointSourceCount;
    this._pointSourceCount = 0;
    this._mutableMetrics.queuedPointSourceCount = 0;
    this._mutableMetrics.updateCount++;
    return injected;
  }

  setEnabled(enabled: boolean): void {
    this._assertAlive();
    if (enabled === this._enabled) return;
    this._enabled = enabled;
    this._mutableMetrics.enabled = enabled;
    this._mutableMetrics.analyticWhitecapEnabled = enabled;
    this._pointSourceCount = 0;
    this._mutableMetrics.queuedPointSourceCount = 0;
    this._lastStateRevision = -1;
    if (!enabled) {
      this.field.clear();
      this._requireArray(this._proceduralSource).fill(0);
      this._mutableMetrics.breakerSourcePixelCount = 0;
      this._mutableMetrics.shoreSourcePixelCount = 0;
      this._mutableMetrics.sourcePeak = 0;
    }
  }

  setBreakerSourceEnabled(enabled: boolean): void {
    this._assertAlive();
    if (enabled === this._breakerSourceEnabled) return;
    this._breakerSourceEnabled = enabled;
    this._mutableMetrics.breakerSourceEnabled = enabled;
    this._mutableMetrics.breakerSourcePixelCount = 0;
    this._lastStateRevision = -1;
  }

  setShoreSourceEnabled(enabled: boolean): void {
    this._assertAlive();
    if (enabled === this._shoreSourceEnabled) return;
    this._shoreSourceEnabled = enabled;
    this._mutableMetrics.shoreSourceEnabled = enabled;
    this._mutableMetrics.shoreSourcePixelCount = 0;
    this._lastStateRevision = -1;
  }

  reset(): void {
    this._assertAlive();
    this.field.clear();
    this._requireArray(this._proceduralSource).fill(0);
    this._pointSourceCount = 0;
    this._lastStateRevision = -1;
    this._mutableMetrics.queuedPointSourceCount = 0;
    this._mutableMetrics.sourceRevision = -1;
    this._mutableMetrics.breakerSourcePixelCount = 0;
    this._mutableMetrics.shoreSourcePixelCount = 0;
    this._mutableMetrics.sourcePeak = 0;
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._proceduralSource = undefined;
    this._kinds = undefined;
    this._worldX = undefined;
    this._worldZ = undefined;
    this._radius = undefined;
    this._intensity = undefined;
    this._lifetime = undefined;
    this._priority = undefined;
    this._blend = undefined;
    this._pointSourceCount = 0;
    this._mutableMetrics.enabled = false;
    this._mutableMetrics.analyticWhitecapEnabled = false;
    this._mutableMetrics.breakerSourceEnabled = false;
    this._mutableMetrics.shoreSourceEnabled = false;
    this._mutableMetrics.queuedPointSourceCount = 0;
    this._mutableMetrics.resourceBytes = 0;
  }

  private _buildProceduralSource(): void {
    const source = this._requireArray(this._proceduralSource);
    source.fill(0);
    const statePixels = this.state.stateUploadBuffer;
    const resourceWidth = this.resource.metadata.width;
    const resourceHeight = this.resource.metadata.height;
    let runupFrontDistance = 0;
    let hasThinFilm = false;
    for (let index = 0; index < resourceWidth * resourceHeight; index++) {
      if (
        this.resource.wetMaskAt(index) === 0 &&
        statePixels[index * 4 + 1] >= 128
      ) {
        const distance = this.resource.shoreDistanceAt(index);
        if (!hasThinFilm || distance < runupFrontDistance) {
          runupFrontDistance = distance;
          hasThinFilm = true;
        }
      }
    }
    let breakerCount = 0;
    let shoreCount = 0;
    let sourcePeak = 0;
    for (let z = 0; z < this.field.resolutionZ; z++) {
      const resourceZ = Math.min(
        resourceHeight - 1,
        Math.floor(((z + 0.5) / this.field.resolutionZ) * resourceHeight)
      );
      for (let x = 0; x < this.field.resolutionX; x++) {
        const resourceX = Math.min(
          resourceWidth - 1,
          Math.floor(
            ((x + 0.5) / this.field.resolutionX) * resourceWidth
          )
        );
        const resourceIndex = resourceZ * resourceWidth + resourceX;
        const stateOffset = resourceIndex * 4;
        const staticWet = this.resource.wetMaskAt(resourceIndex) === 1;
        const occupied = statePixels[stateOffset + 1] >= 128;
        const breaker = statePixels[stateOffset] / 255;
        const shoreDistance =
          this.resource.shoreDistanceAt(resourceIndex);
        const breakerSource = this._breakerSourceEnabled && staticWet
          ? smoothstep(0.12, 0.72, breaker) *
            this._breakerIntensity
          : 0;
        const staticShore =
          staticWet
            ? 1 -
              smoothstep(
                0,
                this._shoreBandWidth,
                Math.abs(
                  shoreDistance -
                    this._shoreSeawardOffset
                )
              )
            : 0;
        const dynamicShore =
          hasThinFilm &&
          !staticWet &&
          occupied
            ? 1 -
              smoothstep(
                0,
                this._shoreBandWidth,
                Math.abs(shoreDistance - runupFrontDistance)
              )
            : 0;
        const shoreSource = this._shoreSourceEnabled
          ? Math.max(staticShore, dynamicShore) * this._shoreIntensity
          : 0;
        const value = clamp01(Math.max(breakerSource, shoreSource));
        source[z * this.field.resolutionX + x] = Math.round(
          value * 255
        );
        if (breakerSource > 1 / 255) breakerCount++;
        if (shoreSource > 1 / 255) shoreCount++;
        sourcePeak = Math.max(sourcePeak, value);
      }
    }
    this._mutableMetrics.breakerSourcePixelCount = breakerCount;
    this._mutableMetrics.shoreSourcePixelCount = shoreCount;
    this._mutableMetrics.sourcePeak = sourcePeak;
  }

  private _reservePointSource(priority: number): number {
    const capacity = this._mutableMetrics.pointSourceCapacity;
    if (this._pointSourceCount < capacity) {
      return this._pointSourceCount++;
    }
    this._mutableMetrics.overflowCount++;
    const priorities = this._requireArray(this._priority);
    let weakestIndex = 0;
    let weakestPriority = priorities[0];
    for (let index = 1; index < capacity; index++) {
      if (priorities[index] < weakestPriority) {
        weakestIndex = index;
        weakestPriority = priorities[index];
      }
    }
    this._mutableMetrics.droppedPointSourceCount++;
    if (priority <= weakestPriority) return -1;
    this._mutableMetrics.replacedCount++;
    return weakestIndex;
  }

  private _countInjection(kind: WaterFoamSourceKind): void {
    switch (kind) {
      case WaterFoamSourceKind.Obstacle:
        this._mutableMetrics.obstacleInjectionCount++;
        break;
      case WaterFoamSourceKind.Impact:
        this._mutableMetrics.impactInjectionCount++;
        break;
      case WaterFoamSourceKind.Wake:
        this._mutableMetrics.wakeInjectionCount++;
        break;
    }
  }

  private _requireArray<T extends Uint8Array | Float32Array>(
    value: T | undefined
  ): T {
    if (!value) throw new Error("Ocean foam source system has been destroyed.");
    return value;
  }

  private _assertAlive(): void {
    if (this._destroyed) {
      throw new Error("Ocean foam source system has been destroyed.");
    }
  }
}
