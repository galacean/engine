import { AssetType, type Engine, Material, ShaderMacro, ShaderProperty, Texture2D, Vector2 } from "@galacean/engine";
import type { TreeLeafLightingTuning } from "./AssetAssemblyPresetFactory";
import { usesProjectPlantResources } from "./PlantSpeciesResources";

const MATERIAL_UV_SCALE = ShaderProperty.getByName("material_UvScale");
const MATERIAL_HAS_UV_SCALE = ShaderMacro.getByName("MATERIAL_HAS_UV_SCALE");

export interface TreeSpeciesMaterialResources {
  readonly defaultColorRgb: readonly [number, number, number];
  readonly defaultLeafLightingTuning?: TreeLeafLightingTuning;
  /** Effective source bark repeats per canonical metre, including the active Unity _SurfaceAlbedo_ST scale. */
  readonly trunkUvTilesPerMeter: readonly [circumferential: number, longitudinal: number];
  readonly barkAlbedoUrl: string;
  readonly barkNormalUrl: string;
  readonly leavesUrl: string;
  readonly trunkMaterialUrl: string;
  readonly leafMaterialUrl: string;
}

export interface LoadedTreeSpeciesMaterials {
  readonly defaultColorRgb: readonly [number, number, number];
  readonly defaultLeafLightingTuning?: TreeLeafLightingTuning;
  readonly trunkMaterial: Material;
  readonly leafMaterial: Material;
  readonly leafMask: Texture2D;
  readonly leafMaskId: "leaf";
}

export const TREE_SPECIES_MATERIAL_RESOURCES: Readonly<Record<string, TreeSpeciesMaterialResources>> = Object.freeze({
  "dead-tree": defineResources({
    defaultColorRgb: [126, 106, 92],
    trunkUvTilesPerMeter: [0.966491, 0.302684],
    barkAlbedoUrl: new URL("./generated/procedural-trees/dead-tree/dead-tree-bark-albedo.png", import.meta.url).href,
    barkNormalUrl: new URL("./generated/procedural-trees/dead-tree/dead-tree-bark-normal.png", import.meta.url).href,
    leavesUrl: new URL("./generated/procedural-trees/dead-tree/dead-tree-leaves.png", import.meta.url).href,
    trunkMaterialUrl: new URL("./generated/procedural-trees/dead-tree/dead-tree-trunk.mat", import.meta.url).href,
    leafMaterialUrl: new URL("./generated/procedural-trees/dead-tree/dead-tree-leaves.mat", import.meta.url).href
  })
});

export async function loadTreeSpeciesMaterials(
  engine: Engine,
  key: string,
  label: string,
  resources = TREE_SPECIES_MATERIAL_RESOURCES[key]
): Promise<LoadedTreeSpeciesMaterials> {
  if (!resources) throw new Error(`${label} is missing its material resource binding`);

  const textureNames = {
    barkAlbedo: `${key}-bark-albedo.png`,
    barkNormal: `${key}-bark-normal.png`,
    leaves: `${key}-leaves.png`
  } as const;
  const projectResources = usesProjectPlantResources(engine);
  if (!projectResources)
    engine.resourceManager.registerVirtualResources([
      {
        virtualPath: textureNames.barkAlbedo,
        path: resources.barkAlbedoUrl,
        type: AssetType.Texture,
        params: { isSRGBColorSpace: true, mipmap: true, filterMode: 2, wrapModeU: 1, wrapModeV: 1, anisoLevel: 8 }
      },
      {
        virtualPath: textureNames.barkNormal,
        path: resources.barkNormalUrl,
        type: AssetType.Texture,
        params: { isSRGBColorSpace: false, mipmap: true, filterMode: 2, wrapModeU: 1, wrapModeV: 1, anisoLevel: 8 }
      },
      {
        virtualPath: textureNames.leaves,
        path: resources.leavesUrl,
        type: AssetType.Texture,
        params: { isSRGBColorSpace: true, mipmap: true, filterMode: 2, wrapModeU: 1, wrapModeV: 1, anisoLevel: 8 }
      }
    ]);

  const [trunkMaterial, leafMaterial, leafMask] = await Promise.all([
    engine.resourceManager.load<Material>({ type: AssetType.Material, url: resources.trunkMaterialUrl }),
    engine.resourceManager.load<Material>({ type: AssetType.Material, url: resources.leafMaterialUrl }),
    engine.resourceManager.load<Texture2D>({
      type: AssetType.Texture,
      url: projectResources ? resources.leavesUrl : textureNames.leaves
    })
  ]);
  if (!(trunkMaterial instanceof Material) || trunkMaterial.shader.name !== "Terrain/Surface") {
    throw new Error(`${label} bark material must use Terrain/Surface`);
  }
  if (!(leafMaterial instanceof Material) || leafMaterial.shader.name !== "Terrain/Vegetation") {
    throw new Error(`${label} leaf material must use Terrain/Vegetation`);
  }
  if (!(leafMask instanceof Texture2D) || leafMask.width <= 0 || leafMask.height <= 0) {
    throw new Error(`${label} leaf mask is invalid`);
  }
  const [circumferentialTilesPerMeter, longitudinalTilesPerMeter] = resources.trunkUvTilesPerMeter;
  if (
    !Number.isFinite(circumferentialTilesPerMeter) ||
    !Number.isFinite(longitudinalTilesPerMeter) ||
    circumferentialTilesPerMeter <= 0 ||
    longitudinalTilesPerMeter <= 0
  ) {
    throw new RangeError(`${label} bark UV density must contain two finite positive values`);
  }
  if (!projectResources) {
    trunkMaterial.shaderData.setVector2(
      MATERIAL_UV_SCALE,
      new Vector2(circumferentialTilesPerMeter, longitudinalTilesPerMeter)
    );
    trunkMaterial.shaderData.enableMacro(MATERIAL_HAS_UV_SCALE);
  }
  return Object.freeze({
    defaultColorRgb: resources.defaultColorRgb,
    defaultLeafLightingTuning: resources.defaultLeafLightingTuning,
    trunkMaterial,
    leafMaterial,
    leafMask,
    leafMaskId: "leaf" as const
  });
}

function defineResources(resources: TreeSpeciesMaterialResources): TreeSpeciesMaterialResources {
  return Object.freeze(resources);
}
