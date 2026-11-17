import type {
  BoundingBox,
  Buffer,
  BufferMesh,
  Camera,
  Engine,
  Entity,
  Material,
  ModelMesh,
  MeshRenderer,
  Script,
  Texture2D
} from "@galacean/engine";

export const terrainShader: Parameters<typeof import("@galacean/engine").Shader._createFromPrecompiled>[0];
export const grassShader: typeof terrainShader;
export const flowerShader: typeof terrainShader;
export type SeedVegetationGeometry = {
  positions: number[];
  normals: number[];
  uv: number[];
  indices: number[];
  height: number;
  tangents?: number[];
  colors?: number[];
};
export const grassGeometry: SeedVegetationGeometry;
export const flowerPresets: Record<
  "flowers-1" | "flowers-2",
  {
    geometry: SeedVegetationGeometry;
    material: {
      name: string;
      macros: { name: string }[];
      shaderData: Record<string, { type: string; value: string | number | Record<string, number> }>;
    };
  }
>;
export const grassMaterialData: Record<
  string,
  { type: "Float" | "Color" | "Vector4"; value: number | Record<string, number> }
>;
export function createSeedWorldSharedSurfaceTexture(engine: Engine): Promise<Texture2D>;
export function readTerrainMapPixels(texture: Texture2D): Uint8Array<ArrayBuffer>;
export function forEachDetailRoot(
  density: Uint8Array,
  width: number,
  height: number,
  size: number,
  channel: number,
  maximumDensity: number,
  patchX: number,
  patchZ: number,
  patchSize: number,
  visit: (x: number, z: number, index: number) => void
): void;
export function configureTerrainSurface(material: Material, farLod: number, colorField?: Texture2D): void;
export function configureStylizedGrass(renderer: MeshRenderer, terrain?: Material, colorField?: Texture2D): void;
export function createStylizedTerrainDetailResources(
  engine: Engine,
  name: string,
  shader: typeof terrainShader,
  geometry: SeedVegetationGeometry,
  properties: Record<string, { type: string; value: string | number | Record<string, number> }>,
  macros: readonly { name: string }[],
  fadeDistance: number
): Promise<{ material: Material; mesh: ModelMesh }>;

export class TerrainMapComponent extends Script {
  setMaps(
    camera: Camera,
    inputs: {
      heightmap: Texture2D;
      alphamap: Texture2D;
      densityMap: Texture2D;
      material: Material;
      layers: TerrainLayer[];
      channels: [string, string, string, string];
      sizeMetres: number;
      minimumHeight: number;
      maximumHeight: number;
      farMaterial: { firstLod: number; nearTransitionMacro: string; farMacro: string };
    }
  ): { root: Entity; heights: Uint16Array; alpha: Uint8Array; density: Uint8Array; clipmap: TerrainClipmap };
  release(): void;
}
export const DETAIL_TRANSFORM_FLOATS: number;
export const SEED_WORLD_GRASS_DENSITY_PER_SQUARE_METRE: number;
export const SEED_WORLD_GRASS_HEIGHT_METRES: { minimum: number; maximum: number };

export function createSeedWorldDetailInstancedMesh(
  engine: Engine,
  source: ModelMesh,
  transforms: Float32Array,
  instanceCount: number,
  bounds: BoundingBox,
  name: string
): { mesh: BufferMesh; instanceBuffer: Buffer };

export type TerrainLayer = {
  id: string;
  appearance?: "grass" | "road";
  diffuse?: Texture2D;
  normal?: Texture2D;
  mask?: Texture2D;
  tileSize: [number, number];
  tileOffset: [number, number];
  normalScale: number;
  diffuseRemapMin: [number, number, number, number];
  diffuseRemapMax: [number, number, number, number];
  maskRemapMin: [number, number, number, number];
  maskRemapMax: [number, number, number, number];
  metallic: number;
  smoothness: number;
  specular: [number, number, number, number];
  snowResponse: number;
};

export interface TerrainClipmap {
  readonly renderMaterials: readonly Material[];
  updateHeightRegion(patch: {
    regionId: string;
    sampleOrigin: readonly [number, number];
    sampleSize: readonly [number, number];
    samples: Uint16Array;
  }): void;
  updateAlphamapRegion(patch: {
    regionId: string;
    mapIndex: number;
    sampleOrigin: readonly [number, number];
    sampleSize: readonly [number, number];
    pixels: Uint8Array;
  }): void;
  destroy(): void;
}
