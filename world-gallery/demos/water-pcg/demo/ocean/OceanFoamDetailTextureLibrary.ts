import { Texture2D, TextureFilterMode, TextureFormat, TextureWrapMode, type Engine } from "@galacean/engine-core";
import type { WaterFoamDetailTextureBinding } from "../../runtime/wave/WaterWaveRuntimeTypes";

export const OCEAN_FOAM_DETAIL_TEXTURE_SIZE = 512;

const TEXTURE_CHANNEL_COUNT = 4;
const TEXTURE_NAME = "OceanFoamDetailPacked";
const CHANNEL_PACKING = "r-thick-g-medium-b-fine" as const;
const FOAM_OPACITY_BLACK_POINT = 0;
const FOAM_OPACITY_WHITE_POINT = 200;
const FOAM_OPACITY_GAMMA = 1;
const THICK_FOAM_OPACITY_URL = new URL("./assets/foam001-opacity-512.jpg", import.meta.url).href;
const MEDIUM_FOAM_OPACITY_URL = new URL("./assets/foam002-opacity-512.jpg", import.meta.url).href;
const FINE_FOAM_OPACITY_URL = new URL("./assets/foam003-opacity-512.jpg", import.meta.url).href;

export interface OceanFoamDetailGrayscaleSource {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
}

export interface OceanFoamDetailChannelSources {
  readonly thick: OceanFoamDetailGrayscaleSource;
  readonly medium: OceanFoamDetailGrayscaleSource;
  readonly fine: OceanFoamDetailGrayscaleSource;
}

export interface OceanFoamDetailPackedSource {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
}

export interface OceanFoamDetailTextureFactory {
  create(
    engine: Engine,
    width: number,
    height: number,
    format: TextureFormat,
    mipmap: boolean,
    isSRGBColorSpace: boolean,
    name: string
  ): Texture2D;
}

export interface OceanFoamDetailTextureLibraryOptions {
  readonly textureFactory?: OceanFoamDetailTextureFactory;
}

export interface OceanFoamDetailTextureLibraryMetrics {
  readonly ownership: "borrowed";
  readonly sourceImageCount: 3;
  readonly textureCount: number;
  readonly textureCreateCount: number;
  readonly textureDestroyCount: number;
  readonly textureUploadCount: number;
  readonly mipmapGenerationCount: number;
  readonly width: number;
  readonly height: number;
  readonly mipLevelCount: number;
  readonly resourceBytes: number;
  readonly channelPacking: typeof CHANNEL_PACKING;
  readonly destroyed: boolean;
}

type MutableMetrics = {
  -readonly [Key in keyof OceanFoamDetailTextureLibraryMetrics]: OceanFoamDetailTextureLibraryMetrics[Key];
};

const defaultTextureFactory: OceanFoamDetailTextureFactory = {
  create(
    engine: Engine,
    width: number,
    height: number,
    format: TextureFormat,
    mipmap: boolean,
    isSRGBColorSpace: boolean,
    name: string
  ): Texture2D {
    const texture = new Texture2D(engine, width, height, format, mipmap, isSRGBColorSpace);
    texture.name = name;
    return texture;
  }
};

export function validateOceanFoamDetailGrayscaleSource(
  source: Readonly<OceanFoamDetailGrayscaleSource>,
  label = "source"
): void {
  const pixelCount = source.width * source.height;
  if (
    !Number.isSafeInteger(source.width) ||
    source.width <= 0 ||
    !Number.isSafeInteger(source.height) ||
    source.height <= 0 ||
    !Number.isSafeInteger(pixelCount) ||
    source.pixels.length !== pixelCount
  ) {
    throw new Error(`Ocean foam detail ${label} grayscale source is invalid.`);
  }
}

/**
 * Demo-side levels calibration for the authored opacity maps. This retains
 * their cellular structure while matching the shared shader's 0.28-0.72
 * micro-coverage window without changing water-system shader thresholds.
 */
export function calibrateOceanFoamOpacity(
  authoredOpacity: number
): number {
  const normalized = Math.min(
    1,
    Math.max(
      0,
      (authoredOpacity - FOAM_OPACITY_BLACK_POINT) /
        (FOAM_OPACITY_WHITE_POINT -
          FOAM_OPACITY_BLACK_POINT)
    )
  );
  return Math.round(
    Math.pow(normalized, FOAM_OPACITY_GAMMA) * 255
  );
}

export function packOceanFoamDetailChannels(
  sources: Readonly<OceanFoamDetailChannelSources>
): OceanFoamDetailPackedSource {
  validateOceanFoamDetailGrayscaleSource(sources.thick, "thick");
  validateOceanFoamDetailGrayscaleSource(sources.medium, "medium");
  validateOceanFoamDetailGrayscaleSource(sources.fine, "fine");
  const { width, height } = sources.thick;
  if (
    sources.medium.width !== width ||
    sources.medium.height !== height ||
    sources.fine.width !== width ||
    sources.fine.height !== height
  ) {
    throw new Error("Ocean foam detail grayscale sources must share dimensions.");
  }

  const pixelCount = width * height;
  const pixels = new Uint8Array(pixelCount * TEXTURE_CHANNEL_COUNT);
  for (let index = 0; index < pixelCount; index++) {
    const offset = index * TEXTURE_CHANNEL_COUNT;
    pixels[offset] = sources.thick.pixels[index];
    pixels[offset + 1] = sources.medium.pixels[index];
    pixels[offset + 2] = sources.fine.pixels[index];
    pixels[offset + 3] = 255;
  }
  return Object.freeze({ width, height, pixels });
}

export function calculateOceanFoamDetailMipLevelCount(width: number, height: number): number {
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) {
    throw new Error("Ocean foam detail texture dimensions are invalid.");
  }
  let mipWidth = width;
  let mipHeight = height;
  let count = 0;
  while (true) {
    count++;
    if (mipWidth === 1 && mipHeight === 1) return count;
    mipWidth = Math.max(1, Math.floor(mipWidth / 2));
    mipHeight = Math.max(1, Math.floor(mipHeight / 2));
  }
}

export function calculateOceanFoamDetailResourceBytes(width: number, height: number): number {
  calculateOceanFoamDetailMipLevelCount(width, height);
  let mipWidth = width;
  let mipHeight = height;
  let resourceBytes = 0;
  while (true) {
    resourceBytes += mipWidth * mipHeight * TEXTURE_CHANNEL_COUNT;
    if (mipWidth === 1 && mipHeight === 1) {
      return resourceBytes;
    }
    mipWidth = Math.max(1, Math.floor(mipWidth / 2));
    mipHeight = Math.max(1, Math.floor(mipHeight / 2));
  }
}

async function loadGrayscaleSource(url: string, label: string): Promise<OceanFoamDetailGrayscaleSource> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.decoding = "async";
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`Ocean foam detail ${label} texture failed to load: ${url}`));
  });
  image.src = url;
  await loaded;
  if (image.naturalWidth !== OCEAN_FOAM_DETAIL_TEXTURE_SIZE || image.naturalHeight !== OCEAN_FOAM_DETAIL_TEXTURE_SIZE) {
    throw new Error(
      `Ocean foam detail ${label} texture must be ${OCEAN_FOAM_DETAIL_TEXTURE_SIZE}x${OCEAN_FOAM_DETAIL_TEXTURE_SIZE}.`
    );
  }

  const canvas = document.createElement("canvas");
  canvas.width = OCEAN_FOAM_DETAIL_TEXTURE_SIZE;
  canvas.height = OCEAN_FOAM_DETAIL_TEXTURE_SIZE;
  const context = canvas.getContext("2d", {
    alpha: false,
    willReadFrequently: true
  });
  if (!context) {
    throw new Error("Ocean foam detail texture canvas context is unavailable.");
  }
  context.drawImage(image, 0, 0, OCEAN_FOAM_DETAIL_TEXTURE_SIZE, OCEAN_FOAM_DETAIL_TEXTURE_SIZE);
  const rgba = context.getImageData(0, 0, OCEAN_FOAM_DETAIL_TEXTURE_SIZE, OCEAN_FOAM_DETAIL_TEXTURE_SIZE).data;
  const pixelCount = OCEAN_FOAM_DETAIL_TEXTURE_SIZE * OCEAN_FOAM_DETAIL_TEXTURE_SIZE;
  const pixels = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index++) {
    pixels[index] = calibrateOceanFoamOpacity(
      rgba[index * TEXTURE_CHANNEL_COUNT]
    );
  }
  return Object.freeze({
    width: OCEAN_FOAM_DETAIL_TEXTURE_SIZE,
    height: OCEAN_FOAM_DETAIL_TEXTURE_SIZE,
    pixels
  });
}

/**
 * Demo-owned bridge from three ambientCG grayscale opacity inputs to the
 * caller-owned RGB breakup binding consumed by the Ocean water runtime.
 */
export class OceanFoamDetailTextureLibrary {
  readonly metrics: Readonly<OceanFoamDetailTextureLibraryMetrics>;
  private readonly _binding: Readonly<WaterFoamDetailTextureBinding>;
  private readonly _mutableMetrics: MutableMetrics;
  private _destroyed = false;

  private constructor(
    private readonly _texture: Texture2D,
    width: number,
    height: number,
    resourceBytes: number
  ) {
    this._binding = Object.freeze({
      texture: _texture,
      ownership: "borrowed",
      resourceBytes
    });
    this._mutableMetrics = {
      ownership: "borrowed",
      sourceImageCount: 3,
      textureCount: 1,
      textureCreateCount: 1,
      textureDestroyCount: 0,
      textureUploadCount: 1,
      mipmapGenerationCount: 1,
      width,
      height,
      mipLevelCount: calculateOceanFoamDetailMipLevelCount(width, height),
      resourceBytes,
      channelPacking: CHANNEL_PACKING,
      destroyed: false
    };
    this.metrics = this._mutableMetrics;
  }

  get binding(): Readonly<WaterFoamDetailTextureBinding> {
    if (this._destroyed) {
      throw new Error("Ocean foam detail texture library is destroyed.");
    }
    return this._binding;
  }

  static async create(
    engine: Engine,
    options: Readonly<OceanFoamDetailTextureLibraryOptions> = {}
  ): Promise<OceanFoamDetailTextureLibrary> {
    const [thick, medium, fine] = await Promise.all([
      loadGrayscaleSource(THICK_FOAM_OPACITY_URL, "thick"),
      loadGrayscaleSource(MEDIUM_FOAM_OPACITY_URL, "medium"),
      loadGrayscaleSource(FINE_FOAM_OPACITY_URL, "fine")
    ]);
    return OceanFoamDetailTextureLibrary.createFromSources(engine, { thick, medium, fine }, options);
  }

  static createFromSources(
    engine: Engine,
    sources: Readonly<OceanFoamDetailChannelSources>,
    options: Readonly<OceanFoamDetailTextureLibraryOptions> = {}
  ): OceanFoamDetailTextureLibrary {
    const packed = packOceanFoamDetailChannels(sources);
    const texture = (options.textureFactory ?? defaultTextureFactory).create(
      engine,
      packed.width,
      packed.height,
      TextureFormat.R8G8B8A8,
      true,
      false,
      TEXTURE_NAME
    );
    try {
      texture.name = TEXTURE_NAME;
      texture.filterMode = TextureFilterMode.Trilinear;
      texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Repeat;
      texture.isGCIgnored = true;
      texture.setPixelBuffer(packed.pixels);
      texture.generateMipmaps();
      return new OceanFoamDetailTextureLibrary(
        texture,
        packed.width,
        packed.height,
        calculateOceanFoamDetailResourceBytes(packed.width, packed.height)
      );
    } catch (error) {
      texture.destroy(true);
      throw error;
    }
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._texture.destroy(true);
    this._mutableMetrics.textureCount = 0;
    this._mutableMetrics.textureDestroyCount++;
    this._mutableMetrics.resourceBytes = 0;
    this._mutableMetrics.destroyed = true;
  }
}
