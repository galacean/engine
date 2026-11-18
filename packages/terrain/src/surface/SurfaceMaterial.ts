import {
  Color,
  CompareFunction,
  PBRMaterial,
  Vector2,
  Vector4,
  type Engine,
  type Material,
  type Texture2D
} from "@galacean/engine";
import { registerSurfaceShader } from "./SurfaceShader";
import { bindTerrainGroundSurface } from "../terrain/clipmap/TerrainGroundBinding";

/** Common opaque surface inputs. Projection choices do not change the model geometry. */
export interface SurfaceMaterialOptions {
  baseTexture?: Texture2D;
  normalTexture?: Texture2D;
  baseColor?: Color;
  worldBase?: boolean;
  worldNormal?: boolean;
  textureSizeMetres?: number;
  normalStrength?: number;
  /** Independent world normal repeat; omitted follows the base texture size. */
  normalTextureSizeMetres?: number;
  /** Limit normal-map detail to the terrain-colored region. */
  normalInTerrainRegionOnly?: boolean;
  /** Fade normal-map detail out where terrain color covers the base. */
  normalInBaseRegionOnly?: boolean;
  /** Optional world-projected layer over the base material. */
  coverage?: {
    baseTexture: Texture2D;
    normalTexture: Texture2D;
    sizeMetres?: number;
    normalStrength?: number;
    maskSource: "vertex" | "slope";
    /** Position exponent, contrast, coverage addition, final exponent. */
    maskRemap?: readonly [number, number, number, number];
  };
  terrain?: Material;
  /** Which faces inherit terrain color; the remaining faces retain the base material. */
  terrainColorRegion?: "top" | "sides";
  /** Up-facing normal threshold and smooth transition width. */
  terrainCoverageSlope?: readonly [number, number];
}

/** Creates an owned material; all supplied textures and terrain resources remain borrowed.
 * @param engine Material owner.
 * @param options Shared texture inputs and independently selected projection modes.
 * @returns A common Surface material with optional terrain color coverage.
 */
export function createSurfaceMaterial(engine: Engine, options: SurfaceMaterialOptions = {}): PBRMaterial {
  const material = new PBRMaterial(engine);
  material.shader = registerSurfaceShader();
  material.name = "Surface";
  material.baseColor = options.baseColor ?? new Color(1, 1, 1, 1);
  if (options.baseTexture) material.baseTexture = options.baseTexture;
  if (options.normalTexture) material.normalTexture = options.normalTexture;
  material.normalTextureIntensity = options.normalStrength ?? 0.35;
  material.metallic = 0;
  material.roughness = 1;
  const data = material.shaderData;
  data.setFloat("material_WorldPickDepthCompare", CompareFunction.LessEqual);
  data.setFloat("material_Tiling", 1);
  data.setFloat("material_Smoothness", 0);
  data.setFloat("material_NormalScale", options.normalStrength ?? 0.35);
  data.setFloat("material_OcclusionStrength", 1);
  data.setFloat("material_WorldTextureSize", options.textureSizeMetres ?? 8);
  data.setFloat("material_WorldNormalTextureSize", options.normalTextureSizeMetres ?? 0);
  data.setFloat("material_NormalTerrainRegionOnly", options.normalInTerrainRegionOnly ? 1 : 0);
  data.setFloat("material_NormalBaseRegionOnly", options.normalInBaseRegionOnly ? 1 : 0);
  data.setVector2("material_TerrainCoverageSlope", new Vector2(...(options.terrainCoverageSlope ?? [0.52, 0.25])));
  data.setFloat("material_TerrainCoverageInvert", options.terrainColorRegion === "sides" ? 1 : 0);
  if (options.worldBase) data.enableMacro("MATERIAL_WORLD_BASE");
  if (options.worldNormal) data.enableMacro("MATERIAL_WORLD_NORMAL");
  if (options.coverage) {
    const coverage = options.coverage;
    data.enableMacro("MATERIAL_ENABLE_COVERAGE");
    data.enableMacro(
      coverage.maskSource === "vertex" ? "MATERIAL_COVERAGE_VERTEX_MASK" : "MATERIAL_COVERAGE_SLOPE_MASK"
    );
    data.enableMacro("MATERIAL_COVERAGE_CONSTANT_PROPERTIES");
    data.setTexture("material_CoverageBaseTexture", coverage.baseTexture);
    data.setTexture("material_CoverageNormalTexture", coverage.normalTexture);
    data.setColor("material_CoverageColor", new Color(1, 1, 1, 1));
    data.setFloat("material_CoverageTiling", 1 / (coverage.sizeMetres ?? 3.3333333333));
    data.setFloat("material_CoverageNormalScale", coverage.normalStrength ?? 1);
    data.setFloat("material_CoverageNormalBlending", 0.2);
    data.setFloat("material_CoverageMetallic", 0);
    data.setFloat("material_CoverageSmoothness", 0);
    data.setVector4("material_CoverageVertexChannel", new Vector4(1, 0, 0, 0));
    data.setVector4("material_CoverageMaskRemap", new Vector4(...(coverage.maskRemap ?? [0.66, 1.7, 0.138, 3.6])));
  }
  if (options.terrain) bindSurfaceTerrain(material, options.terrain);
  return material;
}

/** Refreshes terrain residency and color fields without replacing the object's shading normal.
 * @param material Surface material receiving terrain colors.
 * @param terrain Published terrain material owning the shared resources.
 */
export function bindSurfaceTerrain(material: Material, terrain: Material): void {
  const target = material.shaderData,
    source = terrain.shaderData;
  bindTerrainGroundSurface(target, "material", source);
  target.enableMacro("MATERIAL_TERRAIN_COLOR_COVERAGE");
  target.setTexture("material_GrassColorFieldTexture", source.getTexture("material_GrassColorFieldTexture"));
  for (const name of ["material_GrassColorFieldVistaBlend"]) {
    const value = source.getVector2(name);
    if (value) target.setVector2(name, value);
  }
  for (const name of [
    "material_GrassVistaParams",
    "material_GrassColorFieldTransform",
    "material_GrassColorFieldOffset",
    "material_GrassColorFieldParams",
    "material_RoadColorFieldA",
    "material_RoadColorFieldB",
    "material_RoadColorFieldRemap"
  ]) {
    const value = source.getVector4(name);
    if (value) target.setVector4(name, value);
  }
  for (const name of ["material_GrassColorA", "material_GrassColorB"]) {
    const value = source.getColor(name);
    if (value) target.setColor(name, value);
  }
  if (source.getMacros().some((m) => m.name === "MATERIAL_GRASS_SHARED_VISTA"))
    target.enableMacro("MATERIAL_GRASS_SHARED_VISTA");
  else target.disableMacro("MATERIAL_GRASS_SHARED_VISTA");
}
