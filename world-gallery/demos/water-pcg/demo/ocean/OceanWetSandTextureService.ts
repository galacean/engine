import {
  Engine,
  PBRMaterial,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode
} from "@galacean/engine-core";
import { Color } from "@galacean/engine-math";
import type { OceanNearshoreStateField } from "../../runtime/ocean/OceanNearshoreStateField";
import type { OceanPbrPixelSource } from "./OceanPbrTextureLibrary";

export interface OceanWetSandTextureFactory {
  create(
    engine: Engine,
    width: number,
    height: number,
    isSRGBColorSpace: boolean,
    name: string
  ): Texture2D;
}

export interface OceanWetSandTextureServiceOptions {
  readonly uploadRateHz?: number;
  readonly textureFactory?: OceanWetSandTextureFactory;
  readonly detailSource?: Readonly<OceanPbrPixelSource>;
}

export interface OceanWetSandTextureMetrics {
  readonly enabled: boolean;
  readonly textureCount: number;
  readonly textureCreateCount: number;
  readonly textureDestroyCount: number;
  readonly uploadRateHz: number;
  readonly baseColorUploadCount: number;
  readonly roughnessMetallicUploadCount: number;
  readonly normalUploadCount: number;
  readonly occlusionUploadCount: number;
  readonly lastFrameBaseColorUploadCount: number;
  readonly lastFrameRoughnessMetallicUploadCount: number;
  readonly rateLimitedFrameCount: number;
  readonly sourceRevision: number;
  readonly resourceBytes: number;
}

interface MutableOceanWetSandTextureMetrics {
  enabled: boolean;
  textureCount: number;
  textureCreateCount: number;
  textureDestroyCount: number;
  uploadRateHz: number;
  baseColorUploadCount: number;
  roughnessMetallicUploadCount: number;
  normalUploadCount: number;
  occlusionUploadCount: number;
  lastFrameBaseColorUploadCount: number;
  lastFrameRoughnessMetallicUploadCount: number;
  rateLimitedFrameCount: number;
  sourceRevision: number;
  resourceBytes: number;
}

const DEFAULT_UPLOAD_RATE_HZ = 10;
const UPDATE_EPSILON_SECONDS = 1e-6;
const DRY_SAND_COLOR = Object.freeze([172, 129, 78] as const);
const SUBMERGED_SAND_COLOR = Object.freeze([112, 91, 63] as const);
const WET_SAND_DARKENING = Object.freeze(
  [0.69, 0.68, 0.67] as const
);
const DRY_SAND_ROUGHNESS = 224;
const WET_SAND_ROUGHNESS = 154;
const SUBMERGED_SAND_ROUGHNESS = 154;
const MAXIMUM_WET_FILM_ALPHA = 56;
const SAND_DETAIL_TILING_X = 26;
const SAND_DETAIL_TILING_Z = 13;
const SAND_NORMAL_STRENGTH = 2.8;

const defaultTextureFactory: OceanWetSandTextureFactory = {
  create(
    engine: Engine,
    width: number,
    height: number,
    isSRGBColorSpace: boolean,
    name: string
  ): Texture2D {
    const texture = new Texture2D(
      engine,
      width,
      height,
      TextureFormat.R8G8B8A8,
      false,
      isSRGBColorSpace
    );
    texture.name = name;
    texture.filterMode = TextureFilterMode.Bilinear;
    texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
    texture.isGCIgnored = true;
    return texture;
  }
};

function mixByte(dry: number, wet: number, wetness: number): number {
  return Math.round(dry + (wet - dry) * wetness);
}

/**
 * Demo-only bridge from runtime wetness facts to native PBR sand inputs.
 *
 * The complete four-texture PBR set is fixed-size. Only base color and
 * roughness/metallic upload dynamically at a lower rate than the nearshore
 * simulation. The service never samples the Surface Query provider.
 */
export class OceanWetSandTextureService {
  readonly baseColorTexture: Texture2D;
  readonly normalTexture: Texture2D;
  readonly roughnessMetallicTexture: Texture2D;
  readonly occlusionTexture: Texture2D;
  readonly metrics: OceanWetSandTextureMetrics;
  private readonly _baseColorPixels: Uint8Array;
  private readonly _normalPixels: Uint8Array;
  private readonly _roughnessMetallicPixels: Uint8Array;
  private readonly _occlusionPixels: Uint8Array;
  private readonly _minimumUploadInterval: number;
  private readonly _mutableMetrics: MutableOceanWetSandTextureMetrics;
  private readonly _detailSource?: Readonly<OceanPbrPixelSource>;
  private _accumulatedSeconds = 0;
  private _lastRenderFrame = -1;
  private _lastSourceRevision = -1;
  private _forceUpload = true;
  private _enabled = true;
  private _destroyed = false;

  constructor(
    engine: Engine,
    private readonly _material: PBRMaterial,
    readonly field: OceanNearshoreStateField,
    options: Readonly<OceanWetSandTextureServiceOptions> = {}
  ) {
    const uploadRateHz = options.uploadRateHz ?? DEFAULT_UPLOAD_RATE_HZ;
    if (
      !Number.isFinite(uploadRateHz) ||
      uploadRateHz <= 0 ||
      uploadRateHz >= field.metrics.fixedStepRateHz
    ) {
      throw new Error(
        "Ocean wet-sand upload rate must be positive and lower than the nearshore state rate."
      );
    }
    this._minimumUploadInterval = 1 / uploadRateHz;
    const width = field.resource.metadata.width;
    const height = field.resource.metadata.height;
    const texelCount = width * height;
    const detailSource = options.detailSource;
    if (
      detailSource &&
      (detailSource.width <= 1 ||
        detailSource.height <= 1 ||
        detailSource.pixels.length !==
          detailSource.width * detailSource.height * 4)
    ) {
      throw new Error("Ocean wet-sand detail source is invalid.");
    }
    this._detailSource = detailSource;
    this._baseColorPixels = new Uint8Array(texelCount * 4);
    this._normalPixels = new Uint8Array(texelCount * 4);
    this._roughnessMetallicPixels = new Uint8Array(texelCount * 4);
    this._occlusionPixels = new Uint8Array(texelCount * 4);
    const factory = options.textureFactory ?? defaultTextureFactory;
    const createdTextures: Texture2D[] = [];
    try {
      this.baseColorTexture = factory.create(
        engine,
        width,
        height,
        true,
        "OceanWetSandBaseColor"
      );
      createdTextures.push(this.baseColorTexture);
      this.normalTexture = factory.create(
        engine,
        width,
        height,
        false,
        "OceanWetSandNormal"
      );
      createdTextures.push(this.normalTexture);
      this.roughnessMetallicTexture = factory.create(
        engine,
        width,
        height,
        false,
        "OceanWetSandRoughnessMetallic"
      );
      createdTextures.push(this.roughnessMetallicTexture);
      this.occlusionTexture = factory.create(
        engine,
        width,
        height,
        false,
        "OceanWetSandOcclusion"
      );
      createdTextures.push(this.occlusionTexture);
    } catch (error) {
      for (const texture of createdTextures) texture.destroy(true);
      throw error;
    }
    this._material.baseColor = new Color(1, 1, 1, 1);
    // The packed map carries a white metallic channel so the material scalar
    // remains the authoritative non-metal contract. Setting this to one made
    // the wet beach behave like a broad grey mirror at grazing angles.
    this._material.metallic = 0;
    this._material.roughness = 1;
    this._material.isTransparent = true;
    this._material.baseTexture = this.baseColorTexture;
    this._material.normalTexture = this.normalTexture;
    this._material.normalTextureIntensity = 0.82;
    this._material.roughnessMetallicTexture =
      this.roughnessMetallicTexture;
    this._material.occlusionTexture = this.occlusionTexture;
    this._material.occlusionTextureIntensity = 0.72;
    this._refreshStaticSurfacePixels();
    this.normalTexture.setPixelBuffer(this._normalPixels);
    this.occlusionTexture.setPixelBuffer(this._occlusionPixels);
    this._mutableMetrics = {
      enabled: true,
      textureCount: 4,
      textureCreateCount: 4,
      textureDestroyCount: 0,
      uploadRateHz,
      baseColorUploadCount: 0,
      roughnessMetallicUploadCount: 0,
      normalUploadCount: 1,
      occlusionUploadCount: 1,
      lastFrameBaseColorUploadCount: 0,
      lastFrameRoughnessMetallicUploadCount: 0,
      rateLimitedFrameCount: 0,
      sourceRevision: field.metrics.revision,
      resourceBytes: texelCount * 16
    };
    this.metrics = this._mutableMetrics;
  }

  /** Performs at most one upload to each owned texture for a render frame. */
  updateFrame(renderFrame: number, deltaTime: number): boolean {
    if (
      this._destroyed ||
      !Number.isSafeInteger(renderFrame) ||
      renderFrame < 0 ||
      !Number.isFinite(deltaTime) ||
      deltaTime < 0 ||
      renderFrame === this._lastRenderFrame
    ) {
      return false;
    }
    this._lastRenderFrame = renderFrame;
    this._mutableMetrics.lastFrameBaseColorUploadCount = 0;
    this._mutableMetrics.lastFrameRoughnessMetallicUploadCount = 0;
    this._accumulatedSeconds += deltaTime;
    const sourceRevision = this.field.metrics.revision;
    const revisionChanged = sourceRevision !== this._lastSourceRevision;
    const uploadDue =
      this._accumulatedSeconds + UPDATE_EPSILON_SECONDS >=
      this._minimumUploadInterval;
    if (!this._forceUpload && (!revisionChanged || !uploadDue)) {
      if (revisionChanged) this._mutableMetrics.rateLimitedFrameCount++;
      return false;
    }
    this._refreshPixels();
    this.baseColorTexture.setPixelBuffer(this._baseColorPixels);
    this.roughnessMetallicTexture.setPixelBuffer(
      this._roughnessMetallicPixels
    );
    this._mutableMetrics.baseColorUploadCount++;
    this._mutableMetrics.roughnessMetallicUploadCount++;
    this._mutableMetrics.lastFrameBaseColorUploadCount = 1;
    this._mutableMetrics.lastFrameRoughnessMetallicUploadCount = 1;
    this._mutableMetrics.sourceRevision = sourceRevision;
    this._lastSourceRevision = sourceRevision;
    this._accumulatedSeconds = 0;
    this._forceUpload = false;
    return true;
  }

  setEnabled(enabled: boolean): void {
    if (this._destroyed || enabled === this._enabled) return;
    this._enabled = enabled;
    this._mutableMetrics.enabled = enabled;
    this._forceUpload = true;
  }

  reset(): void {
    if (this._destroyed) return;
    this._accumulatedSeconds = 0;
    this._lastSourceRevision = -1;
    this._forceUpload = true;
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this._material.baseTexture === this.baseColorTexture) {
      this._material.baseTexture = null!;
    }
    if (this._material.normalTexture === this.normalTexture) {
      this._material.normalTexture = null!;
    }
    if (
      this._material.roughnessMetallicTexture ===
      this.roughnessMetallicTexture
    ) {
      this._material.roughnessMetallicTexture = null!;
    }
    if (
      this._material.occlusionTexture ===
      this.occlusionTexture
    ) {
      this._material.occlusionTexture = null!;
    }
    this.baseColorTexture.destroy(true);
    this.normalTexture.destroy(true);
    this.roughnessMetallicTexture.destroy(true);
    this.occlusionTexture.destroy(true);
    this._mutableMetrics.enabled = false;
    this._mutableMetrics.textureDestroyCount +=
      this._mutableMetrics.textureCount;
    this._mutableMetrics.textureCount = 0;
    this._mutableMetrics.lastFrameBaseColorUploadCount = 0;
    this._mutableMetrics.lastFrameRoughnessMetallicUploadCount = 0;
    this._mutableMetrics.resourceBytes = 0;
  }

  private _refreshPixels(): void {
    const wetness = this.field.wetnessUploadBuffer;
    const resource = this.field.resource;
    const fieldWidth = resource.metadata.width;
    const fieldHeight = resource.metadata.height;
    for (let index = 0; index < wetness.length; index++) {
      const offset = index * 4;
      const staticWet = resource.wetMaskAt(index) === 1;
      const blend = this._enabled
        ? this._sampleWetness(
            wetness,
            index,
            fieldWidth,
            fieldHeight
          )
        : 0;
      const detailOffset = this._detailOffset(
        index,
        fieldWidth,
        fieldHeight
      );
      const dryColor = this._resolveDryColor(staticWet, detailOffset);
      const wetRed = staticWet
        ? dryColor[0]
        : Math.round(
            dryColor[0] * WET_SAND_DARKENING[0]
          );
      const wetGreen = staticWet
        ? dryColor[1]
        : Math.round(
            dryColor[1] * WET_SAND_DARKENING[1]
          );
      const wetBlue = staticWet
        ? dryColor[2]
        : Math.round(
            dryColor[2] * WET_SAND_DARKENING[2]
          );
      const dryRoughness = staticWet
        ? SUBMERGED_SAND_ROUGHNESS
        : DRY_SAND_ROUGHNESS;
      const wetFilmWeight = staticWet ? 0 : blend;
      this._baseColorPixels[offset] = mixByte(
        dryColor[0],
        wetRed,
        blend
      );
      this._baseColorPixels[offset + 1] = mixByte(
        dryColor[1],
        wetGreen,
        blend
      );
      this._baseColorPixels[offset + 2] = mixByte(
        dryColor[2],
        wetBlue,
        blend
      );
      this._baseColorPixels[offset + 3] = this._enabled
        ? Math.round(wetFilmWeight * MAXIMUM_WET_FILM_ALPHA)
        : 0;
      this._roughnessMetallicPixels[offset] = 255;
      this._roughnessMetallicPixels[offset + 1] = mixByte(
        dryRoughness,
        WET_SAND_ROUGHNESS,
        blend
      );
      this._roughnessMetallicPixels[offset + 2] = 0;
      this._roughnessMetallicPixels[offset + 3] = 255;
    }
  }

  /**
   * Applies a one-texel tent filter only at the presentation boundary. The
   * runtime wetness field remains authoritative and unmodified, while the PBR
   * film avoids turning integer simulation fronts into hard color ribbons.
   */
  private _sampleWetness(
    wetness: Uint8Array,
    index: number,
    width: number,
    height: number
  ): number {
    const centerX = index % width;
    const centerY = Math.floor(index / width);
    let weightedSum = 0;
    let weightSum = 0;
    for (let offsetY = -1; offsetY <= 1; offsetY++) {
      const y = Math.min(
        height - 1,
        Math.max(0, centerY + offsetY)
      );
      const weightY = offsetY === 0 ? 2 : 1;
      for (let offsetX = -1; offsetX <= 1; offsetX++) {
        const x = Math.min(
          width - 1,
          Math.max(0, centerX + offsetX)
        );
        const weightX = offsetX === 0 ? 2 : 1;
        const weight = weightX * weightY;
        weightedSum += wetness[y * width + x] * weight;
        weightSum += weight;
      }
    }
    return weightedSum / (weightSum * 255);
  }

  private _refreshStaticSurfacePixels(): void {
    const resource = this.field.resource;
    const fieldWidth = resource.metadata.width;
    const fieldHeight = resource.metadata.height;
    for (let index = 0; index < fieldWidth * fieldHeight; index++) {
      const offset = index * 4;
      const detailOffset = this._detailOffset(
        index,
        fieldWidth,
        fieldHeight
      );
      if (detailOffset === undefined || !this._detailSource) {
        this._normalPixels[offset] = 128;
        this._normalPixels[offset + 1] = 128;
        this._normalPixels[offset + 2] = 255;
        this._normalPixels[offset + 3] = 255;
        this._occlusionPixels[offset] = 255;
        this._occlusionPixels[offset + 1] = 255;
        this._occlusionPixels[offset + 2] = 255;
        this._occlusionPixels[offset + 3] = 255;
        continue;
      }
      const source = this._detailSource;
      const sourcePixelIndex = detailOffset / 4;
      const sourceX = sourcePixelIndex % source.width;
      const sourceY = Math.floor(sourcePixelIndex / source.width);
      const left = this._detailLuminance(sourceX - 1, sourceY);
      const right = this._detailLuminance(sourceX + 1, sourceY);
      const up = this._detailLuminance(sourceX, sourceY - 1);
      const down = this._detailLuminance(sourceX, sourceY + 1);
      const center = this._detailLuminance(sourceX, sourceY);
      const gradientX = (right - left) * SAND_NORMAL_STRENGTH;
      const gradientY = (down - up) * SAND_NORMAL_STRENGTH;
      const inverseLength =
        1 / Math.hypot(gradientX, gradientY, 1);
      this._normalPixels[offset] = Math.round(
        (-gradientX * inverseLength * 0.5 + 0.5) * 255
      );
      this._normalPixels[offset + 1] = Math.round(
        (gradientY * inverseLength * 0.5 + 0.5) * 255
      );
      this._normalPixels[offset + 2] = Math.round(
        (inverseLength * 0.5 + 0.5) * 255
      );
      this._normalPixels[offset + 3] = 255;
      const neighbourhood = (left + right + up + down) * 0.25;
      const cavity = Math.min(
        1,
        Math.max(0, (neighbourhood - center) * 2.4)
      );
      const occlusion = Math.round((1 - cavity * 0.32) * 255);
      this._occlusionPixels[offset] = occlusion;
      this._occlusionPixels[offset + 1] = occlusion;
      this._occlusionPixels[offset + 2] = occlusion;
      this._occlusionPixels[offset + 3] = 255;
    }
  }

  private _resolveDryColor(
    staticWet: boolean,
    detailOffset: number | undefined
  ): readonly [number, number, number] {
    if (detailOffset === undefined || !this._detailSource) {
      return staticWet
        ? SUBMERGED_SAND_COLOR
        : DRY_SAND_COLOR;
    }
    const pixels = this._detailSource.pixels;
    const submergeScale = staticWet
      ? ([0.68, 0.72, 0.76] as const)
      : ([1, 1, 1] as const);
    return [
      Math.round(pixels[detailOffset] * submergeScale[0]),
      Math.round(pixels[detailOffset + 1] * submergeScale[1]),
      Math.round(pixels[detailOffset + 2] * submergeScale[2])
    ];
  }

  private _detailOffset(
    index: number,
    fieldWidth: number,
    fieldHeight: number
  ): number | undefined {
    const source = this._detailSource;
    if (!source) return undefined;
    const fieldX = index % fieldWidth;
    const fieldZ = Math.floor(index / fieldWidth);
    const sourceX =
      Math.floor(
        (fieldX / Math.max(1, fieldWidth - 1)) *
          SAND_DETAIL_TILING_X *
          source.width
      ) % source.width;
    const sourceY =
      Math.floor(
        (fieldZ / Math.max(1, fieldHeight - 1)) *
          SAND_DETAIL_TILING_Z *
          source.height
      ) % source.height;
    return (sourceY * source.width + sourceX) * 4;
  }

  private _detailLuminance(x: number, y: number): number {
    const source = this._detailSource;
    if (!source) return 0.5;
    const wrappedX =
      ((x % source.width) + source.width) % source.width;
    const wrappedY =
      ((y % source.height) + source.height) %
      source.height;
    const offset =
      (wrappedY * source.width + wrappedX) * 4;
    return (
      (source.pixels[offset] * 0.2126 +
        source.pixels[offset + 1] * 0.7152 +
        source.pixels[offset + 2] * 0.0722) /
      255
    );
  }
}
