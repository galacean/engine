import { Matrix, SphericalHarmonics3, Vector3 } from "@galacean/engine-math";
import { Engine } from "../../Engine";
import { ShaderData } from "../../shader/ShaderData";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { Texture2DArray } from "../../texture/Texture2DArray";
import { TextureFilterMode } from "../../texture/enums/TextureFilterMode";
import { TextureFormat } from "../../texture/enums/TextureFormat";
import { TextureWrapMode } from "../../texture/enums/TextureWrapMode";

const _halfF32 = new Float32Array(1);
const _halfI32 = new Int32Array(_halfF32.buffer);
const _l1CoefficientCount = 12;
const _webGL2MinimumArrayTextureLayers = 256;

/** Number of cells covered by a probe brick on each axis. */
export const ProbeBrickCellCount = 3;
/** Number of probes stored by a probe brick on each axis. */
export const ProbeBrickProbeCountPerDimension = ProbeBrickCellCount + 1;
/** Total number of probes stored by one brick. */
export const ProbeBrickProbeCount =
  ProbeBrickProbeCountPerDimension * ProbeBrickProbeCountPerDimension * ProbeBrickProbeCountPerDimension;
/** Width and height of the octahedral visibility map stored by each probe. */
export const ProbeVisibilityResolution = 8;

/** Probe brick data. Probe SH order is x-fastest, then y, then z. */
export interface ProbeBrickData {
  /** Brick minimum corner in probe-local space. */
  position: Vector3;
  /** Brick size is `minBrickSize * 3 ^ subdivisionLevel`. */
  subdivisionLevel: number;
  /** 4 x 4 x 4 incoming-radiance SH probes. */
  sphericalHarmonics: SphericalHarmonics3[];
  /** Optional bake-time directional first-hit distances. Not uploaded at runtime. */
  visibility?: Float32Array[];
  /** Optional bake-time probe confidence in the range [0, 1]. */
  validity?: Float32Array;
}

/** Serializable probe brick data. */
export interface ProbeBrickDataJSON {
  position: Vector3 | number[] | { x: number; y: number; z: number };
  subdivisionLevel: number;
  sphericalHarmonics: (SphericalHarmonics3 | number[])[];
  visibility?: (Float32Array | number[])[];
  validity?: Float32Array | number[];
}

/** Serializable probe volume data. */
export interface ProbeVolumeJSON {
  minBrickSize: number;
  bricks: ProbeBrickDataJSON[];
  localToWorldMatrix?: Matrix | number[];
  normalBias?: number;
  viewBias?: number;
  /** @deprecated Visibility is resolved by the offline lightmapper. */
  visibilityBias?: number;
}

interface ProbeVolumeGPUResources {
  shRTexture: Texture2DArray;
  shGTexture: Texture2DArray;
  shBTexture: Texture2DArray;
  origin: Vector3;
  dimensions: Vector3;
  inverseSpacing: number;
}

interface DenseProbeGrid {
  origin: Vector3;
  dimensions: Vector3;
  inverseSpacing: number;
  shRData: Uint16Array;
  shGData: Uint16Array;
  shBData: Uint16Array;
}

/**
 * Diffuse probe volume data and WebGL2 GPU resources.
 * @remarks Runtime sampling uses three L0/L1 SH texture arrays. Visibility, dilation and invalid-probe repair
 * are bake-time operations and do not add runtime texture reads.
 */
export class ProbeVolume {
  private static _enableMacro = "SCENE_USE_PROBE_VOLUME";
  private static _shRTextureProperty = ShaderProperty.getByName("scene_ProbeVolumeSHRTexture");
  private static _shGTextureProperty = ShaderProperty.getByName("scene_ProbeVolumeSHGTexture");
  private static _shBTextureProperty = ShaderProperty.getByName("scene_ProbeVolumeSHBTexture");
  private static _originProperty = ShaderProperty.getByName("scene_ProbeVolumeOrigin");
  private static _dimensionsProperty = ShaderProperty.getByName("scene_ProbeVolumeDimensions");
  private static _inverseSpacingProperty = ShaderProperty.getByName("scene_ProbeVolumeInverseSpacing");
  private static _normalBiasProperty = ShaderProperty.getByName("scene_ProbeVolumeNormalBias");
  private static _viewBiasProperty = ShaderProperty.getByName("scene_ProbeVolumeViewBias");
  private static _worldToLocalProperty = ShaderProperty.getByName("scene_ProbeVolumeWorldToLocal");

  /** Smallest brick size in probe-local units. */
  minBrickSize: number;
  /** Sampling offset along the surface normal in world units. */
  normalBias: number;
  /** Sampling offset along the view direction in world units. */
  viewBias: number;
  /** @deprecated Visibility is resolved by the offline lightmapper. */
  visibilityBias: number;
  /** Probe bricks. */
  bricks: ProbeBrickData[];

  private _localToWorldMatrix: Matrix;
  private _worldToLocalMatrix = new Matrix();
  private _engine: Engine | null = null;
  private _resources: ProbeVolumeGPUResources | null = null;
  private _dirty = true;

  /**
   * Create a probe volume.
   * @param minBrickSize - Smallest brick size in probe-local units
   * @param bricks - Probe bricks in probe-local space
   * @param localToWorldMatrix - Transform from probe-local space to world space
   */
  constructor(minBrickSize: number, bricks: ProbeBrickData[] = [], localToWorldMatrix: Matrix = new Matrix()) {
    if (!(minBrickSize > 0)) {
      throw new Error("ProbeVolume minBrickSize must be greater than zero.");
    }
    this.minBrickSize = minBrickSize;
    this.normalBias = minBrickSize * 0.05;
    this.viewBias = 0;
    this.visibilityBias = minBrickSize * 0.05;
    this.bricks = normalizeBricks(bricks);
    this._localToWorldMatrix = localToWorldMatrix.clone();
    this._validateTransform();
  }

  /** Transform from probe-local space to world space. Re-bake lighting after changing it. */
  get localToWorldMatrix(): Matrix {
    return this._localToWorldMatrix;
  }

  set localToWorldMatrix(value: Matrix) {
    if (Math.abs(value.determinant()) < 1e-8) {
      throw new Error("ProbeVolume localToWorldMatrix must be invertible.");
    }
    this._localToWorldMatrix.copyFrom(value);
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
        sphericalHarmonics: brick.sphericalHarmonics.map(toSphericalHarmonics3),
        visibility: brick.visibility?.map((distances) => new Float32Array(distances)),
        validity: brick.validity ? new Float32Array(brick.validity) : undefined
      })),
      toMatrix(data.localToWorldMatrix)
    );
    volume.normalBias = data.normalBias ?? volume.normalBias;
    volume.viewBias = data.viewBias ?? volume.viewBias;
    volume.visibilityBias = data.visibilityBias ?? volume.visibilityBias;
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
      (resources.shRTexture.isContentLost || resources.shGTexture.isContentLost || resources.shBTexture.isContentLost)
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
    shaderData.setTexture(ProbeVolume._shRTextureProperty, null);
    shaderData.setTexture(ProbeVolume._shGTextureProperty, null);
    shaderData.setTexture(ProbeVolume._shBTextureProperty, null);
  }

  private _bindShaderData(shaderData: ShaderData, resources: ProbeVolumeGPUResources): void {
    this._validateTransform();
    shaderData.setTexture(ProbeVolume._shRTextureProperty, resources.shRTexture);
    shaderData.setTexture(ProbeVolume._shGTextureProperty, resources.shGTexture);
    shaderData.setTexture(ProbeVolume._shBTextureProperty, resources.shBTexture);
    shaderData.setVector3(ProbeVolume._originProperty, resources.origin);
    shaderData.setVector3(ProbeVolume._dimensionsProperty, resources.dimensions);
    shaderData.setFloat(ProbeVolume._inverseSpacingProperty, resources.inverseSpacing);
    shaderData.setFloat(ProbeVolume._normalBiasProperty, this.normalBias);
    shaderData.setFloat(ProbeVolume._viewBiasProperty, this.viewBias);
    Matrix.invert(this._localToWorldMatrix, this._worldToLocalMatrix);
    shaderData.setMatrix(ProbeVolume._worldToLocalProperty, this._worldToLocalMatrix);
    shaderData.enableMacro(ProbeVolume._enableMacro);
  }

  private _validateTransform(): void {
    if (Math.abs(this._localToWorldMatrix.determinant()) < 1e-8) {
      throw new Error("ProbeVolume localToWorldMatrix must be invertible.");
    }
  }

  private _createResources(engine: Engine): ProbeVolumeGPUResources {
    const grid = buildDenseProbeGrid(this.bricks, this.minBrickSize);
    const maxTextureSize = Number(engine._hardwareRenderer.capability.maxTextureSize);
    if (grid.dimensions.x > maxTextureSize || grid.dimensions.y > maxTextureSize) {
      throw new Error(
        `ProbeVolume grid ${grid.dimensions.x}x${grid.dimensions.y} exceeds the device texture size limit ${maxTextureSize}.`
      );
    }
    if (grid.dimensions.z > _webGL2MinimumArrayTextureLayers) {
      throw new Error(
        `ProbeVolume grid requires ${grid.dimensions.z} array layers; this runtime supports up to ${_webGL2MinimumArrayTextureLayers}.`
      );
    }

    return {
      shRTexture: createSHTexture(engine, grid.dimensions, grid.shRData),
      shGTexture: createSHTexture(engine, grid.dimensions, grid.shGData),
      shBTexture: createSHTexture(engine, grid.dimensions, grid.shBData),
      origin: grid.origin,
      dimensions: grid.dimensions,
      inverseSpacing: grid.inverseSpacing
    };
  }

  private _releaseResources(): void {
    const resources = this._resources;
    if (!resources) {
      return;
    }
    resources.shRTexture.destroy(true);
    resources.shGTexture.destroy(true);
    resources.shBTexture.destroy(true);
    this._resources = null;
  }
}

function buildDenseProbeGrid(bricks: ProbeBrickData[], minBrickSize: number): DenseProbeGrid {
  const origin = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  const boundsMax = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
  for (let i = 0; i < bricks.length; i++) {
    const brick = bricks[i];
    const size = minBrickSize * Math.pow(ProbeBrickCellCount, brick.subdivisionLevel);
    origin.x = Math.min(origin.x, brick.position.x);
    origin.y = Math.min(origin.y, brick.position.y);
    origin.z = Math.min(origin.z, brick.position.z);
    boundsMax.x = Math.max(boundsMax.x, brick.position.x + size);
    boundsMax.y = Math.max(boundsMax.y, brick.position.y + size);
    boundsMax.z = Math.max(boundsMax.z, brick.position.z + size);
  }

  const inverseSpacing = ProbeBrickCellCount / minBrickSize;
  const dimensions = new Vector3(
    Math.max(2, Math.round((boundsMax.x - origin.x) * inverseSpacing) + 1),
    Math.max(2, Math.round((boundsMax.y - origin.y) * inverseSpacing) + 1),
    Math.max(2, Math.round((boundsMax.z - origin.z) * inverseSpacing) + 1)
  );
  const cellDimensions = new Vector3(
    Math.max(1, Math.ceil((boundsMax.x - origin.x) / minBrickSize)),
    Math.max(1, Math.ceil((boundsMax.y - origin.y) / minBrickSize)),
    Math.max(1, Math.ceil((boundsMax.z - origin.z) / minBrickSize))
  );
  const brickOwners = new Int32Array(cellDimensions.x * cellDimensions.y * cellDimensions.z);
  brickOwners.fill(-1);
  const sortedBrickIndices = bricks
    .map((brick, index) => ({ brick, index }))
    .sort((a, b) => b.brick.subdivisionLevel - a.brick.subdivisionLevel);

  for (let i = 0; i < sortedBrickIndices.length; i++) {
    const { brick, index } = sortedBrickIndices[i];
    const coveredCells = Math.pow(ProbeBrickCellCount, brick.subdivisionLevel);
    const gridX = (brick.position.x - origin.x) / minBrickSize;
    const gridY = (brick.position.y - origin.y) / minBrickSize;
    const gridZ = (brick.position.z - origin.z) / minBrickSize;
    if (!isGridAligned(gridX) || !isGridAligned(gridY) || !isGridAligned(gridZ)) {
      throw new Error(`ProbeVolume brick ${index} is not aligned to minBrickSize ${minBrickSize}.`);
    }
    const startX = Math.round(gridX);
    const startY = Math.round(gridY);
    const startZ = Math.round(gridZ);
    for (let z = 0; z < coveredCells; z++) {
      for (let y = 0; y < coveredCells; y++) {
        for (let x = 0; x < coveredCells; x++) {
          const gx = startX + x;
          const gy = startY + y;
          const gz = startZ + z;
          if (
            gx >= 0 &&
            gy >= 0 &&
            gz >= 0 &&
            gx < cellDimensions.x &&
            gy < cellDimensions.y &&
            gz < cellDimensions.z
          ) {
            brickOwners[gx + cellDimensions.x * (gy + cellDimensions.y * gz)] = index;
          }
        }
      }
    }
  }

  const dataLength = dimensions.x * dimensions.y * dimensions.z * 4;
  const shRData = new Uint16Array(dataLength);
  const shGData = new Uint16Array(dataLength);
  const shBData = new Uint16Array(dataLength);
  const probeCount = dimensions.x * dimensions.y * dimensions.z;
  const coefficientData = new Float32Array(probeCount * _l1CoefficientCount);
  const confidenceData = new Float32Array(probeCount);
  for (let z = 0; z < dimensions.z; z++) {
    const localZ = origin.z + z / inverseSpacing;
    const cellZ = Math.min(Math.floor((localZ - origin.z) / minBrickSize), cellDimensions.z - 1);
    for (let y = 0; y < dimensions.y; y++) {
      const localY = origin.y + y / inverseSpacing;
      const cellY = Math.min(Math.floor((localY - origin.y) / minBrickSize), cellDimensions.y - 1);
      for (let x = 0; x < dimensions.x; x++) {
        const localX = origin.x + x / inverseSpacing;
        const cellX = Math.min(Math.floor((localX - origin.x) / minBrickSize), cellDimensions.x - 1);
        const ownerIndex = brickOwners[cellX + cellDimensions.x * (cellY + cellDimensions.y * cellZ)];
        if (ownerIndex < 0) {
          continue;
        }
        const probeIndex = x + dimensions.x * (y + dimensions.y * z);
        confidenceData[probeIndex] = sampleBrickL1(
          bricks[ownerIndex],
          minBrickSize,
          localX,
          localY,
          localZ,
          coefficientData.subarray(probeIndex * _l1CoefficientCount, (probeIndex + 1) * _l1CoefficientCount)
        );
      }
    }
  }

  dilateInvalidProbeL1(coefficientData, confidenceData, dimensions);
  for (let probeIndex = 0; probeIndex < probeCount; probeIndex++) {
    const coefficients = coefficientData.subarray(
      probeIndex * _l1CoefficientCount,
      (probeIndex + 1) * _l1CoefficientCount
    );
    const offset = probeIndex * 4;
    writeL1Channel(shRData, offset, coefficients, 0);
    writeL1Channel(shGData, offset, coefficients, 1);
    writeL1Channel(shBData, offset, coefficients, 2);
  }

  return { origin, dimensions, inverseSpacing, shRData, shGData, shBData };
}

function sampleBrickL1(
  brick: ProbeBrickData,
  minBrickSize: number,
  localX: number,
  localY: number,
  localZ: number,
  out: Float32Array
): number {
  out.fill(0);
  const validityWeighted = new Float32Array(_l1CoefficientCount);
  const brickSize = minBrickSize * Math.pow(ProbeBrickCellCount, brick.subdivisionLevel);
  const probeX = Math.max(
    0,
    Math.min(ProbeBrickCellCount, ((localX - brick.position.x) / brickSize) * ProbeBrickCellCount)
  );
  const probeY = Math.max(
    0,
    Math.min(ProbeBrickCellCount, ((localY - brick.position.y) / brickSize) * ProbeBrickCellCount)
  );
  const probeZ = Math.max(
    0,
    Math.min(ProbeBrickCellCount, ((localZ - brick.position.z) / brickSize) * ProbeBrickCellCount)
  );
  const baseX = Math.min(Math.floor(probeX), ProbeBrickCellCount - 1);
  const baseY = Math.min(Math.floor(probeY), ProbeBrickCellCount - 1);
  const baseZ = Math.min(Math.floor(probeZ), ProbeBrickCellCount - 1);
  const fractionX = probeX - baseX;
  const fractionY = probeY - baseY;
  const fractionZ = probeZ - baseZ;
  let totalValidityWeight = 0;

  for (let z = 0; z < 2; z++) {
    const wz = z === 0 ? 1 - fractionZ : fractionZ;
    for (let y = 0; y < 2; y++) {
      const wy = y === 0 ? 1 - fractionY : fractionY;
      for (let x = 0; x < 2; x++) {
        const wx = x === 0 ? 1 - fractionX : fractionX;
        const probeIndex =
          baseX + x + ProbeBrickProbeCountPerDimension * (baseY + y + ProbeBrickProbeCountPerDimension * (baseZ + z));
        const validity = brick.validity?.[probeIndex] ?? 1;
        const weight = wx * wy * wz;
        const validityWeight = weight * validity;
        const source = brick.sphericalHarmonics[probeIndex].coefficients;
        for (let coefficient = 0; coefficient < _l1CoefficientCount; coefficient++) {
          out[coefficient] += source[coefficient] * weight;
          validityWeighted[coefficient] += source[coefficient] * validityWeight;
        }
        totalValidityWeight += validityWeight;
      }
    }
  }

  if (totalValidityWeight > 1e-5) {
    for (let coefficient = 0; coefficient < _l1CoefficientCount; coefficient++) {
      out[coefficient] = validityWeighted[coefficient] / totalValidityWeight;
    }
    return Math.min(totalValidityWeight, 1);
  }

  // Some legacy bake outputs contain usable SH data but no valid probes. Keep the
  // unweighted interpolation instead of turning the entire volume black.
  return 0;
}

function dilateInvalidProbeL1(coefficients: Float32Array, confidence: Float32Array, dimensions: Vector3): void {
  const confidenceThreshold = 0.5;
  const probeCount = confidence.length;
  const nearestValid = new Int32Array(probeCount);
  const queue = new Int32Array(probeCount);
  nearestValid.fill(-1);
  let head = 0;
  let tail = 0;

  for (let i = 0; i < probeCount; i++) {
    if (confidence[i] >= confidenceThreshold) {
      nearestValid[i] = i;
      queue[tail++] = i;
    }
  }
  if (tail === 0) {
    return;
  }

  const strideY = dimensions.x;
  const strideZ = dimensions.x * dimensions.y;
  while (head < tail) {
    const index = queue[head++];
    const x = index % dimensions.x;
    const y = Math.floor(index / strideY) % dimensions.y;
    const z = Math.floor(index / strideZ);
    if (x > 0) assignNearest(index - 1, index);
    if (x + 1 < dimensions.x) assignNearest(index + 1, index);
    if (y > 0) assignNearest(index - strideY, index);
    if (y + 1 < dimensions.y) assignNearest(index + strideY, index);
    if (z > 0) assignNearest(index - strideZ, index);
    if (z + 1 < dimensions.z) assignNearest(index + strideZ, index);
  }

  const source = coefficients.slice();
  for (let i = 0; i < probeCount; i++) {
    if (confidence[i] >= confidenceThreshold) {
      continue;
    }
    const sourceIndex = nearestValid[i];
    if (sourceIndex < 0) {
      continue;
    }
    const retainedWeight = Math.max(0, confidence[i] / confidenceThreshold);
    const destinationOffset = i * _l1CoefficientCount;
    const sourceOffset = sourceIndex * _l1CoefficientCount;
    for (let coefficient = 0; coefficient < _l1CoefficientCount; coefficient++) {
      coefficients[destinationOffset + coefficient] =
        source[sourceOffset + coefficient] * (1 - retainedWeight) +
        source[destinationOffset + coefficient] * retainedWeight;
    }
  }

  function assignNearest(destination: number, source: number): void {
    if (nearestValid[destination] >= 0) {
      return;
    }
    nearestValid[destination] = nearestValid[source];
    queue[tail++] = destination;
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
      sphericalHarmonics: brick.sphericalHarmonics.map((sh) => sh.clone()),
      visibility: normalizeVisibility(brick.visibility, index),
      validity: normalizeValidity(brick.validity, index)
    };
  });
}

function normalizeValidity(validity: Float32Array | undefined, brickIndex: number): Float32Array | undefined {
  if (!validity) {
    return undefined;
  }
  if (validity.length !== ProbeBrickProbeCount) {
    throw new Error(`ProbeVolume brick ${brickIndex} must contain exactly ${ProbeBrickProbeCount} validity values.`);
  }
  const copy = new Float32Array(validity);
  for (let i = 0; i < copy.length; i++) {
    if (!Number.isFinite(copy[i]) || copy[i] < 0 || copy[i] > 1) {
      throw new Error(`ProbeVolume brick ${brickIndex} validity value ${i} must be in the range [0, 1].`);
    }
  }
  return copy;
}

function normalizeVisibility(visibility: Float32Array[] | undefined, brickIndex: number): Float32Array[] | undefined {
  if (!visibility) {
    return undefined;
  }
  if (visibility.length !== ProbeBrickProbeCount) {
    throw new Error(`ProbeVolume brick ${brickIndex} must contain exactly ${ProbeBrickProbeCount} visibility probes.`);
  }
  const texelCount = ProbeVisibilityResolution * ProbeVisibilityResolution;
  return visibility.map((distances, probeIndex) => {
    if (distances.length !== texelCount) {
      throw new Error(
        `ProbeVolume brick ${brickIndex} visibility probe ${probeIndex} must contain exactly ${texelCount} distances.`
      );
    }
    return new Float32Array(distances);
  });
}

function createSHTexture(engine: Engine, dimensions: Vector3, data: Uint16Array): Texture2DArray {
  const texture = new Texture2DArray(
    engine,
    dimensions.x,
    dimensions.y,
    dimensions.z,
    TextureFormat.R16G16B16A16,
    false,
    false
  );
  texture.filterMode = TextureFilterMode.Bilinear;
  texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
  texture.setPixelBuffer(0, data, 0, 0, 0, dimensions.x, dimensions.y, dimensions.z);
  return texture;
}

function writeL1Channel(out: Uint16Array, offset: number, coefficients: Float32Array, channel: number): void {
  out[offset] = toHalf(coefficients[channel] * 0.886227);
  out[offset + 1] = toHalf(coefficients[3 + channel] * -1.023327);
  out[offset + 2] = toHalf(coefficients[6 + channel] * 1.023327);
  out[offset + 3] = toHalf(coefficients[9 + channel] * -1.023327);
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

function toMatrix(value?: Matrix | number[]): Matrix {
  if (!value) {
    return new Matrix();
  }
  if (value instanceof Matrix) {
    return value.clone();
  }
  if (value.length !== 16) {
    throw new Error("ProbeVolume localToWorldMatrix must contain exactly 16 elements.");
  }
  return new Matrix().copyFromArray(value);
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
