import {
  createWaterCurrentFieldSample,
  sampleWaterCurrentFieldSnapshot,
  type WaterCurrentFieldSnapshot,
  type WaterCurrentFieldSnapshotKind
} from "./WaterCurrentFieldSnapshot";

export interface TemporalFoamFieldOptions {
  readonly centerX: number;
  readonly centerZ: number;
  readonly length: number;
  readonly width: number;
  readonly resolutionX: number;
  readonly resolutionZ: number;
  readonly decayRatePerSecond: number;
  readonly minimumVisibleIntensity?: number;
}

export interface TemporalFoamFieldMetrics {
  readonly updateCount: number;
  readonly idleSkipCount: number;
  readonly sourceInjectionCount: number;
  readonly sourcePixelCount: number;
  readonly activeHistoryPixelCount: number;
  readonly peakHistoryValue: number;
  readonly historyEnergy: number;
  readonly activeLifetimeSeconds: number;
  readonly lastLifetimeSeconds: number;
  readonly maximumLifetimeSeconds: number;
  readonly centroidWorldX: number;
  readonly centroidWorldZ: number;
  readonly centroidDriftDistance: number;
  readonly regionShiftCount: number;
  readonly currentSnapshotKind: WaterCurrentFieldSnapshotKind | "none";
  readonly currentSnapshotRevision: number;
  readonly currentLookupCount: number;
  /** Dense foam simulation is structurally isolated from expensive point-surface queries. */
  readonly currentSurfaceQueryCount: 0;
}

interface MutableTemporalFoamFieldMetrics {
  updateCount: number;
  idleSkipCount: number;
  sourceInjectionCount: number;
  sourcePixelCount: number;
  activeHistoryPixelCount: number;
  peakHistoryValue: number;
  historyEnergy: number;
  activeLifetimeSeconds: number;
  lastLifetimeSeconds: number;
  maximumLifetimeSeconds: number;
  centroidWorldX: number;
  centroidWorldZ: number;
  centroidDriftDistance: number;
  regionShiftCount: number;
  currentSnapshotKind: WaterCurrentFieldSnapshotKind | "none";
  currentSnapshotRevision: number;
  currentLookupCount: number;
  currentSurfaceQueryCount: 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

const _historySubByteScale = 256;
const _maximumHistorySubByteValue = 255 * _historySubByteScale;

function validateOptions(options: TemporalFoamFieldOptions): void {
  if (
    !Number.isFinite(options.centerX) ||
    !Number.isFinite(options.centerZ) ||
    !Number.isFinite(options.length) ||
    options.length <= 0 ||
    !Number.isFinite(options.width) ||
    options.width <= 0 ||
    !Number.isInteger(options.resolutionX) ||
    options.resolutionX < 2 ||
    !Number.isInteger(options.resolutionZ) ||
    options.resolutionZ < 2 ||
    !Number.isFinite(options.decayRatePerSecond) ||
    options.decayRatePerSecond < 0 ||
    !Number.isFinite(options.minimumVisibleIntensity ?? 1 / 255) ||
    (options.minimumVisibleIntensity ?? 1 / 255) < 0 ||
    (options.minimumVisibleIntensity ?? 1 / 255) > 1
  ) {
    throw new Error("Temporal foam field options are invalid.");
  }
}

/** CPU reference for body-local R8 foam uploads and future GPU parity tests. */
export class TemporalFoamField {
  readonly resolutionX: number;
  readonly resolutionZ: number;
  readonly length: number;
  readonly width: number;
  readonly texelSizeX: number;
  readonly texelSizeZ: number;
  readonly decayRatePerSecond: number;
  readonly metrics: TemporalFoamFieldMetrics;

  private readonly _mutableMetrics: MutableTemporalFoamFieldMetrics = {
    updateCount: 0,
    idleSkipCount: 0,
    sourceInjectionCount: 0,
    sourcePixelCount: 0,
    activeHistoryPixelCount: 0,
    peakHistoryValue: 0,
    historyEnergy: 0,
    activeLifetimeSeconds: 0,
    lastLifetimeSeconds: 0,
    maximumLifetimeSeconds: 0,
    centroidWorldX: 0,
    centroidWorldZ: 0,
    centroidDriftDistance: 0,
    regionShiftCount: 0,
    currentSnapshotKind: "none",
    currentSnapshotRevision: -1,
    currentLookupCount: 0,
    currentSurfaceQueryCount: 0
  };
  private readonly _source: Uint8Array;
  private readonly _sourceScratch: Uint8Array;
  private readonly _historyUpload: Uint8Array;
  private readonly _currentSample = createWaterCurrentFieldSample();
  /** Q8.8 histories retain sub-byte decay so R8 quantization cannot create an immortal tail. */
  private _historyCurrent: Uint16Array;
  private _historyNext: Uint16Array;
  private _centerX: number;
  private _centerZ: number;
  private readonly _minimumVisibleSubByte: number;
  private _centroidOriginX = 0;
  private _centroidOriginZ = 0;

  constructor(options: TemporalFoamFieldOptions) {
    validateOptions(options);
    this.resolutionX = options.resolutionX;
    this.resolutionZ = options.resolutionZ;
    this.length = options.length;
    this.width = options.width;
    this.texelSizeX = options.length / options.resolutionX;
    this.texelSizeZ = options.width / options.resolutionZ;
    this.decayRatePerSecond = options.decayRatePerSecond;
    this._centerX = this._snapX(options.centerX);
    this._centerZ = this._snapZ(options.centerZ);
    this._minimumVisibleSubByte = Math.ceil((options.minimumVisibleIntensity ?? 1 / 255) * _maximumHistorySubByteValue);
    const pixelCount = options.resolutionX * options.resolutionZ;
    this._source = new Uint8Array(pixelCount);
    this._sourceScratch = new Uint8Array(pixelCount);
    this._historyUpload = new Uint8Array(pixelCount);
    this._historyCurrent = new Uint16Array(pixelCount);
    this._historyNext = new Uint16Array(pixelCount);
    this.metrics = this._mutableMetrics;
  }

  get centerX(): number {
    return this._centerX;
  }

  get centerZ(): number {
    return this._centerZ;
  }

  get historyBuffer(): Uint8Array {
    return this._historyUpload;
  }

  get sourceBuffer(): Uint8Array {
    return this._source;
  }

  get isIdle(): boolean {
    return this._mutableMetrics.sourcePixelCount === 0 && this._mutableMetrics.activeHistoryPixelCount === 0;
  }

  addSourceWorld(worldX: number, worldZ: number, radius: number, intensity: number): boolean {
    if (
      !Number.isFinite(worldX) ||
      !Number.isFinite(worldZ) ||
      !Number.isFinite(radius) ||
      radius <= 0 ||
      !Number.isFinite(intensity) ||
      intensity <= 0
    ) {
      return false;
    }
    const clampedIntensity = clamp(intensity, 0, 1);
    const minimumX = Math.max(0, Math.floor(this._worldToPixelX(worldX - radius)));
    const maximumX = Math.min(this.resolutionX - 1, Math.ceil(this._worldToPixelX(worldX + radius)));
    const minimumZ = Math.max(0, Math.floor(this._worldToPixelZ(worldZ - radius)));
    const maximumZ = Math.min(this.resolutionZ - 1, Math.ceil(this._worldToPixelZ(worldZ + radius)));
    let touched = false;
    for (let z = minimumZ; z <= maximumZ; z++) {
      const sampleZ = this._pixelToWorldZ(z);
      for (let x = minimumX; x <= maximumX; x++) {
        const sampleX = this._pixelToWorldX(x);
        const distance = Math.hypot(sampleX - worldX, sampleZ - worldZ);
        if (distance >= radius) continue;
        const contribution = Math.round(clampedIntensity * (1 - distance / radius) * 255);
        if (contribution <= 0) continue;
        const index = z * this.resolutionX + x;
        const previous = this._source[index];
        const next = Math.min(255, previous + contribution);
        if (next === previous) continue;
        if (previous === 0) this._mutableMetrics.sourcePixelCount++;
        this._source[index] = next;
        touched = true;
      }
    }
    if (touched) this._mutableMetrics.sourceInjectionCount++;
    return touched;
  }

  step(deltaTime: number, currentSnapshot?: WaterCurrentFieldSnapshot): boolean {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) return false;
    const metrics = this._mutableMetrics;
    metrics.currentSnapshotKind = currentSnapshot?.kind ?? "none";
    metrics.currentSnapshotRevision = currentSnapshot?.revision ?? -1;
    if (metrics.sourcePixelCount === 0 && metrics.activeHistoryPixelCount === 0) {
      metrics.idleSkipCount++;
      return false;
    }

    const decay = Math.exp(-this.decayRatePerSecond * deltaTime);
    const wasActive = metrics.activeHistoryPixelCount > 0;
    let activeCount = 0;
    let peakValue = 0;
    let historyEnergySubBytes = 0;
    let weightedWorldX = 0;
    let weightedWorldZ = 0;
    const uniformCurrentX = currentSnapshot?.kind === "uniform" ? currentSnapshot.currentX : 0;
    const uniformCurrentZ = currentSnapshot?.kind === "uniform" ? currentSnapshot.currentZ : 0;
    if (currentSnapshot?.kind === "uniform") metrics.currentLookupCount++;
    for (let z = 0; z < this.resolutionZ; z++) {
      const worldZ = this._pixelToWorldZ(z);
      for (let x = 0; x < this.resolutionX; x++) {
        const index = z * this.resolutionX + x;
        const worldX = this._pixelToWorldX(x);
        let currentX = uniformCurrentX;
        let currentZ = uniformCurrentZ;
        if (currentSnapshot?.kind === "grid") {
          metrics.currentLookupCount++;
          if (sampleWaterCurrentFieldSnapshot(currentSnapshot, worldX, worldZ, this._currentSample)) {
            currentX = this._currentSample.currentX;
            currentZ = this._currentSample.currentZ;
          } else {
            currentX = 0;
            currentZ = 0;
          }
        }
        const previous = this._sampleHistorySubByteWorld(worldX - currentX * deltaTime, worldZ - currentZ * deltaTime);
        const source = this._source[index];
        let next = Math.round(previous * decay + source * _historySubByteScale);
        next = Math.min(_maximumHistorySubByteValue, next);
        if (this.decayRatePerSecond > 0 && source === 0 && previous > 0 && next >= previous) {
          next = Math.max(0, Math.ceil(previous) - 1);
        }
        if (next < this._minimumVisibleSubByte) next = 0;
        this._historyNext[index] = next;
        this._historyUpload[index] = Math.min(255, Math.round(next / _historySubByteScale));
        if (next > 0) {
          activeCount++;
          historyEnergySubBytes += next;
          weightedWorldX += worldX * next;
          weightedWorldZ += worldZ * next;
        }
        peakValue = Math.max(peakValue, next);
      }
    }

    const previousHistory = this._historyCurrent;
    this._historyCurrent = this._historyNext;
    this._historyNext = previousHistory;
    this._source.fill(0);
    metrics.sourcePixelCount = 0;
    metrics.activeHistoryPixelCount = activeCount;
    metrics.peakHistoryValue = peakValue / _maximumHistorySubByteValue;
    metrics.historyEnergy = historyEnergySubBytes / _maximumHistorySubByteValue;
    if (activeCount > 0 && historyEnergySubBytes > 0) {
      const centroidX = weightedWorldX / historyEnergySubBytes;
      const centroidZ = weightedWorldZ / historyEnergySubBytes;
      if (!wasActive) {
        this._centroidOriginX = centroidX;
        this._centroidOriginZ = centroidZ;
        metrics.activeLifetimeSeconds = 0;
      }
      metrics.activeLifetimeSeconds += deltaTime;
      metrics.maximumLifetimeSeconds = Math.max(metrics.maximumLifetimeSeconds, metrics.activeLifetimeSeconds);
      metrics.centroidWorldX = centroidX;
      metrics.centroidWorldZ = centroidZ;
      metrics.centroidDriftDistance = Math.hypot(centroidX - this._centroidOriginX, centroidZ - this._centroidOriginZ);
    } else if (wasActive) {
      metrics.lastLifetimeSeconds = metrics.activeLifetimeSeconds + deltaTime;
      metrics.maximumLifetimeSeconds = Math.max(metrics.maximumLifetimeSeconds, metrics.lastLifetimeSeconds);
      metrics.activeLifetimeSeconds = 0;
    }
    metrics.updateCount++;
    return true;
  }

  sampleWorld(worldX: number, worldZ: number): number {
    return this._sampleHistorySubByteWorld(worldX, worldZ) / _maximumHistorySubByteValue;
  }

  setRegionCenter(centerX: number, centerZ: number): boolean {
    if (!Number.isFinite(centerX) || !Number.isFinite(centerZ)) return false;
    const snappedX = this._snapX(centerX);
    const snappedZ = this._snapZ(centerZ);
    const shiftX = Math.round((snappedX - this._centerX) / this.texelSizeX);
    const shiftZ = Math.round((snappedZ - this._centerZ) / this.texelSizeZ);
    if (shiftX === 0 && shiftZ === 0) return false;
    this._shiftBuffer(this._historyCurrent, this._historyNext, shiftX, shiftZ);
    const previousHistory = this._historyCurrent;
    this._historyCurrent = this._historyNext;
    this._historyNext = previousHistory;
    this._syncHistoryUpload();
    this._shiftBuffer(this._source, this._sourceScratch, shiftX, shiftZ);
    this._source.set(this._sourceScratch);
    this._centerX = snappedX;
    this._centerZ = snappedZ;
    this._mutableMetrics.activeHistoryPixelCount = this._countActive(this._historyCurrent);
    this._mutableMetrics.sourcePixelCount = this._countActive(this._source);
    this._mutableMetrics.regionShiftCount++;
    return true;
  }

  clear(): void {
    this._source.fill(0);
    this._sourceScratch.fill(0);
    this._historyCurrent.fill(0);
    this._historyNext.fill(0);
    this._historyUpload.fill(0);
    this._mutableMetrics.sourcePixelCount = 0;
    this._mutableMetrics.activeHistoryPixelCount = 0;
    this._mutableMetrics.peakHistoryValue = 0;
    this._mutableMetrics.historyEnergy = 0;
    this._mutableMetrics.activeLifetimeSeconds = 0;
    this._mutableMetrics.lastLifetimeSeconds = 0;
    this._mutableMetrics.maximumLifetimeSeconds = 0;
    this._mutableMetrics.centroidWorldX = 0;
    this._mutableMetrics.centroidWorldZ = 0;
    this._mutableMetrics.centroidDriftDistance = 0;
    this._centroidOriginX = 0;
    this._centroidOriginZ = 0;
  }

  private _sampleHistorySubByteWorld(worldX: number, worldZ: number): number {
    const pixelX = this._worldToPixelX(worldX);
    const pixelZ = this._worldToPixelZ(worldZ);
    if (pixelX < 0 || pixelZ < 0 || pixelX > this.resolutionX - 1 || pixelZ > this.resolutionZ - 1) return 0;
    const x0 = Math.min(this.resolutionX - 2, Math.floor(pixelX));
    const z0 = Math.min(this.resolutionZ - 2, Math.floor(pixelZ));
    const x1 = x0 + 1;
    const z1 = z0 + 1;
    const blendX = clamp(pixelX - x0, 0, 1);
    const blendZ = clamp(pixelZ - z0, 0, 1);
    const bottom =
      this._historyCurrent[z0 * this.resolutionX + x0] * (1 - blendX) +
      this._historyCurrent[z0 * this.resolutionX + x1] * blendX;
    const top =
      this._historyCurrent[z1 * this.resolutionX + x0] * (1 - blendX) +
      this._historyCurrent[z1 * this.resolutionX + x1] * blendX;
    return bottom * (1 - blendZ) + top * blendZ;
  }

  private _shiftBuffer(
    source: Uint8Array | Uint16Array,
    destination: Uint8Array | Uint16Array,
    shiftX: number,
    shiftZ: number
  ): void {
    destination.fill(0);
    if (Math.abs(shiftX) >= this.resolutionX || Math.abs(shiftZ) >= this.resolutionZ) return;
    for (let z = 0; z < this.resolutionZ; z++) {
      const sourceZ = z + shiftZ;
      if (sourceZ < 0 || sourceZ >= this.resolutionZ) continue;
      for (let x = 0; x < this.resolutionX; x++) {
        const sourceX = x + shiftX;
        if (sourceX < 0 || sourceX >= this.resolutionX) continue;
        destination[z * this.resolutionX + x] = source[sourceZ * this.resolutionX + sourceX];
      }
    }
  }

  private _countActive(buffer: Uint8Array | Uint16Array): number {
    let count = 0;
    for (const value of buffer) if (value > 0) count++;
    return count;
  }

  private _worldToPixelX(worldX: number): number {
    return (worldX - (this._centerX - this.length * 0.5)) / this.texelSizeX - 0.5;
  }

  private _worldToPixelZ(worldZ: number): number {
    return (worldZ - (this._centerZ - this.width * 0.5)) / this.texelSizeZ - 0.5;
  }

  private _pixelToWorldX(pixelX: number): number {
    return this._centerX - this.length * 0.5 + (pixelX + 0.5) * this.texelSizeX;
  }

  private _pixelToWorldZ(pixelZ: number): number {
    return this._centerZ - this.width * 0.5 + (pixelZ + 0.5) * this.texelSizeZ;
  }

  private _snapX(value: number): number {
    return Math.round(value / this.texelSizeX) * this.texelSizeX;
  }

  private _snapZ(value: number): number {
    return Math.round(value / this.texelSizeZ) * this.texelSizeZ;
  }

  private _syncHistoryUpload(): void {
    for (let index = 0; index < this._historyCurrent.length; index++) {
      this._historyUpload[index] = Math.min(255, Math.round(this._historyCurrent[index] / _historySubByteScale));
    }
  }
}
