/**
 * Demo-only opaque terrain used to make water transmission observable.
 *
 * Production terrain remains externally owned. River previews build a broad
 * deterministic height field around compiled corridors, while the pool keeps its
 * authored flat floor. Medium can sample real opaque depth instead of the far
 * plane, and Low exposes the same terrain through its alpha approximation.
 */
import {
  BlinnPhongMaterial,
  Engine,
  Entity,
  Material,
  MeshRenderer,
  MeshTopology,
  ModelMesh,
  RenderFace,
  Texture2D,
  TextureFilterMode,
  TextureWrapMode,
  UnlitMaterial
} from "@galacean/engine-core";
import { Color, Vector2, Vector3 } from "@galacean/engine-math";
import type { RiverCompiledData } from "../../compiler/river/types";
import {
  HEIGHTFIELD_RIVER_BED_TEXTURE_STYLE,
  POOL_BED_TEXTURE_STYLE,
  RIVER_BED_TEXTURE_STYLE,
  WaterDecorationStyle,
  WATER_BED_MATERIAL_COLOR,
  WATER_TERRAIN_HASH_STYLE
} from "./constants";
import { createRiverBedChunkGeometries } from "./WaterTerrainBuilder";

export {
  createRiverBedChunkGeometries,
  createWaterTerrainHeightSampler,
  type RiverBedChunkGeometry,
  type WaterTerrainHeightSampler
} from "./WaterTerrainBuilder";

interface RiverBedChunkRuntime {
  readonly entity: Entity;
  readonly mesh: ModelMesh;
}

function interpolate(from: number, to: number, weight: number): number {
  return from + (to - from) * weight;
}

function mixChannel(from: number, to: number, weight: number): number {
  return Math.round(interpolate(from, to, weight));
}

function smoothStep(value: number): number {
  return value * value * (3 - 2 * value);
}

function hashPeriodicGrid(x: number, y: number, period: number, seed: number): number {
  const wrappedX = ((x % period) + period) % period;
  const wrappedY = ((y % period) + period) % period;
  let hash =
    seed ^
    Math.imul(wrappedX + 1, WATER_TERRAIN_HASH_STYLE.xMultiplier) ^
    Math.imul(wrappedY + 1, WATER_TERRAIN_HASH_STYLE.zMultiplier);
  hash = Math.imul(hash ^ (hash >>> 16), WATER_TERRAIN_HASH_STYLE.avalancheMultiplierA);
  hash = Math.imul(hash ^ (hash >>> 15), WATER_TERRAIN_HASH_STYLE.avalancheMultiplierB);
  return ((hash ^ (hash >>> 16)) >>> 0) / WATER_TERRAIN_HASH_STYLE.unsignedMaximum;
}

function samplePeriodicValueNoise(x: number, y: number, size: number, cellSize: number, seed: number): number {
  const gridX = x / cellSize;
  const gridY = y / cellSize;
  const x0 = Math.floor(gridX);
  const y0 = Math.floor(gridY);
  const period = size / cellSize;
  const tx = smoothStep(gridX - x0);
  const ty = smoothStep(gridY - y0);
  const top = interpolate(hashPeriodicGrid(x0, y0, period, seed), hashPeriodicGrid(x0 + 1, y0, period, seed), tx);
  const bottom = interpolate(
    hashPeriodicGrid(x0, y0 + 1, period, seed),
    hashPeriodicGrid(x0 + 1, y0 + 1, period, seed),
    tx
  );
  return interpolate(top, bottom, ty);
}

function createNaturalBedTexturePixels(
  style: typeof RIVER_BED_TEXTURE_STYLE | typeof HEIGHTFIELD_RIVER_BED_TEXTURE_STYLE
): Uint8Array {
  const size = style.textureSize;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const broad = samplePeriodicValueNoise(x, y, size, style.broadCellSize, style.broadSeed);
      const medium = samplePeriodicValueNoise(x, y, size, style.mediumCellSize, style.mediumSeed);
      const fine = samplePeriodicValueNoise(x, y, size, style.fineCellSize, style.fineSeed);
      const sediment = broad * style.broadWeight + medium * style.mediumWeight + fine * style.fineWeight;
      const from = sediment < 0.5 ? style.darkColor : style.middleColor;
      const to = sediment < 0.5 ? style.middleColor : style.lightColor;
      const blend = sediment < 0.5 ? sediment * 2 : (sediment - 0.5) * 2;
      const offset = (y * size + x) * 4;
      pixels[offset] = mixChannel(from[0], to[0], blend);
      pixels[offset + 1] = mixChannel(from[1], to[1], blend);
      pixels[offset + 2] = mixChannel(from[2], to[2], blend);
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

export function createRiverBedTexturePixels(): Uint8Array {
  return createNaturalBedTexturePixels(RIVER_BED_TEXTURE_STYLE);
}

export function createHeightfieldRiverBedTexturePixels(): Uint8Array {
  return createNaturalBedTexturePixels(HEIGHTFIELD_RIVER_BED_TEXTURE_STYLE);
}

export function createPoolBedTexturePixels(): Uint8Array {
  const style = POOL_BED_TEXTURE_STYLE;
  const size = style.textureSize;
  const tileSize = size / style.tileCount;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tileX = Math.floor(x / tileSize);
      const tileY = Math.floor(y / tileSize);
      const localX = x % tileSize;
      const localY = y % tileSize;
      const isGrout = localX < style.groutWidth || localY < style.groutWidth;
      const isHighlight = (tileX + tileY) % style.highlightModulo === 0;
      const color = isGrout ? style.groutColor : isHighlight ? style.tileHighlightColor : style.tileColor;
      pixels.set(color, (y * size + x) * 4);
    }
  }
  return pixels;
}

function createBedTexture(engine: Engine, style: WaterDecorationStyle): Texture2D {
  const isHeightfieldRiver = style === WaterDecorationStyle.HeightfieldRiver;
  const isPool = style === WaterDecorationStyle.Pool;
  const size = isHeightfieldRiver
    ? HEIGHTFIELD_RIVER_BED_TEXTURE_STYLE.textureSize
    : isPool
      ? POOL_BED_TEXTURE_STYLE.textureSize
      : RIVER_BED_TEXTURE_STYLE.textureSize;
  const pixels = isHeightfieldRiver
    ? createHeightfieldRiverBedTexturePixels()
    : isPool
      ? createPoolBedTexturePixels()
      : createRiverBedTexturePixels();
  const texture = new Texture2D(engine, size, size, undefined, isHeightfieldRiver, false);
  texture.name = isHeightfieldRiver
    ? "HeightfieldRiverBedDemoSediment"
    : isPool
      ? "PoolBedDemoTiles"
      : "RiverBedDemoGravel";
  texture.filterMode = TextureFilterMode.Bilinear;
  texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Repeat;
  texture.setPixelBuffer(pixels);
  if (isHeightfieldRiver) texture.generateMipmaps();
  return texture;
}

function createSmoothNormals(
  positions: readonly (readonly [number, number, number])[],
  indices: Uint32Array
): Vector3[] {
  const accumulated = new Float32Array(positions.length * 3);
  for (let index = 0; index < indices.length; index += 3) {
    const firstIndex = indices[index];
    const secondIndex = indices[index + 1];
    const thirdIndex = indices[index + 2];
    const first = positions[firstIndex];
    const second = positions[secondIndex];
    const third = positions[thirdIndex];
    const edgeAX = second[0] - first[0];
    const edgeAY = second[1] - first[1];
    const edgeAZ = second[2] - first[2];
    const edgeBX = third[0] - first[0];
    const edgeBY = third[1] - first[1];
    const edgeBZ = third[2] - first[2];
    const normalX = edgeAY * edgeBZ - edgeAZ * edgeBY;
    const normalY = edgeAZ * edgeBX - edgeAX * edgeBZ;
    const normalZ = edgeAX * edgeBY - edgeAY * edgeBX;
    for (const vertexIndex of [firstIndex, secondIndex, thirdIndex]) {
      const offset = vertexIndex * 3;
      accumulated[offset] += normalX;
      accumulated[offset + 1] += normalY;
      accumulated[offset + 2] += normalZ;
    }
  }
  return positions.map((_, vertexIndex) => {
    const offset = vertexIndex * 3;
    const normalX = accumulated[offset];
    const normalY = accumulated[offset + 1];
    const normalZ = accumulated[offset + 2];
    const length = Math.hypot(normalX, normalY, normalZ);
    return length > 0 ? new Vector3(normalX / length, normalY / length, normalZ / length) : new Vector3(0, 1, 0);
  });
}

/** Renders a disposable opaque terrain stand-in around and below the water surface. */
export class RiverBedController {
  readonly root: Entity;

  private readonly _engine: Engine;
  private readonly _materials: Record<WaterDecorationStyle, Material>;
  private readonly _textures: Record<WaterDecorationStyle, Texture2D>;
  private _chunks: RiverBedChunkRuntime[] = [];

  get chunkCount(): number {
    return this._chunks.length;
  }

  constructor(engine: Engine, parent: Entity) {
    this._engine = engine;
    this.root = parent.createChild("river-bed-decoration");
    const riverTexture = createBedTexture(engine, WaterDecorationStyle.River);
    const heightfieldRiverTexture = createBedTexture(engine, WaterDecorationStyle.HeightfieldRiver);
    const poolTexture = createBedTexture(engine, WaterDecorationStyle.Pool);
    const riverMaterial = new UnlitMaterial(engine);
    riverMaterial.name = "RiverBedDemoMaterial";
    riverMaterial.baseColor = new Color(...WATER_BED_MATERIAL_COLOR[WaterDecorationStyle.River]);
    riverMaterial.baseTexture = riverTexture;
    riverMaterial.renderFace = RenderFace.Double;
    const heightfieldRiverMaterial = new BlinnPhongMaterial(engine);
    heightfieldRiverMaterial.name = "HeightfieldRiverBedDemoMaterial";
    heightfieldRiverMaterial.baseColor = new Color(...WATER_BED_MATERIAL_COLOR[WaterDecorationStyle.HeightfieldRiver]);
    heightfieldRiverMaterial.specularColor = new Color(0.035, 0.04, 0.035, 1);
    heightfieldRiverMaterial.shininess = 9;
    heightfieldRiverMaterial.baseTexture = heightfieldRiverTexture;
    heightfieldRiverMaterial.renderFace = RenderFace.Double;
    const poolMaterial = new UnlitMaterial(engine);
    poolMaterial.name = "PoolBedDemoTileMaterial";
    poolMaterial.baseColor = new Color(...WATER_BED_MATERIAL_COLOR[WaterDecorationStyle.Pool]);
    poolMaterial.baseTexture = poolTexture;
    poolMaterial.renderFace = RenderFace.Double;
    this._textures = {
      [WaterDecorationStyle.River]: riverTexture,
      [WaterDecorationStyle.HeightfieldRiver]: heightfieldRiverTexture,
      [WaterDecorationStyle.Pool]: poolTexture
    };
    this._materials = {
      [WaterDecorationStyle.River]: riverMaterial,
      [WaterDecorationStyle.HeightfieldRiver]: heightfieldRiverMaterial,
      [WaterDecorationStyle.Pool]: poolMaterial
    };
  }

  rebuild(data: RiverCompiledData, style: WaterDecorationStyle = WaterDecorationStyle.River): void {
    this._clearChunks();
    const geometries = createRiverBedChunkGeometries(data, style);
    this._chunks = geometries.map((geometry) => {
      const entity = this.root.createChild(`river-bed-${geometry.id}`);
      const mesh = new ModelMesh(this._engine);
      mesh.name = `RiverBedDemo-${geometry.id}`;
      mesh.bounds.min.set(...geometry.bounds.min);
      mesh.bounds.max.set(...geometry.bounds.max);
      mesh.setPositions(geometry.positions.map((position) => new Vector3(...position)));
      mesh.setNormals(createSmoothNormals(geometry.positions, geometry.indices));
      mesh.setUVs(geometry.uvs.map((uv) => new Vector2(...uv)));
      mesh.setIndices(geometry.positions.length > 65535 ? geometry.indices : new Uint16Array(geometry.indices));
      mesh.addSubMesh(0, geometry.indices.length, MeshTopology.Triangles);
      mesh.uploadData(true);
      const renderer = entity.addComponent(MeshRenderer);
      renderer.mesh = mesh;
      renderer.setMaterial(this._materials[style]);
      return { entity, mesh };
    });
  }

  destroy(): void {
    this._clearChunks();
    this.root.destroy();
    for (const material of Object.values(this._materials)) material.destroy(true);
    for (const texture of Object.values(this._textures)) texture.destroy(true);
  }

  private _clearChunks(): void {
    for (const chunk of this._chunks) {
      chunk.entity.destroy();
      chunk.mesh.destroy(true);
    }
    this._chunks = [];
  }
}
