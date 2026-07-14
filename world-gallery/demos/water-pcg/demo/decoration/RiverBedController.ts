/**
 * Demo-only opaque riverbed used to make water transmission observable.
 *
 * Production terrain remains externally owned. This controller turns the
 * compiled Terrain corridor contract into a small V-shaped gravel bed. Medium
 * can then sample a real opaque depth instead of the far plane, while Low
 * exposes the same bed through its inexpensive alpha approximation.
 */
import {
  Engine,
  Entity,
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
import { RIVER_TERRAIN_CORRIDOR_COMPONENT } from "../../compiler/river/constants";
import type {
  ReadonlyVector3Tuple,
  RiverCompiledData,
  RiverGeometryBounds,
  RiverTerrainReachCorridorData,
  Vector2Tuple
} from "../../compiler/river/types";

const RIVER_BED_STYLE = {
  minimumDepth: 0.08,
  minimumDirectionLength: 0.00001,
  worldUvScale: 0.16,
  textureSize: 8,
  checkerSize: 2,
  darkColor: [24, 18, 13, 255] as const,
  lightColor: [62, 46, 29, 255] as const,
  pebbleColor: [105, 82, 53, 255] as const,
  pebbleModulo: 11
} as const;

export interface RiverBedChunkGeometry {
  readonly id: string;
  readonly positions: readonly ReadonlyVector3Tuple[];
  readonly uvs: readonly Vector2Tuple[];
  readonly indices: Uint32Array;
  readonly bounds: RiverGeometryBounds;
}

interface RiverBedChunkRuntime {
  readonly entity: Entity;
  readonly mesh: ModelMesh;
}

function createBounds(positions: readonly ReadonlyVector3Tuple[]): RiverGeometryBounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const position of positions) {
    minX = Math.min(minX, position[0]);
    minY = Math.min(minY, position[1]);
    minZ = Math.min(minZ, position[2]);
    maxX = Math.max(maxX, position[0]);
    maxY = Math.max(maxY, position[1]);
    maxZ = Math.max(maxZ, position[2]);
  }
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ]
  };
}

function createWorldUv(position: ReadonlyVector3Tuple): Vector2Tuple {
  return [position[0] * RIVER_BED_STYLE.worldUvScale, position[2] * RIVER_BED_STYLE.worldUvScale];
}

function readCorridorSample(corridor: RiverTerrainReachCorridorData, sampleIndex: number, component: number): number {
  return corridor.samples.at(sampleIndex * corridor.stride + component) ?? 0;
}

function createReachBedGeometry(corridor: RiverTerrainReachCorridorData): RiverBedChunkGeometry {
  const positions: ReadonlyVector3Tuple[] = [];
  const indices: number[] = [];
  for (let sampleIndex = 0; sampleIndex < corridor.sampleCount; sampleIndex++) {
    const previousIndex = Math.max(0, sampleIndex - 1);
    const nextIndex = Math.min(corridor.sampleCount - 1, sampleIndex + 1);
    const x = readCorridorSample(corridor, sampleIndex, RIVER_TERRAIN_CORRIDOR_COMPONENT.x);
    const z = readCorridorSample(corridor, sampleIndex, RIVER_TERRAIN_CORRIDOR_COMPONENT.z);
    const previousX = readCorridorSample(corridor, previousIndex, RIVER_TERRAIN_CORRIDOR_COMPONENT.x);
    const previousZ = readCorridorSample(corridor, previousIndex, RIVER_TERRAIN_CORRIDOR_COMPONENT.z);
    const nextX = readCorridorSample(corridor, nextIndex, RIVER_TERRAIN_CORRIDOR_COMPONENT.x);
    const nextZ = readCorridorSample(corridor, nextIndex, RIVER_TERRAIN_CORRIDOR_COMPONENT.z);
    const directionX = nextX - previousX;
    const directionZ = nextZ - previousZ;
    const directionLength = Math.max(Math.hypot(directionX, directionZ), RIVER_BED_STYLE.minimumDirectionLength);
    const normalX = -directionZ / directionLength;
    const normalZ = directionX / directionLength;
    const surfaceY = readCorridorSample(corridor, sampleIndex, RIVER_TERRAIN_CORRIDOR_COMPONENT.waterSurfaceY);
    const bedY = readCorridorSample(corridor, sampleIndex, RIVER_TERRAIN_CORRIDOR_COMPONENT.riverBedY);
    const halfWidth = readCorridorSample(corridor, sampleIndex, RIVER_TERRAIN_CORRIDOR_COMPONENT.channelHalfWidth);
    const edgeY = surfaceY - RIVER_BED_STYLE.minimumDepth;
    positions.push(
      [x + normalX * halfWidth, edgeY, z + normalZ * halfWidth],
      [x, Math.min(bedY, edgeY), z],
      [x - normalX * halfWidth, edgeY, z - normalZ * halfWidth]
    );
  }
  for (let sampleIndex = 0; sampleIndex < corridor.sampleCount - 1; sampleIndex++) {
    const row = sampleIndex * 3;
    const nextRow = row + 3;
    for (let strip = 0; strip < 2; strip++) {
      const a = row + strip;
      const b = a + 1;
      const c = nextRow + strip;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return {
    id: `reach-${corridor.id}`,
    positions,
    uvs: positions.map(createWorldUv),
    indices: Uint32Array.from(indices),
    bounds: createBounds(positions)
  };
}

export function createRiverBedChunkGeometries(data: RiverCompiledData): RiverBedChunkGeometry[] {
  const reachGeometries = data.terrainInteraction.reachCorridors.map(createReachBedGeometry);
  const junctionGeometries = data.terrainInteraction.junctionCorridors.map((corridor) => {
    const junction = data.junctions[corridor.junctionIndex];
    const edgeY = corridor.waterSurfaceElevation - RIVER_BED_STYLE.minimumDepth;
    const positions: ReadonlyVector3Tuple[] = [
      [junction.position[0], Math.min(corridor.riverBedElevation, edgeY), junction.position[2]],
      ...corridor.boundary.map((position): ReadonlyVector3Tuple => [position[0], edgeY, position[2]])
    ];
    const indices = new Uint32Array(corridor.boundary.length * 3);
    for (let boundaryIndex = 0; boundaryIndex < corridor.boundary.length; boundaryIndex++) {
      const offset = boundaryIndex * 3;
      indices[offset] = 0;
      indices[offset + 1] = boundaryIndex + 1;
      indices[offset + 2] = ((boundaryIndex + 1) % corridor.boundary.length) + 1;
    }
    return {
      id: `junction-${corridor.id}`,
      positions,
      uvs: positions.map(createWorldUv),
      indices,
      bounds: createBounds(positions)
    };
  });
  return [...reachGeometries, ...junctionGeometries];
}

function createRiverBedTexture(engine: Engine): Texture2D {
  const size = RIVER_BED_STYLE.textureSize;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const checker = (Math.floor(x / RIVER_BED_STYLE.checkerSize) + Math.floor(y / RIVER_BED_STYLE.checkerSize)) % 2;
      const isPebble = (x * size + y) % RIVER_BED_STYLE.pebbleModulo === 0;
      const color = isPebble
        ? RIVER_BED_STYLE.pebbleColor
        : checker === 0
          ? RIVER_BED_STYLE.darkColor
          : RIVER_BED_STYLE.lightColor;
      const offset = (y * size + x) * 4;
      pixels.set(color, offset);
    }
  }
  const texture = new Texture2D(engine, size, size, undefined, false, false);
  texture.name = "RiverBedDemoGravel";
  texture.filterMode = TextureFilterMode.Bilinear;
  texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Repeat;
  texture.setPixelBuffer(pixels);
  return texture;
}

/** Renders a disposable opaque terrain stand-in below the water surface. */
export class RiverBedController {
  readonly root: Entity;

  private readonly _engine: Engine;
  private readonly _material: UnlitMaterial;
  private readonly _texture: Texture2D;
  private _chunks: RiverBedChunkRuntime[] = [];

  get chunkCount(): number {
    return this._chunks.length;
  }

  constructor(engine: Engine, parent: Entity) {
    this._engine = engine;
    this.root = parent.createChild("river-bed-decoration");
    this._texture = createRiverBedTexture(engine);
    this._material = new UnlitMaterial(engine);
    this._material.name = "RiverBedDemoMaterial";
    this._material.baseColor = new Color(0.32, 0.28, 0.22, 1);
    this._material.baseTexture = this._texture;
    this._material.renderFace = RenderFace.Double;
  }

  rebuild(data: RiverCompiledData): void {
    this._clearChunks();
    const geometries = createRiverBedChunkGeometries(data);
    this._chunks = geometries.map((geometry) => {
      const entity = this.root.createChild(`river-bed-${geometry.id}`);
      const mesh = new ModelMesh(this._engine);
      mesh.name = `RiverBedDemo-${geometry.id}`;
      mesh.bounds.min.set(...geometry.bounds.min);
      mesh.bounds.max.set(...geometry.bounds.max);
      mesh.setPositions(geometry.positions.map((position) => new Vector3(...position)));
      mesh.setUVs(geometry.uvs.map((uv) => new Vector2(...uv)));
      mesh.setIndices(geometry.positions.length > 65535 ? geometry.indices : new Uint16Array(geometry.indices));
      mesh.addSubMesh(0, geometry.indices.length, MeshTopology.Triangles);
      mesh.uploadData(true);
      const renderer = entity.addComponent(MeshRenderer);
      renderer.mesh = mesh;
      renderer.setMaterial(this._material);
      return { entity, mesh };
    });
  }

  destroy(): void {
    this._clearChunks();
    this.root.destroy();
    this._material.destroy(true);
    this._texture.destroy(true);
  }

  private _clearChunks(): void {
    for (const chunk of this._chunks) {
      chunk.entity.destroy();
      chunk.mesh.destroy(true);
    }
    this._chunks = [];
  }
}
