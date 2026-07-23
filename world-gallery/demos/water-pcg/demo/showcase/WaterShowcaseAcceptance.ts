export type WaterShowcaseRuntime = "river" | "pool" | "ocean";

export interface WaterShowcaseFrameMetrics {
  readonly sampleCount: number;
  readonly fps: number;
  readonly p95FrameMs: number;
  readonly finite: boolean;
}

export interface WaterShowcaseResourceMetrics {
  readonly bufferMemory: number;
  readonly textureMemory: number;
  readonly totalMemory: number;
  readonly liveRenderTargets: number;
  readonly liveReflectionCameras: number;
  readonly meshUploadCount: number;
  readonly perFrameMeshUpload: boolean;
}

export interface WaterShowcaseReflectionMetrics {
  readonly requestedSource: "sky" | "probe" | "planar";
  readonly effectiveSource: "sky" | "probe" | "planar";
  readonly ownerCount: number;
  readonly cameraCount: number;
  readonly renderTargetCount: number;
  readonly filterSampleCount: 1 | 5;
  readonly failureCount: number;
}

export type WaterShowcaseSceneMetric = string | number | boolean | null;

/** Stable browser-facing contract consumed by focused smoke and performance gates. */
export interface WaterShowcaseAcceptanceSnapshot {
  readonly ready: boolean;
  readonly caseId: string;
  readonly runtime: WaterShowcaseRuntime;
  readonly preset: string;
  readonly runtimeError: string | null;
  readonly finite: boolean;
  readonly qualityTier: "high";
  readonly opticsTier: "high";
  readonly frame: Readonly<WaterShowcaseFrameMetrics>;
  readonly resources: Readonly<WaterShowcaseResourceMetrics>;
  readonly reflection: Readonly<WaterShowcaseReflectionMetrics>;
  readonly refractionEnabled: boolean;
  readonly scene: Readonly<Record<string, WaterShowcaseSceneMetric>>;
}

export interface WaterShowcaseCaptureApi {
  readonly states: readonly string[];
  readonly currentState: string;
  setCaptureState(state: string): void;
  reset(): void;
}

declare global {
  interface Window {
    waterPcgAcceptance?: Readonly<WaterShowcaseAcceptanceSnapshot>;
    waterPcgShowcase?: WaterShowcaseCaptureApi;
  }
}

/**
 * Bounded frame sampler shared by the showcase entries.
 *
 * Keeping this independent from Stats makes the acceptance API deterministic and
 * usable in headless runs where the presentation HUD is intentionally absent.
 */
export class WaterShowcaseFrameSampler {
  private readonly _samples: number[] = [];

  constructor(private readonly _capacity = 120) {}

  record(deltaTimeSeconds: number): void {
    const frameMs = deltaTimeSeconds * 1000;
    if (!Number.isFinite(frameMs) || frameMs < 0) return;
    this._samples.push(frameMs);
    if (this._samples.length > this._capacity) this._samples.shift();
  }

  get metrics(): Readonly<WaterShowcaseFrameMetrics> {
    if (this._samples.length === 0) {
      return Object.freeze({ sampleCount: 0, fps: 0, p95FrameMs: 0, finite: true });
    }
    const sorted = [...this._samples].sort((left, right) => left - right);
    const averageMs = this._samples.reduce((sum, value) => sum + value, 0) / this._samples.length;
    const percentileIndex = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * 0.95));
    const fps = averageMs > 0 ? 1000 / averageMs : 0;
    const p95FrameMs = sorted[percentileIndex];
    return Object.freeze({
      sampleCount: this._samples.length,
      fps,
      p95FrameMs,
      finite: Number.isFinite(fps) && Number.isFinite(p95FrameMs)
    });
  }
}

export function areFiniteShowcaseMetrics(values: readonly number[]): boolean {
  return values.every(Number.isFinite);
}
