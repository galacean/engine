import {
  AssetType,
  BoundingBox,
  Color,
  CompareFunction,
  type Engine,
  Material,
  type MeshRenderer,
  ModelMesh,
  Shader,
  type Texture2D,
  Vector2,
  Vector3,
  Vector4
} from "@galacean/engine";
import { SEED_WORLD_GRASS_COLOR_FIELD_DEFAULTS } from "@galacean/engine-vegetation/world/SeedWorldGrassColorField";
import {
  bindSeedWorldGrassColorField,
  bindSeedWorldGrassColorFieldUniforms
} from "@galacean/engine-vegetation/world/SeedWorldGrassColorFieldUniforms";
import { bindSeedWorldGrassTerrainSurface } from "../../runtime/SeedWorldGrassTerrainSurface";

/** Shared palette used by the optional stylized terrain tool. */
export const STYLIZED_TERRAIN_ROAD_COLOR = [0.5520114015120001, 0.44520119451622786, 0.2831487404299921] as const;

/** Configures the surface passed to Clipmap. The colour field opts into stylization. */
export function configureTerrainSurface(material: Material, farLod: number, colorField?: Texture2D): void {
  material.shaderData.setFloat("material_TerrainFarLod", farLod);
  if (!colorField) return;
  material.shaderData.enableMacro("MATERIAL_TERRAIN_GRASS_SHADING");
  material.shaderData.enableMacro("MATERIAL_TERRAIN_ROAD_PALETTE");
  material.shaderData.setColor("material_TerrainRoadColor", new Color(...STYLIZED_TERRAIN_ROAD_COLOR, 1));
  bindSeedWorldGrassColorField(material.shaderData, "material", {
    texture: colorField,
    vistaFromDetail: true,
    tuning: SEED_WORLD_GRASS_COLOR_FIELD_DEFAULTS
  });
}

/** Configure one grass renderer. Supplying a terrain material opts into ground matching. */
export function configureStylizedGrass(renderer: MeshRenderer, terrain?: Material, colorField?: Texture2D): void {
  const target = renderer.shaderData;
  const match = !!terrain?.shaderData.getTexture("material_TerrainAlphamapAtlas");
  target.enableMacro("RENDERER_GRASS_MATCH_GROUND", match ? "1" : "0");
  if (match) bindSeedWorldGrassTerrainSurface(renderer, terrain!);
  if (match && colorField) {
    bindSeedWorldGrassColorField(target, "renderer", {
      texture: colorField,
      vistaFromDetail: true,
      tuning: SEED_WORLD_GRASS_COLOR_FIELD_DEFAULTS
    });
  } else {
    bindSeedWorldGrassColorFieldUniforms(target, "renderer", SEED_WORLD_GRASS_COLOR_FIELD_DEFAULTS);
    target.setVector4("renderer_GrassColorFieldTransform", new Vector4());
  }
}

export interface StylizedVegetationGeometry {
  positions: number[];
  normals: number[];
  uv: number[];
  indices: number[];
  tangents?: number[];
  colors?: number[];
}

type DetailMaterialData = Record<string, { type: string; value: number | string | Record<string, number> }>;

/** Builds caller-owned vegetation resources from a selected style preset. */
export async function createStylizedTerrainDetailResources(
  engine: Engine,
  name: string,
  shader: Parameters<typeof Shader._createFromPrecompiled>[0],
  geometry: StylizedVegetationGeometry,
  properties: DetailMaterialData,
  macros: readonly { name: string }[],
  fadeDistance: number
) {
  const textures = await Promise.all(
    Object.entries(properties)
      .filter(([, property]) => property.type === "Texture")
      .map(
        async ([key, { value }]) =>
          [key, await engine.resourceManager.load<Texture2D>({ url: value as string, type: AssetType.KTX2 })] as const
      )
  );
  const material = new Material(engine, Shader.find(shader.name) ?? Shader._createFromPrecompiled(shader));
  try {
    for (const [key, texture] of textures) material.shaderData.setTexture(key, texture);
    for (const [key, { type, value }] of Object.entries(properties)) {
      if (typeof value === "number") material.shaderData.setFloat(key, value);
      else if (typeof value === "string") continue;
      else if (type === "Color") material.shaderData.setColor(key, new Color(value.r, value.g, value.b, value.a));
      else material.shaderData.setVector4(key, new Vector4(value.x, value.y, value.z, value.w));
    }
    for (const { name } of macros) material.shaderData.enableMacro(name);
    material.shaderData.setFloat("material_WorldPickDepthCompare", CompareFunction.Less);
    material.shaderData.enableMacro("MATERIAL_GRASS_RADIAL_DISTANCE_FADE");
    material.shaderData.setFloat("material_GrassFadeDistance", fadeDistance);
    return { material, mesh: createVegetationMesh(engine, geometry, name) };
  } catch (error) {
    material.destroy();
    throw error;
  }
}

function vertexValues<T>(data: number[], stride: number, make: (...values: number[]) => T): T[] {
  return Array.from({ length: data.length / stride }, (_, i) => make(...data.slice(i * stride, (i + 1) * stride)));
}

function createVegetationMesh(engine: Engine, geometry: StylizedVegetationGeometry, name: string): ModelMesh {
  const mesh = new ModelMesh(engine, name);
  const positions = vertexValues(geometry.positions, 3, (x, y, z) => new Vector3(x, y, z));
  mesh.setPositions(positions);
  BoundingBox.fromPoints(positions, mesh.bounds);
  mesh.setNormals(vertexValues(geometry.normals, 3, (x, y, z) => new Vector3(x, y, z)));
  mesh.setUVs(vertexValues(geometry.uv, 2, (x, y) => new Vector2(x, y)));
  if (geometry.tangents) mesh.setTangents(vertexValues(geometry.tangents, 4, (x, y, z, w) => new Vector4(x, y, z, w)));
  if (geometry.colors) mesh.setColors(vertexValues(geometry.colors, 4, (r, g, b, a) => new Color(r, g, b, a)));
  mesh.setIndices(new Uint16Array(geometry.indices));
  mesh.addSubMesh(0, geometry.indices.length);
  mesh.uploadData(false);
  return mesh;
}
