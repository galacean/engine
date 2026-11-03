import {
  AssetType,
  type Engine,
  Texture2D,
  Texture2DArray,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  type VolumetricCloudTextures
} from "@galacean/engine";

const DETAIL_TEXTURE_FORMAT = 88;
const DETAIL_TEXTURE_BYTES_PER_VOXEL = 4;

export type VolumetricCloudNoiseAssets = Pick<VolumetricCloudTextures, "curlNoise" | "blueNoise" | "detailNoise">;

interface SerializedTexture3DData {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly mipCount: number;
  readonly pixels: Uint8Array;
}

const CURL_NOISE_URL = new URL("./assets/cloud-curl-noise.png", import.meta.url).href;
const BLUE_NOISE_URL = new URL("./assets/cloud-blue-noise.png", import.meta.url).href;
const DETAIL_NOISE_URL = new URL("./assets/cloud-detail-3d.asset", import.meta.url).href;

/** Loads the detail, curl and sampling noise shared by every Gallery cloud consumer. */
export async function loadVolumetricCloudNoiseAssets(engine: Engine): Promise<VolumetricCloudNoiseAssets> {
  const [curlNoise, blueNoise, detailResponse] = await Promise.all([
    loadTexture(engine, CURL_NOISE_URL, true, false, TextureFilterMode.Bilinear),
    loadTexture(engine, BLUE_NOISE_URL, false, false, TextureFilterMode.Point),
    fetch(DETAIL_NOISE_URL)
  ]);
  try {
    if (!detailResponse.ok) {
      throw new Error(`Cloud detail Texture3D request failed with status ${detailResponse.status}.`);
    }
    const detailNoise = createDetailTexture(engine, decodeTexture3DAsset(await detailResponse.text()));
    return Object.freeze({ curlNoise, blueNoise, detailNoise });
  } catch (error) {
    curlNoise.destroy();
    blueNoise.destroy();
    throw error;
  }
}

export function decodeTexture3DAsset(source: string): SerializedTexture3DData {
  const readNumber = (field: string): number => {
    const match = source.match(new RegExp(`^\\s*${field}:\\s*(\\d+)\\s*$`, "m"));
    if (!match) throw new Error(`Cloud detail Texture3D is missing ${field}.`);
    return Number(match[1]);
  };
  const width = readNumber("m_Width");
  const height = readNumber("m_Height");
  const depth = readNumber("m_Depth");
  const mipCount = readNumber("m_MipCount");
  const format = readNumber("m_Format");
  const dataSize = readNumber("m_DataSize");
  const dataMatch = source.match(/^\s*_typelessdata:\s*([0-9a-fA-F]+)\s*$/m);
  if (!dataMatch) throw new Error("Cloud detail Texture3D is missing its inline voxel payload.");
  const expectedMipCount = Math.floor(Math.log2(Math.max(width, height, depth))) + 1;
  const isPowerOfTwo = (value: number): boolean => value > 0 && (value & (value - 1)) === 0;
  if (
    width !== height ||
    height !== depth ||
    !isPowerOfTwo(width) ||
    mipCount !== expectedMipCount ||
    format !== DETAIL_TEXTURE_FORMAT
  ) {
    throw new Error(
      `Unexpected cloud detail Texture3D contract: ${width}x${height}x${depth}, ${mipCount} mips, format ${format}.`
    );
  }
  if (dataMatch[1].length !== dataSize * 2) {
    throw new Error(`Cloud detail Texture3D payload has ${dataMatch[1].length / 2} bytes; expected ${dataSize}.`);
  }
  const pixels = new Uint8Array(dataSize);
  for (let index = 0; index < dataSize; index++) {
    pixels[index] = Number.parseInt(dataMatch[1].slice(index * 2, index * 2 + 2), 16);
  }
  return Object.freeze({ width, height, depth, mipCount, pixels });
}

function createDetailTexture(engine: Engine, source: SerializedTexture3DData): Texture2DArray {
  const texture = new Texture2DArray(
    engine,
    source.width,
    source.height,
    source.depth,
    TextureFormat.R8G8B8A8,
    true,
    false
  );
  texture.name = "volumetric_cloud_detail";
  texture.filterMode = TextureFilterMode.Bilinear;
  texture.wrapModeU = TextureWrapMode.Repeat;
  texture.wrapModeV = TextureWrapMode.Repeat;

  let byteOffset = 0;
  for (let mipLevel = 0; mipLevel < source.mipCount; mipLevel++) {
    const width = Math.max(1, source.width >> mipLevel);
    const height = Math.max(1, source.height >> mipLevel);
    const depth = Math.max(1, source.depth >> mipLevel);
    const byteLength = width * height * depth * DETAIL_TEXTURE_BYTES_PER_VOXEL;
    texture.setPixelBuffer(
      0,
      source.pixels.subarray(byteOffset, byteOffset + byteLength),
      mipLevel,
      0,
      0,
      width,
      height,
      depth
    );
    byteOffset += byteLength;
  }
  if (byteOffset !== source.pixels.byteLength) {
    texture.destroy();
    throw new Error(`Cloud detail Texture3D mip chain consumed ${byteOffset} of ${source.pixels.byteLength} bytes.`);
  }
  return texture;
}

async function loadTexture(
  engine: Engine,
  url: string,
  mipmap: boolean,
  isSRGBColorSpace: boolean,
  filterMode: TextureFilterMode
): Promise<Texture2D> {
  const texture = await engine.resourceManager.load<Texture2D>({
    type: AssetType.Texture,
    url,
    params: {
      mipmap,
      isSRGBColorSpace,
      filterMode,
      wrapModeU: TextureWrapMode.Repeat,
      wrapModeV: TextureWrapMode.Repeat,
      anisoLevel: 1
    }
  });
  if (!(texture instanceof Texture2D) || texture.width <= 0 || texture.height <= 0) {
    throw new Error(`Cloud noise texture failed to provide valid dimensions: ${url}`);
  }
  return texture;
}
