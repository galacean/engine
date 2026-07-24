import { Texture2D, TextureFilterMode, TextureFormat, TextureWrapMode, type Engine } from "@galacean/engine-core";
import type { TemporalFoamField } from "./TemporalFoamField";
import type {
  WaterCurrentFieldSnapshot,
  WaterCurrentFieldSnapshotKind
} from "./WaterCurrentFieldSnapshot";
import { WaterFoamDebugView } from "./WaterFoamTypes";

export type TemporalFoamDebugView = "source" | "history" | "final";
export type TemporalFoamTextureQuality = "low" | "medium";

export interface TemporalFoamTextureFactory {
  create(engine: Engine, width: number, height: number, name: string): Texture2D;
}

export interface TemporalFoamTextureServiceOptions {
  readonly enabled: boolean;
  readonly quality: TemporalFoamTextureQuality;
  readonly debugView?: TemporalFoamDebugView;
  /** Maximum CPU history updates per second; rendering keeps sampling the latest completed texture. */
  readonly targetUpdateRateHz?: number;
  readonly textureFactory?: TemporalFoamTextureFactory;
}

export interface TemporalFoamTextureMetrics {
  readonly enabled: boolean;
  readonly analyticFallback: boolean;
  readonly active: boolean;
  readonly debugView: TemporalFoamDebugView;
  readonly textureCount: number;
  readonly uploadCount: number;
  readonly lastFrameUploadCount: number;
  readonly resourceBytes: number;
  readonly peak: number;
  readonly historyUpdateCount: number;
  readonly targetUpdateRateHz: number;
  readonly rateLimitedFrameCount: number;
  readonly lastStepDeltaSeconds: number;
  readonly currentSnapshotKind: WaterCurrentFieldSnapshotKind | "none";
  readonly currentSnapshotRevision: number;
}

interface MutableTemporalFoamTextureMetrics {
  enabled: boolean;
  analyticFallback: boolean;
  active: boolean;
  debugView: TemporalFoamDebugView;
  textureCount: number;
  uploadCount: number;
  lastFrameUploadCount: number;
  resourceBytes: number;
  peak: number;
  historyUpdateCount: number;
  targetUpdateRateHz: number;
  rateLimitedFrameCount: number;
  lastStepDeltaSeconds: number;
  currentSnapshotKind: WaterCurrentFieldSnapshotKind | "none";
  currentSnapshotRevision: number;
}

const DEFAULT_TARGET_UPDATE_RATE_HZ = 30;
const UPDATE_INTERVAL_EPSILON_SECONDS = 1e-6;

const defaultTextureFactory: TemporalFoamTextureFactory = {
  create(engine: Engine, width: number, height: number, name: string): Texture2D {
    const texture = new Texture2D(engine, width, height, TextureFormat.R8, false, false);
    texture.name = name;
    texture.filterMode = TextureFilterMode.Bilinear;
    texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
    texture.isGCIgnored = true;
    return texture;
  }
};

/**
 * Bounded WebGL2 upload bridge for one CPU temporal-foam field.
 *
 * The CPU field owns an R8 source, Q8.8 history accumulation and one quantized
 * R8 upload view. This service owns one source texture and two history textures,
 * but uploads only the selected debug channel once per render frame. The surface
 * material can sample {@link texture} while analytic shore/crest foam remains
 * the Low/disabled fallback.
 */
export class TemporalFoamTextureService {
  readonly metrics: TemporalFoamTextureMetrics;

  private readonly _mutableMetrics: MutableTemporalFoamTextureMetrics;
  private readonly _sourceSnapshot: Uint8Array;
  private _sourceTexture: Texture2D | null = null;
  private _historyTextures: [Texture2D, Texture2D] | null = null;
  private _visibleHistoryIndex = 0;
  private _lastRenderFrame = -1;
  private _forceUpload = true;
  private _sourceTextureContainsData = false;
  private readonly _minimumUpdateIntervalSeconds: number;
  private _accumulatedDeltaSeconds = 0;
  private _destroyed = false;

  constructor(
    private readonly _engine: Engine,
    readonly field: TemporalFoamField,
    options: TemporalFoamTextureServiceOptions
  ) {
    const debugView = options.debugView ?? "final";
    const temporalEnabled = options.enabled && options.quality === "medium";
    const targetUpdateRateHz = options.targetUpdateRateHz ?? DEFAULT_TARGET_UPDATE_RATE_HZ;
    if (!Number.isFinite(targetUpdateRateHz) || targetUpdateRateHz <= 0 || targetUpdateRateHz > 240) {
      throw new Error("Temporal foam target update rate must be within (0, 240].");
    }
    this._minimumUpdateIntervalSeconds = 1 / targetUpdateRateHz;
    const pixelCount = field.resolutionX * field.resolutionZ;
    this._sourceSnapshot = new Uint8Array(pixelCount);
    this._mutableMetrics = {
      enabled: temporalEnabled,
      analyticFallback: !temporalEnabled,
      active: false,
      debugView,
      textureCount: 0,
      uploadCount: 0,
      lastFrameUploadCount: 0,
      resourceBytes: 0,
      peak: 0,
      historyUpdateCount: 0,
      targetUpdateRateHz,
      rateLimitedFrameCount: 0,
      lastStepDeltaSeconds: 0,
      currentSnapshotKind: "none",
      currentSnapshotRevision: -1
    };
    this.metrics = this._mutableMetrics;
    if (!temporalEnabled) return;

    const factory = options.textureFactory ?? defaultTextureFactory;
    let sourceTexture: Texture2D | null = null;
    let historyTextureA: Texture2D | null = null;
    try {
      sourceTexture = factory.create(
        this._engine,
        field.resolutionX,
        field.resolutionZ,
        "WaterTemporalFoamSource"
      );
      historyTextureA = factory.create(
        this._engine,
        field.resolutionX,
        field.resolutionZ,
        "WaterTemporalFoamHistoryA"
      );
      const historyTextureB = factory.create(
        this._engine,
        field.resolutionX,
        field.resolutionZ,
        "WaterTemporalFoamHistoryB"
      );
      this._sourceTexture = sourceTexture;
      this._historyTextures = [historyTextureA, historyTextureB];
    } catch (error) {
      historyTextureA?.destroy(true);
      sourceTexture?.destroy(true);
      throw error;
    }
    this._mutableMetrics.textureCount = 3;
    this._mutableMetrics.resourceBytes = pixelCount * 3;
  }

  /** Currently selected source/history texture, or null for Low/disabled/destroyed. */
  get texture(): Texture2D | null {
    if (!this._mutableMetrics.enabled || this._destroyed) return null;
    if (this._mutableMetrics.debugView !== "final") {
      return this._sourceTexture;
    }
    return this._historyTextures?.[this._visibleHistoryIndex] ?? null;
  }

  get bindingDebugView(): WaterFoamDebugView {
    switch (this._mutableMetrics.debugView) {
      case "source":
        return WaterFoamDebugView.Source;
      case "history":
        return WaterFoamDebugView.History;
      default:
        return WaterFoamDebugView.Final;
    }
  }

  setDebugView(view: TemporalFoamDebugView): void {
    if (this._destroyed || this._mutableMetrics.debugView === view) return;
    this._mutableMetrics.debugView = view;
    this._forceUpload = true;
  }

  /** Clears CPU history and guarantees one zero synchronization for the selected texture view. */
  clear(): void {
    if (this._destroyed) return;
    this.field.clear();
    this._sourceSnapshot.fill(0);
    this._forceUpload = true;
    this._sourceTextureContainsData = false;
    this._accumulatedDeltaSeconds = 0;
    this._mutableMetrics.active = false;
    this._mutableMetrics.peak = 0;
    this._mutableMetrics.lastStepDeltaSeconds = 0;
  }

  /**
   * Captures source before stepping because `TemporalFoamField.step` consumes it.
   * Repeated calls with the same render-frame id are ignored to enforce one upload.
   */
  updateFrame(renderFrame: number, deltaTime: number, currentSnapshot?: WaterCurrentFieldSnapshot): boolean {
    if (
      this._destroyed ||
      !this._mutableMetrics.enabled ||
      !Number.isInteger(renderFrame) ||
      renderFrame < 0 ||
      !Number.isFinite(deltaTime) ||
      deltaTime < 0
    ) {
      return false;
    }
    if (renderFrame === this._lastRenderFrame) return false;
    this._lastRenderFrame = renderFrame;
    this._mutableMetrics.lastFrameUploadCount = 0;
    this._mutableMetrics.currentSnapshotKind = currentSnapshot?.kind ?? "none";
    this._mutableMetrics.currentSnapshotRevision = currentSnapshot?.revision ?? -1;

    const hadSource = this.field.metrics.sourcePixelCount > 0;
    let sourceSnapshotCaptured = false;
    if (this._forceUpload) {
      this._sourceSnapshot.set(this.field.sourceBuffer);
      sourceSnapshotCaptured = true;
    }
    let historyUpdated = false;
    if (this.field.isIdle) {
      this._accumulatedDeltaSeconds = 0;
    } else {
      this._accumulatedDeltaSeconds += deltaTime;
      if (this._accumulatedDeltaSeconds + UPDATE_INTERVAL_EPSILON_SECONDS >= this._minimumUpdateIntervalSeconds) {
        if (!sourceSnapshotCaptured) {
          this._sourceSnapshot.set(this.field.sourceBuffer);
          sourceSnapshotCaptured = true;
        }
        const stepDeltaSeconds = this._accumulatedDeltaSeconds;
        this._accumulatedDeltaSeconds = 0;
        this._mutableMetrics.lastStepDeltaSeconds = stepDeltaSeconds;
        historyUpdated = this.field.step(stepDeltaSeconds, currentSnapshot);
      } else {
        this._mutableMetrics.rateLimitedFrameCount++;
      }
    }
    if (historyUpdated) this._mutableMetrics.historyUpdateCount++;
    this._mutableMetrics.active = !this.field.isIdle;
    this._mutableMetrics.peak = this.field.metrics.peakHistoryValue;

    const view = this._mutableMetrics.debugView;
    if (view === "source") {
      const mustSyncCapturedSource = sourceSnapshotCaptured && (hadSource || this._sourceTextureContainsData);
      if (this._forceUpload || mustSyncCapturedSource) {
        this._upload(this._sourceTexture, this._sourceSnapshot);
        this._sourceTextureContainsData = hadSource;
      }
    } else if (view === "history") {
      if (this._forceUpload || historyUpdated) {
        this._upload(this._sourceTexture, this.field.historyBuffer);
      }
    } else if (this._forceUpload || historyUpdated) {
      this._visibleHistoryIndex ^= 1;
      this._upload(this._historyTextures?.[this._visibleHistoryIndex] ?? null, this.field.historyBuffer);
    }
    this._forceUpload = false;
    return historyUpdated || this._mutableMetrics.lastFrameUploadCount > 0;
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._sourceTexture?.destroy(true);
    this._historyTextures?.[0].destroy(true);
    this._historyTextures?.[1].destroy(true);
    this._sourceTexture = null;
    this._historyTextures = null;
    this._sourceSnapshot.fill(0);
    this._accumulatedDeltaSeconds = 0;
    this._mutableMetrics.enabled = false;
    this._mutableMetrics.analyticFallback = true;
    this._mutableMetrics.active = false;
    this._mutableMetrics.textureCount = 0;
    this._mutableMetrics.lastFrameUploadCount = 0;
    this._mutableMetrics.resourceBytes = 0;
    this._mutableMetrics.peak = 0;
    this._mutableMetrics.lastStepDeltaSeconds = 0;
    this._mutableMetrics.currentSnapshotKind = "none";
    this._mutableMetrics.currentSnapshotRevision = -1;
  }

  private _upload(texture: Texture2D | null, pixels: Uint8Array): void {
    if (!texture || this._mutableMetrics.lastFrameUploadCount >= 1) return;
    texture.setPixelBuffer(pixels);
    this._mutableMetrics.uploadCount++;
    this._mutableMetrics.lastFrameUploadCount++;
  }
}
