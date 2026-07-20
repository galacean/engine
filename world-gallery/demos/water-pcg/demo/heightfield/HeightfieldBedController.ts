/** Demo-only opaque bed and banks for the standalone heightfield-water preview. */
import {
  BlinnPhongMaterial,
  Engine,
  Entity,
  MeshRenderer,
  MeshTopology,
  ModelMesh,
  RenderFace,
  Texture2D,
  TextureFilterMode,
  TextureWrapMode
} from "@galacean/engine-core";
import { Color, Vector2, Vector3 } from "@galacean/engine-math";
import type { HeightfieldWaterDescriptorV1 } from "../../authoring/heightfield/HeightfieldWaterDescriptor";

const BED_TEXTURE_SIZE = 128;
const BED_TEXTURE_WORLD_REPEAT = 54;
const BED_BANK_RISE_PER_CELL = 0.24;
const BED_MAX_BANK_RISE = 3.2;
const BED_MIN_BANK_RISE = 0.12;

type Vector2Tuple = readonly [number, number];
type Vector3Tuple = readonly [number, number, number];

export interface HeightfieldBedGeometry {
  readonly positions: readonly Vector3Tuple[];
  readonly normals: readonly Vector3Tuple[];
  readonly uvs: readonly Vector2Tuple[];
  readonly indices: Uint16Array;
  readonly bounds: {
    readonly min: Vector3Tuple;
    readonly max: Vector3Tuple;
  };
}

function createWetDataMaps(descriptor: HeightfieldWaterDescriptorV1): {
  readonly wet: Uint8Array;
  readonly surface: Float32Array;
  readonly bed: Float32Array;
} {
  const texelCount = descriptor.grid.width * descriptor.grid.height;
  const wet = new Uint8Array(texelCount);
  const surface = new Float32Array(texelCount);
  const bed = new Float32Array(texelCount);
  for (let sampleIndex = 0; sampleIndex < descriptor.wetTexelIndices.length; sampleIndex++) {
    const texelIndex = descriptor.wetTexelIndices[sampleIndex];
    wet[texelIndex] = 1;
    surface[texelIndex] = descriptor.surfaceHeights[sampleIndex];
    bed[texelIndex] = descriptor.bedHeights?.[sampleIndex] ?? descriptor.surfaceHeights[sampleIndex] - 2;
  }
  return { wet, surface, bed };
}

function buildNearestWetMaps(
  descriptor: HeightfieldWaterDescriptorV1,
  wet: Uint8Array
): { readonly distance: Int32Array; readonly nearestWet: Int32Array } {
  const { width, height } = descriptor.grid;
  const texelCount = width * height;
  const distance = new Int32Array(texelCount);
  const nearestWet = new Int32Array(texelCount);
  const queue = new Int32Array(texelCount);
  distance.fill(-1);
  nearestWet.fill(-1);
  let queueStart = 0;
  let queueEnd = 0;

  for (let index = 0; index < texelCount; index++) {
    if (wet[index] === 0) continue;
    distance[index] = 0;
    nearestWet[index] = index;
    queue[queueEnd++] = index;
  }

  const visit = (fromIndex: number, candidateIndex: number): void => {
    if (candidateIndex < 0 || candidateIndex >= texelCount || distance[candidateIndex] !== -1) return;
    distance[candidateIndex] = distance[fromIndex] + 1;
    nearestWet[candidateIndex] = nearestWet[fromIndex];
    queue[queueEnd++] = candidateIndex;
  };

  while (queueStart < queueEnd) {
    const current = queue[queueStart++];
    const column = current % width;
    if (column > 0) visit(current, current - 1);
    if (column + 1 < width) visit(current, current + 1);
    if (current >= width) visit(current, current - width);
    if (current + width < texelCount) visit(current, current + width);
  }

  return { distance, nearestWet };
}

function collectAdjacentTexels(vertexColumn: number, vertexRow: number, width: number, height: number): number[] {
  const indices: number[] = [];
  for (let rowOffset = -1; rowOffset <= 0; rowOffset++) {
    const row = vertexRow + rowOffset;
    if (row < 0 || row >= height) continue;
    for (let columnOffset = -1; columnOffset <= 0; columnOffset++) {
      const column = vertexColumn + columnOffset;
      if (column < 0 || column >= width) continue;
      indices.push(row * width + column);
    }
  }
  return indices;
}

function sampleBedVertexHeight(
  adjacentTexels: readonly number[],
  wet: Uint8Array,
  surface: Float32Array,
  bed: Float32Array,
  distance: Int32Array,
  nearestWet: Int32Array,
  worldX: number,
  worldZ: number
): number {
  let wetBedTotal = 0;
  let wetCount = 0;
  for (const texelIndex of adjacentTexels) {
    if (wet[texelIndex] === 0) continue;
    wetBedTotal += bed[texelIndex];
    wetCount++;
  }
  if (wetCount > 0) return wetBedTotal / wetCount;

  let nearestCell = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const texelIndex of adjacentTexels) {
    if (distance[texelIndex] < 0 || distance[texelIndex] >= nearestDistance) continue;
    nearestDistance = distance[texelIndex];
    nearestCell = nearestWet[texelIndex];
  }
  if (nearestCell < 0) return 0;

  const bankRise = Math.min(
    BED_MAX_BANK_RISE,
    BED_MIN_BANK_RISE + Math.max(0, nearestDistance - 1) * BED_BANK_RISE_PER_CELL
  );
  const broadVariation = Math.sin(worldX * 0.075) * 0.14 + Math.cos(worldZ * 0.061) * 0.12;
  return surface[nearestCell] + bankRise + broadVariation;
}

/**
 * Builds one deterministic regular terrain mesh. It reads the authored bed
 * heights under wet texels and grows dry banks outward, including inside holes.
 */
export function createHeightfieldBedGeometry(descriptor: HeightfieldWaterDescriptorV1): HeightfieldBedGeometry {
  const { width, height, originXZ, cellSizeXZ } = descriptor.grid;
  const vertexWidth = width + 1;
  const vertexHeight = height + 1;
  const { wet, surface, bed } = createWetDataMaps(descriptor);
  const { distance, nearestWet } = buildNearestWetMaps(descriptor, wet);
  const heights = new Float32Array(vertexWidth * vertexHeight);
  const positions: Vector3Tuple[] = [];
  const normals: Vector3Tuple[] = [];
  const uvs: Vector2Tuple[] = [];
  const indices = new Uint16Array(width * height * 6);
  const firstX = originXZ[0] - cellSizeXZ[0] * 0.5;
  const firstZ = originXZ[1] - cellSizeXZ[1] * 0.5;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let row = 0; row < vertexHeight; row++) {
    const worldZ = firstZ + row * cellSizeXZ[1];
    for (let column = 0; column < vertexWidth; column++) {
      const worldX = firstX + column * cellSizeXZ[0];
      const heightValue = sampleBedVertexHeight(
        collectAdjacentTexels(column, row, width, height),
        wet,
        surface,
        bed,
        distance,
        nearestWet,
        worldX,
        worldZ
      );
      const vertexIndex = row * vertexWidth + column;
      heights[vertexIndex] = heightValue;
      minY = Math.min(minY, heightValue);
      maxY = Math.max(maxY, heightValue);
      positions.push([worldX, heightValue, worldZ]);
      // Keep the procedural tile larger than the waterway width. The previous
      // ten-metre repeat exposed the texture grid through transparent water.
      uvs.push([column / BED_TEXTURE_WORLD_REPEAT, row / BED_TEXTURE_WORLD_REPEAT]);
    }
  }

  for (let row = 0; row < vertexHeight; row++) {
    for (let column = 0; column < vertexWidth; column++) {
      const left = heights[row * vertexWidth + Math.max(0, column - 1)];
      const right = heights[row * vertexWidth + Math.min(width, column + 1)];
      const top = heights[Math.max(0, row - 1) * vertexWidth + column];
      const bottom = heights[Math.min(height, row + 1) * vertexWidth + column];
      const dx = (right - left) / (column === 0 || column === width ? cellSizeXZ[0] : cellSizeXZ[0] * 2);
      const dz = (bottom - top) / (row === 0 || row === height ? cellSizeXZ[1] : cellSizeXZ[1] * 2);
      const inverseLength = 1 / Math.hypot(dx, 1, dz);
      normals.push([-dx * inverseLength, inverseLength, -dz * inverseLength]);
    }
  }

  let indexOffset = 0;
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const topLeft = row * vertexWidth + column;
      const bottomLeft = topLeft + vertexWidth;
      indices[indexOffset++] = topLeft;
      indices[indexOffset++] = bottomLeft;
      indices[indexOffset++] = topLeft + 1;
      indices[indexOffset++] = topLeft + 1;
      indices[indexOffset++] = bottomLeft;
      indices[indexOffset++] = bottomLeft + 1;
    }
  }

  return {
    positions,
    normals,
    uvs,
    indices,
    bounds: {
      min: [firstX, minY, firstZ],
      max: [firstX + width * cellSizeXZ[0], maxY, firstZ + height * cellSizeXZ[1]]
    }
  };
}

export function createHeightfieldBedTexturePixels(): Uint8Array {
  const pixels = new Uint8Array(BED_TEXTURE_SIZE * BED_TEXTURE_SIZE * 4);

  const hash = (x: number, y: number, period: number): number => {
    const wrappedX = ((x % period) + period) % period;
    const wrappedY = ((y % period) + period) % period;
    let value = Math.imul(wrappedX + 0x68bc21eb, 0x27d4eb2d) ^ Math.imul(wrappedY + 0x165667b1, 0x85ebca6b);
    value ^= value >>> 15;
    value = Math.imul(value, 0x2c1b3c6d);
    value ^= value >>> 12;
    return (value >>> 0) / 0xffffffff;
  };
  const smooth = (value: number): number => value * value * (3 - 2 * value);
  const periodicValueNoise = (x: number, y: number, frequency: number): number => {
    const scaledX = (x / BED_TEXTURE_SIZE) * frequency;
    const scaledY = (y / BED_TEXTURE_SIZE) * frequency;
    const x0 = Math.floor(scaledX);
    const y0 = Math.floor(scaledY);
    const tx = smooth(scaledX - x0);
    const ty = smooth(scaledY - y0);
    const top = hash(x0, y0, frequency) * (1 - tx) + hash(x0 + 1, y0, frequency) * tx;
    const bottom = hash(x0, y0 + 1, frequency) * (1 - tx) + hash(x0 + 1, y0 + 1, frequency) * tx;
    return top * (1 - ty) + bottom * ty;
  };

  for (let row = 0; row < BED_TEXTURE_SIZE; row++) {
    for (let column = 0; column < BED_TEXTURE_SIZE; column++) {
      const broad = periodicValueNoise(column, row, 4);
      const medium = periodicValueNoise(column, row, 9);
      const fine = periodicValueNoise(column, row, 23);
      const sediment = Math.max(0, Math.min(1, broad * 0.55 + medium * 0.3 + fine * 0.15));
      const pebbles = Math.max(0, (fine - 0.68) * 2.4);
      const offset = (row * BED_TEXTURE_SIZE + column) * 4;
      pixels[offset] = 62 + Math.round(sediment * 56 + pebbles * 14);
      pixels[offset + 1] = 59 + Math.round(sediment * 48 + pebbles * 11);
      pixels[offset + 2] = 47 + Math.round(sediment * 36 + pebbles * 8);
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

export class HeightfieldBedController {
  readonly root: Entity;

  private readonly _mesh: ModelMesh;
  private readonly _material: BlinnPhongMaterial;
  private readonly _texture: Texture2D;

  constructor(engine: Engine, parent: Entity, descriptor: HeightfieldWaterDescriptorV1) {
    this.root = parent.createChild("heightfield-demo-bed");
    this._mesh = new ModelMesh(engine);
    this._mesh.name = "HeightfieldWaterDemoBed";
    this._texture = new Texture2D(engine, BED_TEXTURE_SIZE, BED_TEXTURE_SIZE, undefined, true, false);
    this._texture.name = "HeightfieldWaterDemoSediment";
    this._texture.filterMode = TextureFilterMode.Bilinear;
    this._texture.wrapModeU = this._texture.wrapModeV = TextureWrapMode.Repeat;
    this._texture.setPixelBuffer(createHeightfieldBedTexturePixels());
    this._texture.generateMipmaps();
    this._material = new BlinnPhongMaterial(engine);
    this._material.name = "HeightfieldWaterDemoBedMaterial";
    this._material.baseColor = new Color(0.43, 0.42, 0.35, 1);
    this._material.specularColor = new Color(0.035, 0.04, 0.035, 1);
    this._material.shininess = 7;
    this._material.baseTexture = this._texture;
    this._material.renderFace = RenderFace.Double;
    this.rebuild(descriptor);

    const renderer = this.root.addComponent(MeshRenderer);
    renderer.mesh = this._mesh;
    renderer.setMaterial(this._material);
  }

  rebuild(descriptor: HeightfieldWaterDescriptorV1): void {
    const geometry = createHeightfieldBedGeometry(descriptor);
    this._mesh.clearSubMesh();
    this._mesh.bounds.min.set(...geometry.bounds.min);
    this._mesh.bounds.max.set(...geometry.bounds.max);
    this._mesh.setPositions(geometry.positions.map((position) => new Vector3(...position)));
    this._mesh.setNormals(geometry.normals.map((normal) => new Vector3(...normal)));
    this._mesh.setUVs(geometry.uvs.map((uv) => new Vector2(...uv)));
    this._mesh.setIndices(geometry.indices);
    this._mesh.addSubMesh(0, geometry.indices.length, MeshTopology.Triangles);
    this._mesh.uploadData(false);
  }

  destroy(): void {
    this.root.destroy();
    this._mesh.destroy(true);
    this._material.destroy(true);
    this._texture.destroy(true);
  }
}
