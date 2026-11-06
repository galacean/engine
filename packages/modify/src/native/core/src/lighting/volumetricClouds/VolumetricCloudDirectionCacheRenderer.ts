import { Color, Vector3, Vector4 } from "@galacean/engine-math";
import { Engine } from "../../Engine";
import { Blitter } from "../../RenderPipeline/Blitter";
import { PipelineUtils } from "../../RenderPipeline/PipelineUtils";
import { GLCapabilityType } from "../../base";
import { CameraClearFlags } from "../../enums/CameraClearFlags";
import { RenderTarget, Texture2D, TextureFilterMode, TextureFormat, TextureWrapMode } from "../../texture";
import {
  createVolumetricCloudDirectionCacheSchedule,
  resolveVolumetricCloudDirectionHistoryMotion,
  resolveVolumetricCloudDirectionHistoryWeight,
  VOLUMETRIC_CLOUD_DIRECTION_CACHE_WARMUP_SWEEPS,
  type VolumetricCloudDirectionCacheSchedule
} from "./VolumetricCloudDirectionCacheSchedule";
import type {
  VolumetricCloudDirectionCacheProfiler,
  VolumetricCloudMaterial,
  VolumetricCloudQualityPreset
} from "./VolumetricCloudMaterial";

const DIRECTION_CACHE_PARITY_COUNT = 2;
const DIRECTION_CACHE_JITTER_PERIOD = 0x10000;
const MINIMUM_DIRECTION_CACHE_SIZE = DIRECTION_CACHE_PARITY_COUNT;

/** Immutable lease over one completed direction-cache generation. @internal */
export interface VolumetricCloudDirectionCacheSnapshot {
  readonly texture: Texture2D;
  readonly metadataTexture: Texture2D;
  readonly displayMotion: Vector3;
  readonly texelSize: Vector4;
  readonly revision: number;
  readonly compression: number;
  release(): void;
}

/** Material-owned hemispherical direction cache shared by every camera and sky consumer. @internal */
export class VolumetricCloudDirectionCacheRenderer {
  profiler: VolumetricCloudDirectionCacheProfiler | null = null;

  private static readonly _clearColor = new Color(0, 0, 0, 0);

  private readonly _historyTexelSize = new Vector4();
  private readonly _sliceViewport = new Vector4();
  private readonly _historyMotion = new Vector3();
  private readonly _displayMotion = new Vector3();
  private _displayTarget: RenderTarget | null = null;
  private _workingTarget: RenderTarget | null = null;
  private _cacheSize = 0;
  private _cacheFormat = TextureFormat.R8G8B8A8;
  private _updateFrame = 0;
  private _jitterCycle = 0;
  private _lastEngineFrame = -1;
  private readonly _displayCloudWindOffsetWS = new Vector3();
  private _accumulatedSweepCount = 0;
  private _sweepCloudTime = 0;
  private readonly _sweepCloudWindOffsetWS = new Vector3();
  private readonly _sweepCloudWindVelocityWS = new Vector3();
  private _sweepValid = false;
  private _displayValid = false;
  private _burstFramesRemaining = 0;
  private _invalidated = true;
  private _displayRevision = 0;
  private _snapshotLeaseCount = 0;
  private _destroyRequested = false;
  private _endpointBorrower: VolumetricCloudDirectionCacheRenderer | null = null;
  private _borrowedFrom: VolumetricCloudDirectionCacheRenderer | null = null;
  private _borrowedTarget: RenderTarget | null = null;

  constructor(private readonly _engine: Engine) {}

  get texture(): Texture2D | null {
    return this._displayTarget?.getColorTexture(0) as Texture2D | null;
  }

  /** Weighted cloud-depth cache paired with {@link texture}. @internal */
  get metadataTexture(): Texture2D | null {
    return this._displayTarget?.getColorTexture(1) as Texture2D | null;
  }

  /** Cache texel size and dimensions. @internal */
  get texelSize(): Vector4 {
    return this._historyTexelSize;
  }

  /** World displacement from the displayed sweep to the current advected density. @internal */
  get displayMotion(): Vector3 {
    return this._displayMotion;
  }

  get ready(): boolean {
    return this._displayValid && this._accumulatedSweepCount >= VOLUMETRIC_CLOUD_DIRECTION_CACHE_WARMUP_SWEEPS;
  }

  /** Monotonic generation of the atomically published display cache. @internal */
  get displayRevision(): number {
    return this._displayRevision;
  }

  /** Retain the displayed cache while a progressive cubemap captures every face. @internal */
  acquireSnapshot(material: VolumetricCloudMaterial): VolumetricCloudDirectionCacheSnapshot | null {
    const texture = this.texture;
    const metadataTexture = this.metadataTexture;
    if (this._destroyRequested || !this.ready || !texture || !metadataTexture) return null;

    this._snapshotLeaseCount++;
    const displayMotion = new Vector3();
    this._calculateHistoryMotionAtWind(material._cloudWindOffsetWS, displayMotion);
    const texelSize = new Vector4(
      this._historyTexelSize.x,
      this._historyTexelSize.y,
      this._historyTexelSize.z,
      this._historyTexelSize.w
    );
    let released = false;
    return {
      texture,
      metadataTexture,
      displayMotion,
      texelSize,
      revision: this._displayRevision,
      compression: this._cacheFormat === TextureFormat.R8G8B8A8 ? 1 : 0,
      release: () => {
        if (released) return;
        released = true;
        this._releaseSnapshot();
      }
    };
  }

  render(material: VolumetricCloudMaterial, preset: VolumetricCloudQualityPreset): void {
    if (this._snapshotLeaseCount > 0 || this._endpointBorrower) {
      this._lastEngineFrame = this._engine.time.frameCount;
      this._publish(material);
      return;
    }
    const format = this._selectCacheFormat(preset.directionCacheHDR);
    const targetsChanged = this._ensureTargets(preset.directionCacheSize, format);
    const resetRequired = targetsChanged || this._invalidated;
    const engineFrame = this._engine.time.frameCount;
    if (this._lastEngineFrame === engineFrame) {
      if (resetRequired) {
        this._resetAndClearTargets(Math.min(preset.directionInvalidationBurstSlices, preset.directionCacheSlices));
        this._invalidated = false;
      }
      this._publish(material);
      return;
    }
    const schedule = this.profiler
      ? this._profileDirectionUpdate(material, preset, resetRequired)
      : this._renderDirectionUpdate(material, preset, resetRequired);
    this._lastEngineFrame = engineFrame;

    if (schedule.publishAfterUpdate) {
      const completedTarget = this._workingTarget!;
      this._workingTarget = this._displayTarget;
      this._displayTarget = completedTarget;
      this._displayCloudWindOffsetWS.copyFrom(this._sweepCloudWindOffsetWS);
      this._displayValid = true;
      this._displayRevision++;
      this._accumulatedSweepCount++;
      this._sweepValid = false;
      this._jitterCycle = (this._jitterCycle + 1) % DIRECTION_CACHE_JITTER_PERIOD;
    }

    if (this._burstFramesRemaining > 0) {
      this._burstFramesRemaining--;
      this._updateFrame = this._burstFramesRemaining === 0 ? 0 : this._updateFrame + 1;
    } else {
      this._updateFrame = (this._updateFrame + 1) % (schedule.sliceCount * DIRECTION_CACHE_PARITY_COUNT);
    }
    this._publish(material);
  }

  invalidateHistory(): void {
    this._invalidated = true;
  }

  /** Borrow the idle working buffer; retain the source display and allocate only one additional target. */
  borrowWorkingTarget(source: VolumetricCloudDirectionCacheRenderer): void {
    if (this._displayTarget || this._workingTarget || this._borrowedFrom)
      throw new Error("Cloud endpoint already initialized");
    if (
      source._destroyRequested ||
      source._endpointBorrower ||
      source._snapshotLeaseCount ||
      !source.ready ||
      !source._workingTarget
    ) {
      throw new Error("Cloud source must be ready and free of bake leases before preparing an endpoint");
    }
    // Allocate before transferring ownership so allocation failure leaves A untouched.
    const extra = this._createTarget(
      source._cacheSize,
      source._cacheSize,
      source._cacheFormat,
      "volumetric_cloud_endpoint_working"
    );
    this._displayTarget = this._borrowedTarget = source._workingTarget;
    this._workingTarget = extra;
    this._cacheSize = source._cacheSize;
    this._cacheFormat = source._cacheFormat;
    this._historyTexelSize.copyFrom(source._historyTexelSize);
    this._borrowedFrom = source;
    source._workingTarget = null;
    source._endpointBorrower = this;
  }

  /** Restore the borrowed buffer regardless of ping-pong parity. Never expose partially computed B as A. */
  private _returnBorrowedTarget(): void {
    const source = this._borrowedFrom;
    if (!source) return;
    const borrowed = this._borrowedTarget!;
    if (this._displayTarget === borrowed) this._displayTarget = null;
    if (this._workingTarget === borrowed) this._workingTarget = null;
    source._workingTarget = borrowed;
    source._endpointBorrower = null;
    source._sweepValid = false;
    source._updateFrame = 0;
    source._burstFramesRemaining = 0;
    this._borrowedFrom = null;
    this._borrowedTarget = null;
    if (source._destroyRequested && source._snapshotLeaseCount === 0) source._destroyTargets();
  }

  destroy(): void {
    if (this._destroyRequested) return;
    this._destroyRequested = true;
    if (this._snapshotLeaseCount > 0 || this._endpointBorrower) return;
    this._destroyTargets();
  }

  private _destroyTargets(): void {
    this._returnBorrowedTarget();
    this._destroyTarget(this._displayTarget);
    this._destroyTarget(this._workingTarget);
    this._displayTarget = null;
    this._workingTarget = null;
    this._displayValid = false;
    this._accumulatedSweepCount = 0;
    this._cacheSize = 0;
  }

  private _releaseSnapshot(): void {
    this._snapshotLeaseCount--;
    if (this._snapshotLeaseCount === 0 && this._destroyRequested && !this._endpointBorrower) this._destroyTargets();
  }

  private _publish(material: VolumetricCloudMaterial): void {
    const texture = this.texture;
    if (!texture) return;
    this._calculateHistoryMotionAtWind(material._cloudWindOffsetWS, this._displayMotion);
    const data = material.shaderData;
    data.setTexture("material_CloudHistory", texture);
    data.setTexture("material_DirectionHistoryMetadata", this._displayTarget!.getColorTexture(1));
    data.setVector4("material_HistoryTexelSize", this._historyTexelSize);
    data.setVector3("material_DirectionDisplayMotion", this._displayMotion);
    data.setFloat("material_CacheHDRCompression", this._cacheFormat === TextureFormat.R8G8B8A8 ? 1 : 0);
    data.setFloat("material_DirectionCacheReady", this.ready ? 1 : 0);
  }

  private _ensureTargets(size: number, format: TextureFormat): boolean {
    const boundedSize = Math.max(MINIMUM_DIRECTION_CACHE_SIZE, Math.floor(size));
    if (this._displayTarget && this._workingTarget && this._cacheSize === boundedSize && this._cacheFormat === format) {
      return false;
    }
    this._destroyTarget(this._displayTarget);
    this._destroyTarget(this._workingTarget);
    this._displayTarget = this._createTarget(boundedSize, boundedSize, format, "volumetric_cloud_direction_display");
    this._workingTarget = this._createTarget(boundedSize, boundedSize, format, "volumetric_cloud_direction_working");
    this._cacheSize = boundedSize;
    this._cacheFormat = format;
    this._historyTexelSize.set(1 / boundedSize, 1 / boundedSize, boundedSize, boundedSize);
    return true;
  }

  private _createTarget(width: number, height: number, format: TextureFormat, name: string): RenderTarget {
    const texture = new Texture2D(this._engine, width, height, format, false, false);
    texture.name = name;
    texture.isGCIgnored = true;
    texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
    texture.filterMode = TextureFilterMode.Bilinear;
    const metadata = new Texture2D(this._engine, width, height, TextureFormat.R8, false, false);
    metadata.name = `${name}_weighted_center`;
    metadata.isGCIgnored = true;
    metadata.wrapModeU = metadata.wrapModeV = TextureWrapMode.Clamp;
    metadata.filterMode = TextureFilterMode.Bilinear;
    const target = new RenderTarget(this._engine, width, height, [texture, metadata], null, 1);
    target.isGCIgnored = true;
    target.autoGenerateMipmaps = false;
    return target;
  }

  private _resetAndClearTargets(burstSliceCount: number): void {
    this._displayCloudWindOffsetWS.set(0, 0, 0);
    this._accumulatedSweepCount = 0;
    this._sweepValid = false;
    this._displayValid = false;
    this._updateFrame = 0;
    this._jitterCycle = 0;
    this._burstFramesRemaining =
      Math.max(1, Math.floor(burstSliceCount)) *
      DIRECTION_CACHE_PARITY_COUNT *
      VOLUMETRIC_CLOUD_DIRECTION_CACHE_WARMUP_SWEEPS;
    this._lastEngineFrame = -1;
    const context = this._engine._renderContext;
    const rhi = this._engine._hardwareRenderer;
    context.setRenderTarget(this._displayTarget, PipelineUtils.defaultViewport, 0);
    rhi.clearRenderTarget(this._engine, CameraClearFlags.Color, VolumetricCloudDirectionCacheRenderer._clearColor);
    context.setRenderTarget(this._workingTarget, PipelineUtils.defaultViewport, 0);
    rhi.clearRenderTarget(this._engine, CameraClearFlags.Color, VolumetricCloudDirectionCacheRenderer._clearColor);
  }

  private _calculateHistoryMotionAtWind(currentWindOffsetWS: Readonly<Vector3>, out: Vector3): void {
    if (!this._displayValid) {
      out.set(0, 0, 0);
      return;
    }
    resolveVolumetricCloudDirectionHistoryMotion(this._displayCloudWindOffsetWS, currentWindOffsetWS, out);
  }

  private _selectCacheFormat(requestHDR: boolean): TextureFormat {
    if (!requestHDR) return TextureFormat.R8G8B8A8;
    const rhi = this._engine._hardwareRenderer;
    return rhi.canIUse(GLCapabilityType.textureHalfFloat) &&
      rhi.canIUse(GLCapabilityType.textureHalfFloatLinear) &&
      rhi.canIUse(GLCapabilityType.colorBufferHalfFloat)
      ? TextureFormat.R16G16B16A16
      : TextureFormat.R8G8B8A8;
  }

  private _renderDirectionUpdate(
    material: VolumetricCloudMaterial,
    preset: VolumetricCloudQualityPreset,
    resetRequired: boolean
  ): VolumetricCloudDirectionCacheSchedule {
    if (resetRequired) {
      this._resetAndClearTargets(Math.min(preset.directionInvalidationBurstSlices, preset.directionCacheSlices));
      this._invalidated = false;
    }
    const schedule = createVolumetricCloudDirectionCacheSchedule(
      this._updateFrame,
      preset.directionCacheSlices,
      this._burstFramesRemaining,
      preset.directionInvalidationBurstSlices
    );
    if ((schedule.checkerParity === 0 && schedule.sliceIndex === 0) || !this._sweepValid) {
      this._sweepCloudTime = material._cloudFrameTime;
      this._sweepCloudWindOffsetWS.copyFrom(material._cloudWindOffsetWS);
      this._sweepCloudWindVelocityWS.copyFrom(material._cloudWindVelocityWS);
      this._sweepValid = true;
    }
    const data = material.shaderData;
    this._calculateHistoryMotionAtWind(this._sweepCloudWindOffsetWS, this._historyMotion);
    data.setTexture("material_DirectionPreviousCache", this._displayTarget!.getColorTexture(0));
    data.setTexture("material_DirectionPreviousMetadata", this._displayTarget!.getColorTexture(1));
    data.setVector4("material_HistoryTexelSize", this._historyTexelSize);
    data.setVector3("material_DirectionHistoryMotion", this._historyMotion);
    data.setFloat("material_DirectionCheckerParity", schedule.checkerParity);
    data.setFloat("material_DirectionHistoryValid", this._displayValid ? 1 : 0);
    data.setFloat(
      "material_DirectionHistoryWeight",
      resolveVolumetricCloudDirectionHistoryWeight(this._accumulatedSweepCount, preset.directionHistoryWeight)
    );
    data.setFloat("material_MaxSteps", preset.directionCacheSteps);
    data.setFloat("material_HorizonStepMultiplier", preset.directionHorizonStepMultiplier);
    data.setFloat("material_HorizonFadeStart", preset.directionHorizonFadeStart);
    data.setFloat("material_CacheHDRCompression", this._cacheFormat === TextureFormat.R8G8B8A8 ? 1 : 0);
    data.setFloat("material_FrameJitter", radicalInverseBase3(this._jitterCycle + 1));
    data.setFloat("material_Time", this._sweepCloudTime);
    data.setVector3("material_WindOffsetWS", this._sweepCloudWindOffsetWS);
    data.setVector3("material_WindVelocityWS", this._sweepCloudWindVelocityWS);

    const sliceStart = Math.floor((schedule.sliceIndex * this._cacheSize) / schedule.sliceCount);
    const sliceEnd = Math.floor(((schedule.sliceIndex + 1) * this._cacheSize) / schedule.sliceCount);
    this._sliceViewport.set(0, sliceStart / this._cacheSize, 1, (sliceEnd - sliceStart) / this._cacheSize);
    Blitter.blitTexture(
      this._engine,
      this._engine._basicResources.whiteTexture2D,
      this._workingTarget!,
      0,
      this._sliceViewport,
      material,
      0
    );
    data.setFloat("material_Time", material._cloudFrameTime);
    data.setVector3("material_WindOffsetWS", material._cloudWindOffsetWS);
    data.setVector3("material_WindVelocityWS", material._cloudWindVelocityWS);
    return schedule;
  }

  private _profileDirectionUpdate(
    material: VolumetricCloudMaterial,
    preset: VolumetricCloudQualityPreset,
    resetRequired: boolean
  ): VolumetricCloudDirectionCacheSchedule {
    const profiler = this.profiler!;
    profiler.beginSample("direction-update");
    try {
      return this._renderDirectionUpdate(material, preset, resetRequired);
    } finally {
      profiler.endSample("direction-update");
    }
  }

  private _destroyTarget(target: RenderTarget | null): void {
    if (!target) return;
    const textures = [...target.colorTextures];
    target.destroy(true);
    for (const texture of textures) texture.destroy(true);
  }
}

function radicalInverseBase3(index: number): number {
  let value = Math.max(0, Math.floor(index));
  let inverseBase = 1 / 3;
  let result = 0;
  while (value > 0) {
    result += (value % 3) * inverseBase;
    value = Math.floor(value / 3);
    inverseBase /= 3;
  }
  return result;
}
