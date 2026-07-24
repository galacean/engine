import {
  Engine,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode
} from "@galacean/engine-core";
import type { OceanNearshoreStateField } from "./OceanNearshoreStateField";

export interface OceanNearshoreStateTextureFactory {
  create(
    engine: Engine,
    width: number,
    height: number,
    format: TextureFormat,
    name: string
  ): Texture2D;
}

export interface OceanNearshoreStateTextureServiceOptions {
  readonly wetnessUploadRateHz?: number;
  readonly textureFactory?: OceanNearshoreStateTextureFactory;
}

export interface OceanNearshoreStateTextureMetrics {
  readonly enabled: boolean;
  readonly textureCount: number;
  readonly stateUploadCount: number;
  readonly wetnessUploadCount: number;
  readonly lastFrameStateUploadCount: number;
  readonly lastFrameWetnessUploadCount: number;
  readonly stateUpdateCount: number;
  readonly stateUpdateRateHz: number;
  readonly wetnessUploadRateHz: number;
  readonly wetnessRateLimitedFrameCount: number;
  readonly stateRevision: number;
  readonly resourceBytes: number;
}

interface MutableOceanNearshoreStateTextureMetrics {
  enabled: boolean;
  textureCount: number;
  stateUploadCount: number;
  wetnessUploadCount: number;
  lastFrameStateUploadCount: number;
  lastFrameWetnessUploadCount: number;
  stateUpdateCount: number;
  stateUpdateRateHz: number;
  wetnessUploadRateHz: number;
  wetnessRateLimitedFrameCount: number;
  stateRevision: number;
  resourceBytes: number;
}

const DEFAULT_WETNESS_UPLOAD_RATE_HZ = 12;
const UPDATE_EPSILON_SECONDS = 1e-6;

const defaultTextureFactory: OceanNearshoreStateTextureFactory = {
  create(
    engine: Engine,
    width: number,
    height: number,
    format: TextureFormat,
    name: string
  ): Texture2D {
    const texture = new Texture2D(
      engine,
      width,
      height,
      format,
      false,
      false
    );
    texture.name = name;
    texture.filterMode = TextureFilterMode.Bilinear;
    texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
    texture.isGCIgnored = true;
    return texture;
  }
};

/**
 * Upload bridge for one dynamic state atlas (RGBA8) and one wetness output
 * (R8). CPU state is fixed at <=30 Hz; wetness has an independent lower cap.
 */
export class OceanNearshoreStateTextureService {
  readonly stateTexture: Texture2D;
  readonly wetnessTexture: Texture2D;
  readonly metrics: OceanNearshoreStateTextureMetrics;
  private readonly _mutableMetrics: MutableOceanNearshoreStateTextureMetrics;
  private readonly _wetnessMinimumInterval: number;
  private _wetnessAccumulatedSeconds = 0;
  private _lastRenderFrame = -1;
  private _lastFixedTime?: number;
  private _lastWetnessRevision = -1;
  private _forceStateUpload = true;
  private _forceWetnessUpload = true;
  private _destroyed = false;

  constructor(
    private readonly _engine: Engine,
    readonly field: OceanNearshoreStateField,
    options: Readonly<OceanNearshoreStateTextureServiceOptions> = {}
  ) {
    const wetnessUploadRateHz =
      options.wetnessUploadRateHz ?? DEFAULT_WETNESS_UPLOAD_RATE_HZ;
    if (
      !Number.isFinite(wetnessUploadRateHz) ||
      wetnessUploadRateHz <= 0 ||
      wetnessUploadRateHz > field.metrics.fixedStepRateHz
    ) {
      throw new Error(
        "Ocean wetness upload rate must be positive and no greater than the state update rate."
      );
    }
    this._wetnessMinimumInterval = 1 / wetnessUploadRateHz;
    const factory = options.textureFactory ?? defaultTextureFactory;
    const width = field.resource.metadata.width;
    const height = field.resource.metadata.height;
    let stateTexture: Texture2D | undefined;
    try {
      stateTexture = factory.create(
        this._engine,
        width,
        height,
        TextureFormat.R8G8B8A8,
        "OceanNearshoreDynamicState"
      );
      this.stateTexture = stateTexture;
      this.wetnessTexture = factory.create(
        this._engine,
        width,
        height,
        TextureFormat.R8,
        "OceanNearshoreWetness"
      );
    } catch (error) {
      stateTexture?.destroy(true);
      throw error;
    }
    const resourceBytes = width * height * 5;
    this._mutableMetrics = {
      enabled: true,
      textureCount: 2,
      stateUploadCount: 0,
      wetnessUploadCount: 0,
      lastFrameStateUploadCount: 0,
      lastFrameWetnessUploadCount: 0,
      stateUpdateCount: 0,
      stateUpdateRateHz: field.metrics.fixedStepRateHz,
      wetnessUploadRateHz,
      wetnessRateLimitedFrameCount: 0,
      stateRevision: field.metrics.revision,
      resourceBytes
    };
    this.metrics = this._mutableMetrics;
  }

  /** Updates CPU state and performs at most one upload per owned texture. */
  updateFrame(
    renderFrame: number,
    deltaTime: number,
    fixedElapsedTime?: number
  ): boolean {
    if (
      this._destroyed ||
      !Number.isInteger(renderFrame) ||
      renderFrame < 0 ||
      !Number.isFinite(deltaTime) ||
      deltaTime < 0 ||
      renderFrame === this._lastRenderFrame
    ) {
      return false;
    }
    this._lastRenderFrame = renderFrame;
    this._mutableMetrics.lastFrameStateUploadCount = 0;
    this._mutableMetrics.lastFrameWetnessUploadCount = 0;
    let stateChanged = false;
    let fixedTimeChanged = false;
    if (fixedElapsedTime !== undefined) {
      if (!Number.isFinite(fixedElapsedTime) || fixedElapsedTime < 0) {
        throw new Error("Ocean nearshore fixed time must be finite and non-negative.");
      }
      fixedTimeChanged = fixedElapsedTime !== this._lastFixedTime;
      this._lastFixedTime = fixedElapsedTime;
      if (fixedTimeChanged) stateChanged = this.field.seek(fixedElapsedTime);
    } else {
      this._lastFixedTime = undefined;
      stateChanged = this.field.update(deltaTime);
    }
    if (stateChanged) this._mutableMetrics.stateUpdateCount++;
    this._mutableMetrics.stateRevision = this.field.metrics.revision;

    if (this._forceStateUpload || stateChanged || fixedTimeChanged) {
      this.stateTexture.setPixelBuffer(this.field.stateUploadBuffer);
      this._mutableMetrics.stateUploadCount++;
      this._mutableMetrics.lastFrameStateUploadCount = 1;
      this._forceStateUpload = false;
    }

    this._wetnessAccumulatedSeconds += deltaTime;
    const wetnessDue =
      this._wetnessAccumulatedSeconds + UPDATE_EPSILON_SECONDS >=
      this._wetnessMinimumInterval;
    if (
      this._forceWetnessUpload ||
      fixedTimeChanged ||
      (wetnessDue &&
        this.field.metrics.revision !== this._lastWetnessRevision)
    ) {
      this.wetnessTexture.setPixelBuffer(this.field.wetnessUploadBuffer);
      this._mutableMetrics.wetnessUploadCount++;
      this._mutableMetrics.lastFrameWetnessUploadCount = 1;
      this._wetnessAccumulatedSeconds = 0;
      this._lastWetnessRevision = this.field.metrics.revision;
      this._forceWetnessUpload = false;
    } else if (stateChanged) {
      this._mutableMetrics.wetnessRateLimitedFrameCount++;
    }
    return (
      stateChanged ||
      this._mutableMetrics.lastFrameStateUploadCount > 0 ||
      this._mutableMetrics.lastFrameWetnessUploadCount > 0
    );
  }

  seek(elapsedTime: number): boolean {
    if (this._destroyed) return false;
    const changed = this.field.seek(elapsedTime);
    this._lastFixedTime = elapsedTime;
    if (changed) {
      this._forceStateUpload = true;
      this._forceWetnessUpload = true;
      this._mutableMetrics.stateRevision = this.field.metrics.revision;
    }
    return changed;
  }

  setEnabled(enabled: boolean): void {
    if (this._destroyed) return;
    this.field.setEnabled(enabled);
    this._mutableMetrics.enabled = enabled;
    this._mutableMetrics.stateRevision = this.field.metrics.revision;
    this._forceStateUpload = true;
    this._forceWetnessUpload = true;
  }

  reset(): void {
    if (this._destroyed) return;
    this.field.reset();
    this._lastFixedTime = undefined;
    this._lastWetnessRevision = -1;
    this._wetnessAccumulatedSeconds = 0;
    this._mutableMetrics.stateRevision = this.field.metrics.revision;
    this._forceStateUpload = true;
    this._forceWetnessUpload = true;
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this.stateTexture.destroy(true);
    this.wetnessTexture.destroy(true);
    this._mutableMetrics.enabled = false;
    this._mutableMetrics.textureCount = 0;
    this._mutableMetrics.lastFrameStateUploadCount = 0;
    this._mutableMetrics.lastFrameWetnessUploadCount = 0;
    this._mutableMetrics.resourceBytes = 0;
  }
}
