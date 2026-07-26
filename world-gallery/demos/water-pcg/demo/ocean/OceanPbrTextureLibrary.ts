import {
  Engine,
  PBRMaterial,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode
} from "@galacean/engine-core";
import { Vector4 } from "@galacean/engine-math";

export type OceanPbrSurfaceKind = "sand" | "granite" | "neutral";

export interface OceanPbrPixelSource {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
}

export interface OceanPbrDerivedMaps {
  readonly normal: Uint8Array;
  readonly roughnessMetallic: Uint8Array;
  readonly occlusion: Uint8Array;
}

export interface OceanPbrAuthoredTextureSources {
  readonly baseColor: OceanPbrPixelSource;
  readonly normal: OceanPbrPixelSource;
  readonly roughness: OceanPbrPixelSource;
  readonly occlusion: OceanPbrPixelSource;
}

export interface OceanPbrAuthoredMaps {
  readonly baseColor: Uint8ClampedArray;
  readonly normal: Uint8ClampedArray;
  readonly roughnessMetallic: Uint8Array;
  readonly occlusion: Uint8ClampedArray;
}

export interface OceanPbrMaterialBindingOptions {
  readonly tiling: readonly [number, number];
  readonly normalIntensity: number;
  readonly occlusionIntensity: number;
}

export interface OceanPbrTextureLibraryMetrics {
  readonly textureCount: number;
  readonly sourceImageCount: number;
  readonly sourceTextureCount: number;
  readonly generatedTextureCount: number;
  readonly retainedPixelSourceCount: number;
  readonly retainedPixelSourceBytes: number;
  readonly resourceBytes: number;
  readonly totalOwnedBytes: number;
  readonly sandTextureSetComplete: boolean;
  readonly graniteTextureSetComplete: boolean;
  readonly neutralTextureSetComplete: boolean;
}

interface OceanPbrTextureSet {
  readonly baseColor: Texture2D;
  readonly normal: Texture2D;
  readonly roughnessMetallic: Texture2D;
  readonly occlusion: Texture2D;
}

interface DerivedMapParameters {
  readonly normalStrength: number;
  readonly minimumRoughness: number;
  readonly maximumRoughness: number;
  readonly cavityStrength: number;
}

const SAND_TEXTURE_SIZE = 1024;
const WET_SAND_DETAIL_SIZE = 512;
const GRANITE_SOURCE_TEXTURE_SIZE = 512;
const NEUTRAL_TEXTURE_SIZE = 128;
const TEXTURE_CHANNEL_COUNT = 4;
const AUTHORED_SAND_ROUGHNESS_MINIMUM = 198;
const AUTHORED_SAND_ROUGHNESS_RANGE = 36;
const PBR_TEXTURE_SET_COUNT = 3;
const PBR_TEXTURES_PER_SET = 4;
const SOURCE_IMAGE_COUNT = 6;
const SOURCE_GPU_TEXTURE_COUNT = 5;
const RETAINED_PIXEL_SOURCE_COUNT = 2;
const MIP_RESOURCE_SCALE = 4 / 3;
const SAND_BASE_COLOR_URL = new URL(
  "./assets/ground055s-color-1024.jpg",
  import.meta.url
).href;
const SAND_NORMAL_URL = new URL(
  "./assets/ground055s-normal-gl-1024.jpg",
  import.meta.url
).href;
const SAND_ROUGHNESS_URL = new URL(
  "./assets/ground055s-roughness-1024.jpg",
  import.meta.url
).href;
const SAND_OCCLUSION_URL = new URL(
  "./assets/ground055s-ambient-occlusion-1024.jpg",
  import.meta.url
).href;
const WET_SAND_DETAIL_URL = new URL(
  "./assets/aerial-beach-02-base-color-512.jpg",
  import.meta.url
).href;
const GRANITE_ALBEDO_URL = new URL(
  "./assets/coastal-granite-albedo.png",
  import.meta.url
).href;

const DERIVED_PARAMETERS: Readonly<
  Record<OceanPbrSurfaceKind, DerivedMapParameters>
> = Object.freeze({
  sand: Object.freeze({
    normalStrength: 2.2,
    minimumRoughness: 0.72,
    maximumRoughness: 0.96,
    cavityStrength: 0.42
  }),
  granite: Object.freeze({
    normalStrength: 5.8,
    minimumRoughness: 0.48,
    maximumRoughness: 0.88,
    cavityStrength: 0.68
  }),
  neutral: Object.freeze({
    normalStrength: 2.2,
    minimumRoughness: 0.52,
    maximumRoughness: 0.82,
    cavityStrength: 0.28
  })
});

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function toByte(value: number): number {
  return Math.round(clamp01(value) * 255);
}

function wrap(value: number, size: number): number {
  const remainder = value % size;
  return remainder < 0 ? remainder + size : remainder;
}

function luminanceAt(
  luminance: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number
): number {
  return luminance[wrap(y, height) * width + wrap(x, width)];
}

function assertPixelSource(source: Readonly<OceanPbrPixelSource>): void {
  if (
    !Number.isSafeInteger(source.width) ||
    source.width <= 1 ||
    !Number.isSafeInteger(source.height) ||
    source.height <= 1 ||
    source.pixels.length !==
      source.width * source.height * TEXTURE_CHANNEL_COUNT
  ) {
    throw new Error("Ocean PBR pixel source is invalid.");
  }
}

function assertMatchingPixelSourceDimensions(
  reference: Readonly<OceanPbrPixelSource>,
  candidate: Readonly<OceanPbrPixelSource>,
  label: string
): void {
  if (
    candidate.width !== reference.width ||
    candidate.height !== reference.height
  ) {
    throw new Error(
      `Ocean PBR authored ${label} dimensions do not match base color: ` +
        `${candidate.width}x${candidate.height} !== ` +
        `${reference.width}x${reference.height}.`
    );
  }
}

/**
 * Keeps authored sand variation while calibrating the roughness into the
 * dielectric beach-sand range used by this dusk presentation.
 */
export function remapOceanSandRoughness(
  authoredRoughness: number
): number {
  const normalized = Math.min(
    1,
    Math.max(0, authoredRoughness / 255)
  );
  return Math.round(
    AUTHORED_SAND_ROUGHNESS_MINIMUM +
      normalized * AUTHORED_SAND_ROUGHNESS_RANGE
  );
}

export function buildOceanPbrAuthoredMaps(
  sources: Readonly<OceanPbrAuthoredTextureSources>
): OceanPbrAuthoredMaps {
  assertPixelSource(sources.baseColor);
  assertPixelSource(sources.normal);
  assertPixelSource(sources.roughness);
  assertPixelSource(sources.occlusion);
  assertMatchingPixelSourceDimensions(
    sources.baseColor,
    sources.normal,
    "normal"
  );
  assertMatchingPixelSourceDimensions(
    sources.baseColor,
    sources.roughness,
    "roughness"
  );
  assertMatchingPixelSourceDimensions(
    sources.baseColor,
    sources.occlusion,
    "occlusion"
  );

  const roughnessMetallic = new Uint8Array(sources.roughness.pixels.length);
  for (
    let offset = 0;
    offset < roughnessMetallic.length;
    offset += TEXTURE_CHANNEL_COUNT
  ) {
    roughnessMetallic[offset] = 255;
    roughnessMetallic[offset + 1] =
      remapOceanSandRoughness(
        sources.roughness.pixels[offset]
      );
    roughnessMetallic[offset + 2] = 0;
    roughnessMetallic[offset + 3] = 255;
  }
  return Object.freeze({
    baseColor: sources.baseColor.pixels,
    normal: sources.normal.pixels,
    roughnessMetallic,
    occlusion: sources.occlusion.pixels
  });
}

/**
 * Builds the tangent normal, roughness/metallic and occlusion maps consumed by
 * Galacean PBR. Sampling wraps at every edge so the complete texture set stays
 * tileable even when the authored albedo is repeated at grazing angles.
 */
export function buildOceanPbrDerivedMaps(
  source: Readonly<OceanPbrPixelSource>,
  surface: OceanPbrSurfaceKind
): OceanPbrDerivedMaps {
  assertPixelSource(source);
  const parameters = DERIVED_PARAMETERS[surface];
  const texelCount = source.width * source.height;
  const luminance = new Float32Array(texelCount);
  for (let index = 0; index < texelCount; index++) {
    const offset = index * TEXTURE_CHANNEL_COUNT;
    luminance[index] =
      (source.pixels[offset] * 0.2126 +
        source.pixels[offset + 1] * 0.7152 +
        source.pixels[offset + 2] * 0.0722) /
      255;
  }

  const normal = new Uint8Array(texelCount * TEXTURE_CHANNEL_COUNT);
  const roughnessMetallic = new Uint8Array(
    texelCount * TEXTURE_CHANNEL_COUNT
  );
  const occlusion = new Uint8Array(texelCount * TEXTURE_CHANNEL_COUNT);
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const index = y * source.width + x;
      const offset = index * TEXTURE_CHANNEL_COUNT;
      const center = luminance[index];
      const left = luminanceAt(
        luminance,
        source.width,
        source.height,
        x - 1,
        y
      );
      const right = luminanceAt(
        luminance,
        source.width,
        source.height,
        x + 1,
        y
      );
      const up = luminanceAt(
        luminance,
        source.width,
        source.height,
        x,
        y - 1
      );
      const down = luminanceAt(
        luminance,
        source.width,
        source.height,
        x,
        y + 1
      );
      const diagonalAverage =
        (luminanceAt(
          luminance,
          source.width,
          source.height,
          x - 1,
          y - 1
        ) +
          luminanceAt(
            luminance,
            source.width,
            source.height,
            x + 1,
            y - 1
          ) +
          luminanceAt(
            luminance,
            source.width,
            source.height,
            x - 1,
            y + 1
          ) +
          luminanceAt(
            luminance,
            source.width,
            source.height,
            x + 1,
            y + 1
          )) *
        0.25;
      const neighbourhoodAverage =
        (left + right + up + down + diagonalAverage * 2) / 6;
      const gradientX = (right - left) * parameters.normalStrength;
      const gradientY = (down - up) * parameters.normalStrength;
      const inverseNormalLength =
        1 / Math.hypot(gradientX, gradientY, 1);
      normal[offset] = toByte(
        -gradientX * inverseNormalLength * 0.5 + 0.5
      );
      normal[offset + 1] = toByte(
        gradientY * inverseNormalLength * 0.5 + 0.5
      );
      normal[offset + 2] = toByte(inverseNormalLength * 0.5 + 0.5);
      normal[offset + 3] = 255;

      const highFrequency = Math.abs(center - neighbourhoodAverage);
      const roughnessWeight = clamp01(
        0.36 +
          highFrequency * 3.4 +
          (1 - center) * 0.24
      );
      const roughness =
        parameters.minimumRoughness +
        (parameters.maximumRoughness - parameters.minimumRoughness) *
          roughnessWeight;
      roughnessMetallic[offset] = 255;
      roughnessMetallic[offset + 1] = toByte(roughness);
      roughnessMetallic[offset + 2] = 0;
      roughnessMetallic[offset + 3] = 255;

      const cavity = clamp01(
        (neighbourhoodAverage - center) *
          parameters.cavityStrength *
          4 +
          highFrequency * parameters.cavityStrength
      );
      const occlusionValue = toByte(1 - cavity * 0.58);
      occlusion[offset] = occlusionValue;
      occlusion[offset + 1] = occlusionValue;
      occlusion[offset + 2] = occlusionValue;
      occlusion[offset + 3] = 255;
    }
  }
  return Object.freeze({
    normal,
    roughnessMetallic,
    occlusion
  });
}

function createNeutralPixelSource(size: number): OceanPbrPixelSource {
  const pixels = new Uint8ClampedArray(
    size * size * TEXTURE_CHANNEL_COUNT
  );
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = y * size + x;
      const offset = index * TEXTURE_CHANNEL_COUNT;
      const broad =
        Math.sin((x / size) * Math.PI * 8) *
          Math.sin((y / size) * Math.PI * 6) *
          3.5;
      const grain =
        Math.sin((x * 13 + y * 7) * 0.37) * 2.2 +
        Math.cos((x * 5 - y * 11) * 0.29) * 1.8;
      const value = Math.round(224 + broad + grain);
      pixels[offset] = value;
      pixels[offset + 1] = value;
      pixels[offset + 2] = value;
      pixels[offset + 3] = 255;
    }
  }
  return Object.freeze({ width: size, height: size, pixels });
}

function liftGraniteAlbedo(
  source: Readonly<OceanPbrPixelSource>
): OceanPbrPixelSource {
  const pixels = new Uint8ClampedArray(source.pixels.length);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    for (let channel = 0; channel < 3; channel++) {
      const normalized = source.pixels[offset + channel] / 255;
      pixels[offset + channel] = Math.round(
        Math.min(1, Math.pow(normalized, 0.82) * 1.06 + 0.025) *
          255
      );
    }
    pixels[offset + 3] = source.pixels[offset + 3];
  }
  return Object.freeze({
    width: source.width,
    height: source.height,
    pixels
  });
}

/**
 * Converts an arbitrary photographed source into a periodic mirror tile.
 * Matching opposite edges prevents the longitudinal PBR seam on closed rocks
 * and avoids requiring a shader-specific triplanar path in the showcase.
 */
export function buildOceanPbrMirroredTile(
  source: Readonly<OceanPbrPixelSource>
): OceanPbrPixelSource {
  assertPixelSource(source);
  const pixels = new Uint8ClampedArray(source.pixels.length);
  const maximumX = source.width - 1;
  const maximumY = source.height - 1;
  for (let y = 0; y < source.height; y++) {
    const normalizedY = y / maximumY;
    const mirroredY =
      normalizedY <= 0.5
        ? normalizedY * 2
        : (1 - normalizedY) * 2;
    const sourceY = Math.round(mirroredY * maximumY);
    for (let x = 0; x < source.width; x++) {
      const normalizedX = x / maximumX;
      const mirroredX =
        normalizedX <= 0.5
          ? normalizedX * 2
          : (1 - normalizedX) * 2;
      const sourceX = Math.round(mirroredX * maximumX);
      const sourceOffset =
        (sourceY * source.width + sourceX) *
        TEXTURE_CHANNEL_COUNT;
      const targetOffset =
        (y * source.width + x) * TEXTURE_CHANNEL_COUNT;
      pixels[targetOffset] = source.pixels[sourceOffset];
      pixels[targetOffset + 1] =
        source.pixels[sourceOffset + 1];
      pixels[targetOffset + 2] =
        source.pixels[sourceOffset + 2];
      pixels[targetOffset + 3] =
        source.pixels[sourceOffset + 3];
    }
  }
  return Object.freeze({
    width: source.width,
    height: source.height,
    pixels
  });
}

async function loadPixelSource(
  url: string,
  targetSize: number
): Promise<OceanPbrPixelSource> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.decoding = "async";
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () =>
      reject(new Error(`Ocean PBR texture failed to load: ${url}`));
  });
  image.src = url;
  await loaded;

  const canvas = document.createElement("canvas");
  canvas.width = targetSize;
  canvas.height = targetSize;
  const context = canvas.getContext("2d", {
    alpha: false,
    willReadFrequently: true
  });
  if (!context) {
    throw new Error("Ocean PBR texture canvas context is unavailable.");
  }
  context.drawImage(image, 0, 0, targetSize, targetSize);
  const pixels = new Uint8ClampedArray(
    context.getImageData(0, 0, targetSize, targetSize).data
  );
  return Object.freeze({
    width: targetSize,
    height: targetSize,
    pixels
  });
}

function createTexture(
  engine: Engine,
  source: Readonly<OceanPbrPixelSource>,
  pixels: Uint8Array | Uint8ClampedArray,
  isSRGBColorSpace: boolean,
  name: string
): Texture2D {
  const texture = new Texture2D(
    engine,
    source.width,
    source.height,
    TextureFormat.R8G8B8A8,
    true,
    isSRGBColorSpace
  );
  texture.name = name;
  texture.filterMode = TextureFilterMode.Trilinear;
  texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Repeat;
  texture.setPixelBuffer(pixels);
  texture.generateMipmaps();
  return texture;
}

function createTextureSet(
  engine: Engine,
  source: Readonly<OceanPbrPixelSource>,
  surface: OceanPbrSurfaceKind,
  label: string
): OceanPbrTextureSet {
  const derived = buildOceanPbrDerivedMaps(source, surface);
  const created: Texture2D[] = [];
  try {
    const baseColor = createTexture(
      engine,
      source,
      source.pixels,
      true,
      `${label}BaseColor`
    );
    created.push(baseColor);
    const normal = createTexture(
      engine,
      source,
      derived.normal,
      false,
      `${label}Normal`
    );
    created.push(normal);
    const roughnessMetallic = createTexture(
      engine,
      source,
      derived.roughnessMetallic,
      false,
      `${label}RoughnessMetallic`
    );
    created.push(roughnessMetallic);
    const occlusion = createTexture(
      engine,
      source,
      derived.occlusion,
      false,
      `${label}Occlusion`
    );
    created.push(occlusion);
    return Object.freeze({
      baseColor,
      normal,
      roughnessMetallic,
      occlusion
    });
  } catch (error) {
    for (const texture of created) texture.destroy(true);
    throw error;
  }
}

function createAuthoredTextureSet(
  engine: Engine,
  sources: Readonly<OceanPbrAuthoredTextureSources>,
  label: string
): OceanPbrTextureSet {
  const maps = buildOceanPbrAuthoredMaps(sources);
  const created: Texture2D[] = [];
  try {
    const baseColor = createTexture(
      engine,
      sources.baseColor,
      maps.baseColor,
      true,
      `${label}BaseColor`
    );
    created.push(baseColor);
    const normal = createTexture(
      engine,
      sources.baseColor,
      maps.normal,
      false,
      `${label}Normal`
    );
    created.push(normal);
    const roughnessMetallic = createTexture(
      engine,
      sources.baseColor,
      maps.roughnessMetallic,
      false,
      `${label}RoughnessMetallic`
    );
    created.push(roughnessMetallic);
    const occlusion = createTexture(
      engine,
      sources.baseColor,
      maps.occlusion,
      false,
      `${label}Occlusion`
    );
    created.push(occlusion);
    return Object.freeze({
      baseColor,
      normal,
      roughnessMetallic,
      occlusion
    });
  } catch (error) {
    for (const texture of created) texture.destroy(true);
    throw error;
  }
}

function textureSetComplete(set: OceanPbrTextureSet): boolean {
  return Boolean(
    set.baseColor &&
      set.normal &&
      set.roughnessMetallic &&
      set.occlusion
  );
}

function estimateTextureSetBytes(source: OceanPbrPixelSource): number {
  return Math.round(
    source.width *
      source.height *
      TEXTURE_CHANNEL_COUNT *
      MIP_RESOURCE_SCALE *
      4
  );
}

function estimatePixelSourceBytes(source: OceanPbrPixelSource): number {
  return source.pixels.byteLength;
}

/**
 * Owns the complete PBR texture sets shared by the Ocean demo fixtures.
 * Materials do not own these textures and must be destroyed before the library.
 */
export class OceanPbrTextureLibrary {
  readonly metrics: Readonly<OceanPbrTextureLibraryMetrics>;
  private _destroyed = false;

  private constructor(
    readonly sandSource: OceanPbrPixelSource,
    readonly wetSandSource: OceanPbrPixelSource,
    private readonly _sand: OceanPbrTextureSet,
    private readonly _granite: OceanPbrTextureSet,
    private readonly _neutral: OceanPbrTextureSet,
    resourceBytes: number
  ) {
    const textureCount = PBR_TEXTURE_SET_COUNT * PBR_TEXTURES_PER_SET;
    const retainedPixelSourceBytes =
      estimatePixelSourceBytes(sandSource) +
      estimatePixelSourceBytes(wetSandSource);
    this.metrics = Object.freeze({
      textureCount,
      sourceImageCount: SOURCE_IMAGE_COUNT,
      sourceTextureCount: SOURCE_GPU_TEXTURE_COUNT,
      generatedTextureCount: textureCount - SOURCE_GPU_TEXTURE_COUNT,
      retainedPixelSourceCount: RETAINED_PIXEL_SOURCE_COUNT,
      retainedPixelSourceBytes,
      resourceBytes,
      totalOwnedBytes: resourceBytes + retainedPixelSourceBytes,
      sandTextureSetComplete: textureSetComplete(_sand),
      graniteTextureSetComplete: textureSetComplete(_granite),
      neutralTextureSetComplete: textureSetComplete(_neutral)
    });
  }

  static async create(engine: Engine): Promise<OceanPbrTextureLibrary> {
    const [
      sandBaseColorSource,
      sandNormalSource,
      sandRoughnessSource,
      sandOcclusionSource,
      wetSandSource,
      graniteSourceRaw
    ] = await Promise.all([
      loadPixelSource(SAND_BASE_COLOR_URL, SAND_TEXTURE_SIZE),
      loadPixelSource(SAND_NORMAL_URL, SAND_TEXTURE_SIZE),
      loadPixelSource(SAND_ROUGHNESS_URL, SAND_TEXTURE_SIZE),
      loadPixelSource(SAND_OCCLUSION_URL, SAND_TEXTURE_SIZE),
      loadPixelSource(WET_SAND_DETAIL_URL, WET_SAND_DETAIL_SIZE),
      loadPixelSource(GRANITE_ALBEDO_URL, GRANITE_SOURCE_TEXTURE_SIZE)
    ]);
    const sandSources = Object.freeze({
      baseColor: sandBaseColorSource,
      normal: sandNormalSource,
      roughness: sandRoughnessSource,
      occlusion: sandOcclusionSource
    });
    const graniteSource = liftGraniteAlbedo(
      buildOceanPbrMirroredTile(graniteSourceRaw)
    );
    const neutralSource = createNeutralPixelSource(
      NEUTRAL_TEXTURE_SIZE
    );
    const sets: OceanPbrTextureSet[] = [];
    try {
      const sand = createAuthoredTextureSet(
        engine,
        sandSources,
        "OceanBeachSand"
      );
      sets.push(sand);
      const granite = createTextureSet(
        engine,
        graniteSource,
        "granite",
        "OceanCoastalGranite"
      );
      sets.push(granite);
      const neutral = createTextureSet(
        engine,
        neutralSource,
        "neutral",
        "OceanFixtureNeutral"
      );
      sets.push(neutral);
      return new OceanPbrTextureLibrary(
        sandBaseColorSource,
        wetSandSource,
        sand,
        granite,
        neutral,
        estimateTextureSetBytes(sandBaseColorSource) +
          estimateTextureSetBytes(graniteSource) +
          estimateTextureSetBytes(neutralSource)
      );
    } catch (error) {
      for (const set of sets) {
        set.baseColor.destroy(true);
        set.normal.destroy(true);
        set.roughnessMetallic.destroy(true);
        set.occlusion.destroy(true);
      }
      throw error;
    }
  }

  apply(
    material: PBRMaterial,
    surface: OceanPbrSurfaceKind,
    options: Readonly<OceanPbrMaterialBindingOptions>
  ): void {
    if (this._destroyed) {
      throw new Error("Ocean PBR texture library is destroyed.");
    }
    const set =
      surface === "sand"
        ? this._sand
        : surface === "granite"
          ? this._granite
          : this._neutral;
    material.baseTexture = set.baseColor;
    material.normalTexture = set.normal;
    material.roughnessMetallicTexture =
      set.roughnessMetallic;
    material.occlusionTexture = set.occlusion;
    material.normalTextureIntensity =
      options.normalIntensity;
    material.occlusionTextureIntensity =
      options.occlusionIntensity;
    material.tilingOffset = new Vector4(
      options.tiling[0],
      options.tiling[1],
      0,
      0
    );
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    for (const set of [
      this._sand,
      this._granite,
      this._neutral
    ]) {
      set.baseColor.destroy(true);
      set.normal.destroy(true);
      set.roughnessMetallic.destroy(true);
      set.occlusion.destroy(true);
    }
  }
}
