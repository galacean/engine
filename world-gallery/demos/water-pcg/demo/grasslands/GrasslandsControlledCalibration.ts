import type { WaterSurfaceOpticsBindingReadback } from "../../runtime/optics/WaterSurfaceOpticsTypes";
import {
  readWaterSurfaceAppearanceGpuCalibration,
  type WaterSurfaceAppearanceGpuCalibrationInput,
  type WaterSurfaceAppearanceGpuCalibrationReadback
} from "../../runtime/surface/WaterSurfaceAppearanceGpuCalibration";
import type { GrasslandsAcceptanceRuntimeReadback } from "./GrasslandsShowcaseAcceptance";

const DEPTH_TINT_SAMPLE_METERS = Object.freeze([0, 0.5, 2, 5, 10] as const);

export interface GrasslandsControlledCalibrationReadback {
  readonly schemaVersion: 1;
  readonly source: "grasslands-active-runtime-plus-transient-webgl2";
  readonly runtimeInput: {
    readonly appearanceAssetId: string;
    readonly appearanceHash: string;
    readonly normalAssetId: string;
    readonly normalContentHash: string;
    readonly normalSourceUrl: string;
    readonly normalByteLength: number;
    readonly opticsRequestedTier: string;
    readonly opticsResolvedTier: string;
  };
  readonly gpu: WaterSurfaceAppearanceGpuCalibrationReadback;
}

export interface GrasslandsControlledCalibrationOptions {
  readRuntime(): GrasslandsAcceptanceRuntimeReadback;
  readOptics(): Readonly<WaterSurfaceOpticsBindingReadback> | undefined;
  readNormalSourceUrl(): string;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function digestSha256(bytes: ArrayBuffer): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("Grasslands controlled calibration requires Web Crypto SHA-256.");
  const digest = new Uint8Array(await subtle.digest("SHA-256", bytes));
  return Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
}

function requireFinite(value: number | undefined, name: string): number {
  if (value === undefined || !Number.isFinite(value)) {
    throw new Error(`Grasslands controlled calibration requires finite ${name}.`);
  }
  return value;
}

function createGpuInput(
  runtime: GrasslandsAcceptanceRuntimeReadback,
  optics: Readonly<WaterSurfaceOpticsBindingReadback>,
  normalImage: ImageBitmap
): WaterSurfaceAppearanceGpuCalibrationInput {
  if (!runtime.strictMaterialReady || !runtime.appearance.active || !runtime.normal.active) {
    throw new Error("Grasslands controlled calibration requires the active strict High appearance.");
  }
  const indexOfRefraction = requireFinite(optics.opticalProfile.indexOfRefraction, "index of refraction");
  const fresnelRatio = (1 - indexOfRefraction) / (1 + indexOfRefraction);
  return {
    normalImage,
    normalWidth: normalImage.width,
    normalHeight: normalImage.height,
    normalTiling: runtime.normal.tiling,
    normalScrollUvPerSecond: runtime.normal.scrollUvPerSecond,
    normalStrength: runtime.normal.strength,
    normalFlipGreen: runtime.normal.flipGreen,
    surfaceTime: runtime.surfaceTime,
    depthTintDistanceMeters: runtime.appearance.depthTint.distance,
    depthTintExponent: runtime.appearance.depthTint.exponent,
    depthTintSampleMeters: DEPTH_TINT_SAMPLE_METERS,
    contactDistanceMeters: runtime.appearance.contactFoam.contactDistance,
    coastalDistanceMeters: runtime.appearance.coastalAlpha.distance,
    refractionStrength: requireFinite(optics.opticalProfile.refractionStrength, "refraction strength"),
    roughness: requireFinite(optics.opticalProfile.roughness, "roughness"),
    fresnelF0: fresnelRatio * fresnelRatio
  };
}

/** Thin Grasslands adapter: resolves active inputs, verifies the PNG, and owns async cleanup. */
export class GrasslandsControlledCalibration {
  private _pending: Promise<GrasslandsControlledCalibrationReadback> | undefined;
  private _disposed = false;

  constructor(private readonly _options: GrasslandsControlledCalibrationOptions) {}

  read(): Promise<GrasslandsControlledCalibrationReadback> {
    if (this._disposed) {
      return Promise.reject(new Error("Grasslands controlled calibration is disposed."));
    }
    if (this._pending) return this._pending;
    const operation = this._readOnce().finally(() => {
      if (this._pending === operation) this._pending = undefined;
    });
    this._pending = operation;
    return operation;
  }

  dispose(): void {
    this._disposed = true;
  }

  private async _readOnce(): Promise<GrasslandsControlledCalibrationReadback> {
    const runtime = this._options.readRuntime();
    const optics = this._options.readOptics();
    if (!optics) throw new Error("Grasslands controlled calibration requires active optics.");
    const normalSourceUrl = this._options.readNormalSourceUrl();
    const response = await fetch(normalSourceUrl, {
      cache: "no-cache",
      credentials: "same-origin"
    });
    if (!response.ok) {
      throw new Error(
        `Grasslands controlled calibration normal fetch failed: HTTP ${response.status} ${response.statusText}.`
      );
    }
    const bytes = await response.arrayBuffer();
    if (this._disposed) throw new Error("Grasslands controlled calibration was disposed during normal fetch.");
    const contentHash = await digestSha256(bytes);
    if (contentHash !== runtime.normal.contentHash || contentHash !== runtime.normal.expectedContentHash) {
      throw new Error(
        `Grasslands controlled calibration normal hash mismatch: ${contentHash} != ${runtime.normal.contentHash}.`
      );
    }

    let image: ImageBitmap;
    try {
      image = await createImageBitmap(new Blob([bytes], { type: "image/png" }), {
        colorSpaceConversion: "none",
        imageOrientation: "none",
        premultiplyAlpha: "none"
      });
    } catch (error) {
      throw new Error(`Grasslands controlled calibration normal decode failed: ${message(error)}`);
    }
    try {
      if (this._disposed) throw new Error("Grasslands controlled calibration was disposed during normal decode.");
      if (image.width !== runtime.normal.width || image.height !== runtime.normal.height) {
        throw new Error(
          `Grasslands controlled calibration normal dimensions mismatch: ${image.width}x${image.height}.`
        );
      }
      const gpu = await readWaterSurfaceAppearanceGpuCalibration(createGpuInput(runtime, optics, image));
      if (this._disposed) throw new Error("Grasslands controlled calibration was disposed during GPU readback.");
      return Object.freeze({
        schemaVersion: 1,
        source: "grasslands-active-runtime-plus-transient-webgl2",
        runtimeInput: Object.freeze({
          appearanceAssetId: runtime.appearance.assetId,
          appearanceHash: runtime.appearance.appearanceHash,
          normalAssetId: runtime.normal.assetId,
          normalContentHash: contentHash,
          normalSourceUrl,
          normalByteLength: bytes.byteLength,
          opticsRequestedTier: optics.requestedTier,
          opticsResolvedTier: optics.resolvedTier
        }),
        gpu
      });
    } finally {
      image.close();
    }
  }
}
