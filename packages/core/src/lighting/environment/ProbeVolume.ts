import { SphericalHarmonics3, Vector2, Vector3 } from "@galacean/engine-math";
import { Engine } from "../../Engine";
import { ShaderData } from "../../shader/ShaderData";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { Texture2D } from "../../texture/Texture2D";
import { Texture2DArray } from "../../texture/Texture2DArray";
import { TextureFilterMode } from "../../texture/enums/TextureFilterMode";
import { TextureFormat } from "../../texture/enums/TextureFormat";
import { TextureWrapMode } from "../../texture/enums/TextureWrapMode";

const _halfF32 = new Float32Array(1);
const _halfI32 = new Int32Array(_halfF32.buffer);

/** Number of cells covered by a probe brick on each axis. */
export const ProbeBrickCellCount = 3;
/** Number of probes stored by a probe brick on each axis. */
export const ProbeBrickProbeCountPerDimension = ProbeBrickCellCount + 1;
/** Total number of probes stored by one brick. */
export const ProbeBrickProbeCount =
  ProbeBrickProbeCountPerDimension * ProbeBrickProbeCountPerDimension * ProbeBrickProbeCountPerDimension;

/** Adaptive probe brick data. Probe SH order is x-fastest, then y, then z. */
export interface ProbeBrickData {
  /** Brick minimum corner in world space. */
  position: Vector3;
  /** Brick size is `minBrickSize * 3 ^ subdivisionLevel`. */
  subdivisionLevel: number;
  /** 4 x 4 x 4 incoming-radiance SH probes. */
  sphericalHarmonics: SphericalHarmonics3[];
}

/** Serializable adaptive probe brick data. */
export interface ProbeBrickDataJSON {
  position: Vector3 | number[] | { x: number; y: number; z: number };
  subdivisionLevel: number;
  sphericalHarmonics: (SphericalHarmonics3 | number[])[];
}

/** Serializable adaptive probe volume data. */
export interface ProbeVolumeJSON {
  minBrickSize: number;
  bricks: ProbeBrickDataJSON[];
  normalBias?: number;
  viewBias?: number;
}

interface ProbeVolumeGPUResources {
  indexTexture: Texture2D;
  brickTexture: Texture2D;
  shRTexture: Texture2DArray;
  shGTexture: Texture2DArray;
  shBTexture: Texture2DArray;
  shL2RTexture: Texture2DArray;
  shL2GTexture: Texture2DArray;
  shL2BTexture: Texture2DArray;
  shL2CTexture: Texture2DArray;
  indexOrigin: Vector3;
  indexDimensions: Vector3;
  indexTextureSize: Vector2;
  brickTextureSize: Vector2;
  poolTextureSize: Vector2;
  tilesPerRow: number;
}

/**
 * Adaptive Probe Volume data and WebGL2 GPU resources.
 * @remarks Runtime PBR sampling is per fragment. WebGL1 keeps using the scene ambient light.
 */
export class ProbeVolume {
  private static _enableMacro = "SCENE_USE_APV";
  private static _indexTextureProperty = ShaderProperty.getByName("scene_APVIndexTexture");
  private static _brickTextureProperty = ShaderProperty.getByName("scene_APVBrickTexture");
  private static _shRTextureProperty = ShaderProperty.getByName("scene_APVSHRTexture");
  private static _shGTextureProperty = ShaderProperty.getByName("scene_APVSHGTexture");
  private static _shBTextureProperty = ShaderProperty.getByName("scene_APVSHBTexture");
  private static _shL2RTextureProperty = ShaderProperty.getByName("scene_APVSHL2RTexture");
  private static _shL2GTextureProperty = ShaderProperty.getByName("scene_APVSHL2GTexture");
  private static _shL2BTextureProperty = ShaderProperty.getByName("scene_APVSHL2BTexture");
  private static _shL2CTextureProperty = ShaderProperty.getByName("scene_APVSHL2CTexture");
  private static _indexOriginProperty = ShaderProperty.getByName("scene_APVIndexOrigin");
  private static _indexDimensionsProperty = ShaderProperty.getByName("scene_APVIndexDimensions");
  private static _indexTextureSizeProperty = ShaderProperty.getByName("scene_APVIndexTextureSize");
  private static _brickTextureSizeProperty = ShaderProperty.getByName("scene_APVBrickTextureSize");
  private static _poolTextureSizeProperty = ShaderProperty.getByName("scene_APVPoolTextureSize");
  private static _tilesPerRowProperty = ShaderProperty.getByName("scene_APVTilesPerRow");
  private static _invMinBrickSizeProperty = ShaderProperty.getByName("scene_APVInvMinBrickSize");
  private static _normalBiasProperty = ShaderProperty.getByName("scene_APVNormalBias");
  private static _viewBiasProperty = ShaderProperty.getByName("scene_APVViewBias");

  /** Smallest brick size in world units. */
  minBrickSize: number;
  /** Sampling offset along the surface normal in world units. */
  normalBias: number;
  /** Sampling offset along the view direction in world units. */
  viewBias: number;
  /** Adaptive bricks. */
  bricks: ProbeBrickData[];

  private _engine: Engine | null = null;
  private _resources: ProbeVolumeGPUResources | null = null;
  private _dirty = true;

  /**
   * Create an adaptive probe volume.
   * @param minBrickSize - Smallest brick size in world units
   * @param bricks - Adaptive probe bricks
   */
  constructor(minBrickSize: number, bricks: ProbeBrickData[] = []) {
    if (!(minBrickSize > 0)) {
      throw new Error("ProbeVolume minBrickSize must be greater than zero.");
    }
    this.minBrickSize = minBrickSize;
    this.normalBias = minBrickSize * 0.05;
    this.viewBias = 0;
    this.bricks = normalizeBricks(bricks);
  }

  /** Replace all brick data and rebuild GPU resources before the next render. */
  setBricks(bricks: ProbeBrickData[]): void {
    this.bricks = normalizeBricks(bricks);
    this._dirty = true;
  }

  /** Mark mutated brick SH data for GPU re-upload. */
  markDirty(): void {
    this._dirty = true;
  }

  /** Release textures owned by this volume. Detach it from its scene first. */
  dispose(): void {
    this._releaseResources();
    this._engine = null;
  }

  /** Create a probe volume from serialized brick data. */
  static fromJSON(data: ProbeVolumeJSON): ProbeVolume {
    const volume = new ProbeVolume(
      data.minBrickSize,
      data.bricks.map((brick) => ({
        position: toVector3(brick.position),
        subdivisionLevel: brick.subdivisionLevel,
        sphericalHarmonics: brick.sphericalHarmonics.map(toSphericalHarmonics3)
      }))
    );
    volume.normalBias = data.normalBias ?? volume.normalBias;
    volume.viewBias = data.viewBias ?? volume.viewBias;
    return volume;
  }

  /** @internal */
  _updateShaderData(engine: Engine, shaderData: ShaderData): boolean {
    if (!engine._hardwareRenderer.isWebGL2 || this.bricks.length === 0) {
      this._unbindShaderData(shaderData);
      return false;
    }
    if (this._engine && this._engine !== engine) {
      throw new Error("ProbeVolume GPU resources cannot be shared by different engines.");
    }

    const resources = this._resources;
    if (
      resources &&
      (resources.indexTexture.isContentLost ||
        resources.brickTexture.isContentLost ||
        resources.shRTexture.isContentLost ||
        resources.shL2RTexture.isContentLost ||
        resources.shL2CTexture.isContentLost)
    ) {
      this._dirty = true;
    }

    if (this._dirty || !this._resources) {
      this._unbindShaderData(shaderData);
      this._releaseResources();
      this._engine = engine;
      this._resources = this._createResources(engine);
      this._dirty = false;
    }

    this._bindShaderData(shaderData, this._resources);
    return true;
  }

  /** @internal */
  _unbindShaderData(shaderData: ShaderData): void {
    shaderData.disableMacro(ProbeVolume._enableMacro);
    shaderData.setTexture(ProbeVolume._indexTextureProperty, null);
    shaderData.setTexture(ProbeVolume._brickTextureProperty, null);
    shaderData.setTexture(ProbeVolume._shRTextureProperty, null);
    shaderData.setTexture(ProbeVolume._shGTextureProperty, null);
    shaderData.setTexture(ProbeVolume._shBTextureProperty, null);
    shaderData.setTexture(ProbeVolume._shL2RTextureProperty, null);
    shaderData.setTexture(ProbeVolume._shL2GTextureProperty, null);
    shaderData.setTexture(ProbeVolume._shL2BTextureProperty, null);
    shaderData.setTexture(ProbeVolume._shL2CTextureProperty, null);
  }

  private _bindShaderData(shaderData: ShaderData, resources: ProbeVolumeGPUResources): void {
    shaderData.setTexture(ProbeVolume._indexTextureProperty, resources.indexTexture);
    shaderData.setTexture(ProbeVolume._brickTextureProperty, resources.brickTexture);
    shaderData.setTexture(ProbeVolume._shRTextureProperty, resources.shRTexture);
    shaderData.setTexture(ProbeVolume._shGTextureProperty, resources.shGTexture);
    shaderData.setTexture(ProbeVolume._shBTextureProperty, resources.shBTexture);
    shaderData.setTexture(ProbeVolume._shL2RTextureProperty, resources.shL2RTexture);
    shaderData.setTexture(ProbeVolume._shL2GTextureProperty, resources.shL2GTexture);
    shaderData.setTexture(ProbeVolume._shL2BTextureProperty, resources.shL2BTexture);
    shaderData.setTexture(ProbeVolume._shL2CTextureProperty, resources.shL2CTexture);
    shaderData.setVector3(ProbeVolume._indexOriginProperty, resources.indexOrigin);
    shaderData.setVector3(ProbeVolume._indexDimensionsProperty, resources.indexDimensions);
    shaderData.setVector2(ProbeVolume._indexTextureSizeProperty, resources.indexTextureSize);
    shaderData.setVector2(ProbeVolume._brickTextureSizeProperty, resources.brickTextureSize);
    shaderData.setVector2(ProbeVolume._poolTextureSizeProperty, resources.poolTextureSize);
    shaderData.setFloat(ProbeVolume._tilesPerRowProperty, resources.tilesPerRow);
    shaderData.setFloat(ProbeVolume._invMinBrickSizeProperty, 1 / this.minBrickSize);
    shaderData.setFloat(ProbeVolume._normalBiasProperty, this.normalBias);
    shaderData.setFloat(ProbeVolume._viewBiasProperty, this.viewBias);
    shaderData.enableMacro(ProbeVolume._enableMacro);
  }

  private _createResources(engine: Engine): ProbeVolumeGPUResources {
    const bricks = this.bricks;
    const minBrickSize = this.minBrickSize;
    const maxTextureSize = Number(engine._hardwareRenderer.capability.maxTextureSize);
    const indexOrigin = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    const boundsMax = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);

    for (let i = 0; i < bricks.length; i++) {
      const brick = bricks[i];
      const size = minBrickSize * Math.pow(ProbeBrickCellCount, brick.subdivisionLevel);
      indexOrigin.x = Math.min(indexOrigin.x, brick.position.x);
      indexOrigin.y = Math.min(indexOrigin.y, brick.position.y);
      indexOrigin.z = Math.min(indexOrigin.z, brick.position.z);
      boundsMax.x = Math.max(boundsMax.x, brick.position.x + size);
      boundsMax.y = Math.max(boundsMax.y, brick.position.y + size);
      boundsMax.z = Math.max(boundsMax.z, brick.position.z + size);
    }

    const indexDimensions = new Vector3(
      Math.max(1, Math.ceil((boundsMax.x - indexOrigin.x) / minBrickSize)),
      Math.max(1, Math.ceil((boundsMax.y - indexOrigin.y) / minBrickSize)),
      Math.max(1, Math.ceil((boundsMax.z - indexOrigin.z) / minBrickSize))
    );
    const indexCount = indexDimensions.x * indexDimensions.y * indexDimensions.z;
    const indexWidth = Math.min(maxTextureSize, indexCount);
    const indexHeight = Math.ceil(indexCount / indexWidth);
    if (indexHeight > maxTextureSize) {
      throw new Error(`ProbeVolume index requires ${indexWidth}x${indexHeight}, exceeding the device texture limit.`);
    }

    const indexData = new Float32Array(indexWidth * indexHeight * 4);
    const sortedBrickIndices = bricks
      .map((brick, index) => ({ brick, index }))
      .sort((a, b) => b.brick.subdivisionLevel - a.brick.subdivisionLevel);
    for (let i = 0; i < sortedBrickIndices.length; i++) {
      const { brick, index } = sortedBrickIndices[i];
      const cellCount = Math.pow(ProbeBrickCellCount, brick.subdivisionLevel);
      const startGridX = (brick.position.x - indexOrigin.x) / minBrickSize;
      const startGridY = (brick.position.y - indexOrigin.y) / minBrickSize;
      const startGridZ = (brick.position.z - indexOrigin.z) / minBrickSize;
      if (!isGridAligned(startGridX) || !isGridAligned(startGridY) || !isGridAligned(startGridZ)) {
        throw new Error(`ProbeVolume brick ${index} is not aligned to minBrickSize ${minBrickSize}.`);
      }
      const startX = Math.round(startGridX);
      const startY = Math.round(startGridY);
      const startZ = Math.round(startGridZ);
      for (let z = 0; z < cellCount; z++) {
        for (let y = 0; y < cellCount; y++) {
          for (let x = 0; x < cellCount; x++) {
            const gx = startX + x;
            const gy = startY + y;
            const gz = startZ + z;
            if (
              gx < 0 ||
              gy < 0 ||
              gz < 0 ||
              gx >= indexDimensions.x ||
              gy >= indexDimensions.y ||
              gz >= indexDimensions.z
            ) {
              continue;
            }
            const flatIndex = gx + indexDimensions.x * (gy + indexDimensions.y * gz);
            indexData[flatIndex * 4] = index + 1;
          }
        }
      }
    }

    const brickWidth = Math.min(maxTextureSize, bricks.length);
    const brickHeight = Math.ceil(bricks.length / brickWidth);
    const brickData = new Float32Array(brickWidth * brickHeight * 4);
    for (let i = 0; i < bricks.length; i++) {
      const brick = bricks[i];
      const size = minBrickSize * Math.pow(ProbeBrickCellCount, brick.subdivisionLevel);
      const offset = i * 4;
      brickData[offset] = brick.position.x;
      brickData[offset + 1] = brick.position.y;
      brickData[offset + 2] = brick.position.z;
      brickData[offset + 3] = ProbeBrickCellCount / size;
    }

    const maxTilesPerAxis = Math.floor(maxTextureSize / ProbeBrickProbeCountPerDimension);
    const tilesPerRow = Math.min(maxTilesPerAxis, Math.ceil(Math.sqrt(bricks.length)));
    const tileRows = Math.ceil(bricks.length / tilesPerRow);
    if (tileRows > maxTilesPerAxis) {
      throw new Error(`ProbeVolume brick pool with ${bricks.length} bricks exceeds the device texture limit.`);
    }
    const poolWidth = tilesPerRow * ProbeBrickProbeCountPerDimension;
    const poolHeight = tileRows * ProbeBrickProbeCountPerDimension;
    const layerElementCount = poolWidth * poolHeight * 4;
    const shRData = Array.from({ length: ProbeBrickProbeCountPerDimension }, () => new Uint16Array(layerElementCount));
    const shGData = Array.from({ length: ProbeBrickProbeCountPerDimension }, () => new Uint16Array(layerElementCount));
    const shBData = Array.from({ length: ProbeBrickProbeCountPerDimension }, () => new Uint16Array(layerElementCount));
    const shL2RData = Array.from(
      { length: ProbeBrickProbeCountPerDimension },
      () => new Uint16Array(layerElementCount)
    );
    const shL2GData = Array.from(
      { length: ProbeBrickProbeCountPerDimension },
      () => new Uint16Array(layerElementCount)
    );
    const shL2BData = Array.from(
      { length: ProbeBrickProbeCountPerDimension },
      () => new Uint16Array(layerElementCount)
    );
    const shL2CData = Array.from(
      { length: ProbeBrickProbeCountPerDimension },
      () => new Uint16Array(layerElementCount)
    );

    for (let brickIndex = 0; brickIndex < bricks.length; brickIndex++) {
      const brick = bricks[brickIndex];
      const tileX = (brickIndex % tilesPerRow) * ProbeBrickProbeCountPerDimension;
      const tileY = Math.floor(brickIndex / tilesPerRow) * ProbeBrickProbeCountPerDimension;
      for (let z = 0; z < ProbeBrickProbeCountPerDimension; z++) {
        for (let y = 0; y < ProbeBrickProbeCountPerDimension; y++) {
          for (let x = 0; x < ProbeBrickProbeCountPerDimension; x++) {
            const probeIndex = x + ProbeBrickProbeCountPerDimension * (y + ProbeBrickProbeCountPerDimension * z);
            const coefficients = brick.sphericalHarmonics[probeIndex].coefficients;
            const pixelOffset = (tileX + x + poolWidth * (tileY + y)) * 4;
            writeL1Channel(shRData[z], pixelOffset, coefficients, 0);
            writeL1Channel(shGData[z], pixelOffset, coefficients, 1);
            writeL1Channel(shBData[z], pixelOffset, coefficients, 2);
            writeL2Channel(shL2RData[z], pixelOffset, coefficients, 0);
            writeL2Channel(shL2GData[z], pixelOffset, coefficients, 1);
            writeL2Channel(shL2BData[z], pixelOffset, coefficients, 2);
            writeL2C(shL2CData[z], pixelOffset, coefficients);
          }
        }
      }
    }

    const indexTexture = createDataTexture2D(engine, indexWidth, indexHeight, indexData);
    const brickTexture = createDataTexture2D(engine, brickWidth, brickHeight, brickData);
    const shRTexture = createSHTexture(engine, poolWidth, poolHeight, shRData);
    const shGTexture = createSHTexture(engine, poolWidth, poolHeight, shGData);
    const shBTexture = createSHTexture(engine, poolWidth, poolHeight, shBData);
    const shL2RTexture = createSHTexture(engine, poolWidth, poolHeight, shL2RData);
    const shL2GTexture = createSHTexture(engine, poolWidth, poolHeight, shL2GData);
    const shL2BTexture = createSHTexture(engine, poolWidth, poolHeight, shL2BData);
    const shL2CTexture = createSHTexture(engine, poolWidth, poolHeight, shL2CData);

    return {
      indexTexture,
      brickTexture,
      shRTexture,
      shGTexture,
      shBTexture,
      shL2RTexture,
      shL2GTexture,
      shL2BTexture,
      shL2CTexture,
      indexOrigin,
      indexDimensions,
      indexTextureSize: new Vector2(indexWidth, indexHeight),
      brickTextureSize: new Vector2(brickWidth, brickHeight),
      poolTextureSize: new Vector2(poolWidth, poolHeight),
      tilesPerRow
    };
  }

  private _releaseResources(): void {
    const resources = this._resources;
    if (!resources) {
      return;
    }
    resources.indexTexture.destroy(true);
    resources.brickTexture.destroy(true);
    resources.shRTexture.destroy(true);
    resources.shGTexture.destroy(true);
    resources.shBTexture.destroy(true);
    resources.shL2RTexture.destroy(true);
    resources.shL2GTexture.destroy(true);
    resources.shL2BTexture.destroy(true);
    resources.shL2CTexture.destroy(true);
    this._resources = null;
  }
}

function normalizeBricks(bricks: ProbeBrickData[]): ProbeBrickData[] {
  return bricks.map((brick, index) => {
    if (!Number.isInteger(brick.subdivisionLevel) || brick.subdivisionLevel < 0) {
      throw new Error(`ProbeVolume brick ${index} has an invalid subdivisionLevel.`);
    }
    if (brick.sphericalHarmonics.length !== ProbeBrickProbeCount) {
      throw new Error(`ProbeVolume brick ${index} must contain exactly ${ProbeBrickProbeCount} SH probes.`);
    }
    return {
      position: brick.position.clone(),
      subdivisionLevel: brick.subdivisionLevel,
      sphericalHarmonics: brick.sphericalHarmonics.map((sh) => sh.clone())
    };
  });
}

function createDataTexture2D(engine: Engine, width: number, height: number, data: Float32Array): Texture2D {
  const texture = new Texture2D(engine, width, height, TextureFormat.R32G32B32A32, false, false);
  texture.filterMode = TextureFilterMode.Point;
  texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
  texture.setPixelBuffer(data);
  return texture;
}

function createSHTexture(engine: Engine, width: number, height: number, layers: Uint16Array[]): Texture2DArray {
  const texture = new Texture2DArray(
    engine,
    width,
    height,
    ProbeBrickProbeCountPerDimension,
    TextureFormat.R16G16B16A16,
    false,
    false
  );
  texture.filterMode = TextureFilterMode.Bilinear;
  texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
  for (let layer = 0; layer < layers.length; layer++) {
    texture.setPixelBuffer(layer, layers[layer], 0, 0, 0, width, height, 1);
  }
  return texture;
}

function writeL1Channel(out: Uint16Array, offset: number, coefficients: Float32Array, channel: number): void {
  out[offset] = toHalf(coefficients[channel] * 0.886227);
  out[offset + 1] = toHalf(coefficients[3 + channel] * -1.023327);
  out[offset + 2] = toHalf(coefficients[6 + channel] * 1.023327);
  out[offset + 3] = toHalf(coefficients[9 + channel] * -1.023327);
}

function writeL2Channel(out: Uint16Array, offset: number, coefficients: Float32Array, channel: number): void {
  out[offset] = toHalf(coefficients[12 + channel] * 0.858086);
  out[offset + 1] = toHalf(coefficients[15 + channel] * -0.858086);
  out[offset + 2] = toHalf(coefficients[18 + channel] * 0.247708);
  out[offset + 3] = toHalf(coefficients[21 + channel] * -0.858086);
}

function writeL2C(out: Uint16Array, offset: number, coefficients: Float32Array): void {
  out[offset] = toHalf(coefficients[24] * 0.429042);
  out[offset + 1] = toHalf(coefficients[25] * 0.429042);
  out[offset + 2] = toHalf(coefficients[26] * 0.429042);
}

function toVector3(value: Vector3 | number[] | { x: number; y: number; z: number }): Vector3 {
  if (value instanceof Vector3) {
    return value.clone();
  }
  return Array.isArray(value) ? new Vector3(value[0], value[1], value[2]) : new Vector3(value.x, value.y, value.z);
}

function toSphericalHarmonics3(value: SphericalHarmonics3 | number[]): SphericalHarmonics3 {
  if (value instanceof SphericalHarmonics3) {
    return value.clone();
  }
  if (value.length !== 27) {
    throw new Error("ProbeVolume spherical harmonics must contain exactly 27 coefficients.");
  }
  const sh = new SphericalHarmonics3();
  sh.copyFromArray(value);
  return sh;
}

function toHalf(value: number): number {
  _halfF32[0] = value;
  const x = _halfI32[0];
  let bits = (x >> 16) & 0x8000;
  let mantissa = (x >> 12) & 0x07ff;
  const exponent = (x >> 23) & 0xff;
  if (exponent < 103) return bits;
  if (exponent > 142) {
    bits |= 0x7c00;
    bits |= (exponent === 255 ? 0 : 1) && x & 0x007fffff;
    return bits;
  }
  if (exponent < 113) {
    mantissa |= 0x0800;
    bits |= (mantissa >> (114 - exponent)) + ((mantissa >> (113 - exponent)) & 1);
    return bits;
  }
  bits |= ((exponent - 112) << 10) | (mantissa >> 1);
  bits += mantissa & 1;
  return bits;
}

function isGridAligned(value: number): boolean {
  return Math.abs(value - Math.round(value)) < 1e-4;
}
