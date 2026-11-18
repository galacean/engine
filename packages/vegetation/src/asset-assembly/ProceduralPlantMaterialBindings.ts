import {
  validatePlantMaterialManifest,
  type PlantMaterialManifest,
  type MaterialRole,
  type PlantMaterialBinding
} from "./PlantMaterialManifest";
export { validatePlantMaterialManifest, type PlantMaterialManifest } from "./PlantMaterialManifest";
import { loadPlantJSON } from "./ProceduralPlantResources";
import {
  AssetType,
  Color,
  type Engine,
  type Material,
  Texture2D,
  TextureFilterMode,
  TextureWrapMode
} from "@galacean/engine";
import type { AssetAssemblySourceLibrary } from "./AssetAssemblySourceLibrary";
import type { ProceduralPlantAsset } from "./ProceduralPlantAsset";
import {
  configureProceduralLeafMaterial,
  configureProceduralPlantWindMaterial,
  configureProceduralTreeCanopyOcclusionMaterial
} from "./TreeAssemblyRuntime";
import { DEFAULT_PROCEDURAL_TREE_CANOPY_OCCLUSION_TUNING } from "./ProceduralTreeCanopyOcclusion";
import { resolvePlantResourceReference, usesProjectPlantResources } from "./PlantSpeciesResources";

export interface PlantTexturePreview {
  readonly id: string;
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly roles: readonly MaterialRole[];
  readonly assetCount: number;
  readonly baseColors: readonly (readonly [number, number, number])[];
}

export async function loadProceduralPlantMaterialBindings(
  engine: Engine,
  source: AssetAssemblySourceLibrary,
  manifestUrl: string
) {
  const manifest = await loadPlantJSON<PlantMaterialManifest>(engine, manifestUrl);
  validatePlantMaterialManifest(manifest);
  // Load the alpha-card grass material explicitly: Seed World's grass source can
  // be replaced by terrain blades and does not own the imported plant contract.
  const grassMaterial = await engine.resourceManager.load<Material>({
    type: AssetType.Material,
    url: usesProjectPlantResources(engine)
      ? "Material/Vegetation/grass-3.mat"
      : new URL("../../../terrain/src/data/seed-world/public/Material/Vegetation/grass-3.mat", import.meta.url).href
  });
  const textures = new Map<string, Texture2D>();
  for (const [id, descriptor] of Object.entries(manifest.textures)) {
    const texture = await engine.resourceManager.load<Texture2D>({
      type: AssetType.Texture,
      url: resolvePlantResourceReference(descriptor.url, manifestUrl),
      params: {
        isSRGBColorSpace: true,
        mipmap: true,
        filterMode: TextureFilterMode.Trilinear,
        wrapModeU: descriptor.wrapU === "repeat" ? TextureWrapMode.Repeat : TextureWrapMode.Clamp,
        wrapModeV: descriptor.wrapV === "repeat" ? TextureWrapMode.Repeat : TextureWrapMode.Clamp,
        anisoLevel: 8
      }
    });
    if (!(texture instanceof Texture2D) || texture.width !== descriptor.width || texture.height !== descriptor.height)
      throw new Error(`Plant appearance image dimensions changed: ${id}`);
    textures.set(id, texture);
  }
  const nativeMaterials = new Map(
    await Promise.all(
      [
        ...new Set(
          Object.values(manifest.assets).flatMap((slots) =>
            Object.values(slots).flatMap((binding) => (binding.material ? [binding.material] : []))
          )
        )
      ].map(
        async (path) =>
          [path, await engine.resourceManager.load<Material>({ type: AssetType.Material, url: path })] as const
      )
    )
  );
  return {
    ...createProceduralPlantMaterialBindings(source, manifest, textures, grassMaterial, nativeMaterials),
    getTexturePreviews(assetIds: readonly string[]): readonly PlantTexturePreview[] {
      const used = new Map<
        string,
        { roles: Set<MaterialRole>; assets: Set<string>; colours: Map<string, readonly [number, number, number]> }
      >();
      for (const assetId of assetIds) {
        for (const binding of Object.values(manifest.assets[assetId] ?? {})) {
          if (binding.albedo === null) continue;
          const usage = used.get(binding.albedo) ?? {
            roles: new Set<MaterialRole>(),
            assets: new Set<string>(),
            colours: new Map<string, readonly [number, number, number]>()
          };
          usage.roles.add(binding.role);
          usage.assets.add(assetId);
          usage.colours.set(JSON.stringify(binding.baseColor), binding.baseColor);
          used.set(binding.albedo, usage);
        }
      }
      return [...used].map(([id, usage]) => {
        const descriptor = manifest.textures[id];
        return {
          id,
          url: resolvePlantResourceReference(descriptor.url, manifestUrl),
          width: descriptor.width,
          height: descriptor.height,
          roles: [...usage.roles],
          assetCount: usage.assets.size,
          baseColors: [...usage.colours.values()]
        };
      });
    }
  };
}

/** Semantic material roles are independent of model names and geometry generation. */
export function plantMaterialRole(slotName: string): MaterialRole {
  const semantic = slotName
    .toLowerCase()
    .replace(/\.\d+$/, "")
    .replace(/_\d+$/, "")
    .trim();
  switch (semantic) {
    case "bark":
    case "wood":
      return "bark";
    case "leaf":
    case "leaves":
      return "leaf";
    case "ivy":
    case "plants":
    case "cover plants":
      return "shrub";
    case "grass":
      return "grass";
    case "flowers":
      return "flower";
    case "mushroom":
      return "mushroom";
    default:
      throw new Error(`Plant material slot has no production binding: ${slotName}`);
  }
}

/** Shares existing material/texture resources; only the lab-owned material instances are released here. */
export function createProceduralPlantMaterialBindings(
  source: AssetAssemblySourceLibrary,
  manifest: PlantMaterialManifest,
  textures: ReadonlyMap<string, Texture2D>,
  grassMaterial: Material,
  nativeMaterials: ReadonlyMap<string, Material> = new Map()
) {
  const tree = source.treeRecipes[0];
  // This catalog flower is geometry-based, unlike the whole-flower alpha cards in Flowers 1/2.
  const flower = source.flowerFamily.variants.find((variant) => variant.id === "cartoon/flower/flower-1/v1");
  // Imported grass uses textured alpha cards. Terrain/Grass is the separate terrain-blade
  // contract; its terrain colour field and ground-wind inputs do not describe these assets.
  if (
    !tree ||
    !flower ||
    grassMaterial.shader.name !== "Terrain/Vegetation" ||
    !grassMaterial.shaderData.getMacros().some((macro) => macro.name === "MATERIAL_VEGETATION_CLIMATE_GRASS")
  )
    throw new Error("Plant library requires production tree, alpha-card grass and geometry flower materials");
  const sources: Record<MaterialRole, Material> = {
    bark: tree.trunkMaterial,
    leaf: tree.leafMaterial,
    shrub: source.shrub.lods[0].renderer.material,
    grass: grassMaterial,
    flower: flower.lods[0].renderer.material,
    mushroom: source.mushroom.lods[0].renderer.material
  };
  const owned = new Map<string, Material>();
  return {
    colorForSlot(asset: ProceduralPlantAsset, materialId: string): readonly [number, number, number] {
      const binding = manifest.assets[asset.id]?.[materialId];
      if (!binding) throw new Error(`Missing plant material: ${asset.id}/${materialId}`);
      return binding.baseColor;
    },
    materialForSlot(slotName: string, asset: ProceduralPlantAsset, materialId: string): Material {
      const binding = manifest.assets[asset.id]?.[materialId];
      if (!binding || binding.role !== plantMaterialRole(slotName))
        throw new Error(`Missing or mismatched plant material: ${asset.id}/${materialId}`);
      if (binding.material) {
        const source = nativeMaterials.get(binding.material);
        if (!source) throw new Error(`Missing native plant material: ${binding.material}`);
        let material = owned.get(binding.material);
        if (!material) {
          material = source.clone();
          owned.set(binding.material, material);
        }
        return material;
      }
      const { role } = binding;
      // Colour belongs to each renderer's instance data. Only shared rendering
      // state belongs in the material identity used by the Engine batcher.
      const structuralWind = asset.category === "Trees";
      const key = JSON.stringify([binding.role, binding.albedo, binding.alphaCutoff, structuralWind]);
      let material = owned.get(key);
      if (!material) {
        const albedo = binding.albedo === null ? null : textures.get(binding.albedo);
        if ((binding.albedo !== null && !albedo) || !Number.isFinite(binding.alphaCutoff))
          throw new Error(`Missing plant albedo resource: ${binding.albedo}`);
        material = sources[role].clone();
        material.name = `${sources[role].name} · plant library`;
        configureProceduralTreeCanopyOcclusionMaterial(material, {
          ...DEFAULT_PROCEDURAL_TREE_CANOPY_OCCLUSION_TUNING,
          enabled: structuralWind && role !== "bark"
        });
        // The shrub source itself now has structure wind. Ground plants cloned from
        // that source retain their own existing wind contract and geometry inputs.
        if (structuralWind) configureProceduralPlantWindMaterial(material, role !== "bark");
        else {
          material.shaderData.disableMacro("MATERIAL_WIND_PROCEDURAL_TREE");
          material.shaderData.disableMacro("MATERIAL_WIND_PROCEDURAL_PLANT");
          if (role === "flower") material.shaderData.enableMacro("MATERIAL_WIND_PROCEDURAL_FLOWER");
        }
        // The authoring overview owns visibility, just like the existing AtomicAssetPreview.
        material.shaderData.setFloat("material_GrassDistanceFadeEnable", 0);
        if (albedo) configureProceduralLeafMaterial(material, albedo);
        else {
          material.shaderData.disableMacro("MATERIAL_HAS_BASETEXTURE");
          // ShaderData supports clearing references; its Texture overload is non-nullable.
          material.shaderData.setTexture("material_BaseTexture", null!);
        }
        material.shaderData.setFloat("material_Tiling", 1);
        // Reconstructed UVs describe texture placement, including repeat tiles;
        // they are not a root-to-tip coordinate for the inherited wind material.
        material.shaderData.setFloat("material_UVBaseLock", 0);
        material.shaderData.setFloat("material_AlphaCutoff", binding.alphaCutoff);
        // All images are grayscale. Adapt the existing leaf overlay's lower half
        // (2 * tint * sample) to the same linear colour multiplier as the other roles.
        // The renderer supplies the logical baseColor after this neutral texture evaluation.
        const overlay = material.shaderData
          .getMacros()
          .some((macro) => macro.name === "MATERIAL_VEGETATION_CLIMATE_LEAF");
        const gain = overlay && albedo ? 0.5 : 1;
        material.shaderData.setColor("material_BaseColor", new Color(gain, gain, gain, 1));
        material.shaderData.setFloat("material_LeafAlbedoBrightness", 1);
        material.shaderData.setFloat("material_LeafAlbedoDesaturation", 0);
        material.shaderData.setFloat("material_LeafAlbedoTextureBlend", albedo ? 1 : 0);
        // Do not flatten reconstructed custom normals toward world up in the vertex shader.
        material.shaderData.setFloat("material_LightingFlatness", 0);
        // Source custom directions describe a volume, including the back of a card.
        material.shaderData.setFloat("material_LeafFlipBackfaceNormals", 0);
        for (const macro of [
          "MATERIAL_HAS_NORMALTEXTURE",
          "MATERIAL_HAS_SMOOTHNESS_TEXTURE",
          "MATERIAL_ENABLE_SECOND_COLOR",
          "MATERIAL_PROCEDURAL_TREE_TRUNK_VERTICAL_GRADIENT"
        ])
          material.shaderData.disableMacro(macro);
        owned.set(key, material);
      }
      return material;
    },
    destroy(): void {
      owned.forEach((material) => material.destroy());
      owned.clear();
    }
  };
}

/** Separate native material colour from its shared shading carrier before population recolouring.
 * Leaf recipe textures are masks. Keep the authored two-tone luminance gradient, but move
 * chromaticity into the same renderer-owned colour contract as grayscale-tint library assets.
 * Mutates only a population-owned material clone; source materials remain untouched.
 */
export function preparePlantPopulationMaterialColor(material: Material): readonly [number, number, number] {
  const data = material.shaderData,
    base = data.getColor("material_BaseColor");
  const macros = data.getMacros();
  const leaf = macros.some((macro) => macro.name === "MATERIAL_VEGETATION_CLIMATE_LEAF");
  if (!leaf) {
    data.setColor("material_BaseColor", new Color(1, 1, 1, base.a));
    return [base.r, base.g, base.b];
  }
  const blend = Math.max(0, Math.min(1, data.getFloat("material_LeafAlbedoTextureBlend") ?? 0));
  // The existing overlay evaluated against the recipe's white RGB mask.
  const evaluate = (color: Color) =>
    [color.r, color.g, color.b].map((v) => v * (1 - blend) + Math.min(2 * v, 1) * blend);
  const luminance = (rgb: readonly number[]) => rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  const first = evaluate(base),
    firstY = luminance(first);
  const secondary = macros.some((macro) => macro.name === "MATERIAL_ENABLE_SECOND_COLOR")
    ? data.getColor("material_SecondColor")
    : undefined;
  const second = secondary ? evaluate(secondary) : first,
    secondY = luminance(second);
  const referenceY = Math.max(firstY, secondY);
  const reference = firstY > 0 ? first : second;
  const hueY = firstY > 0 ? firstY : secondY;
  const source = reference.map((v) => (hueY > 0 ? (v * referenceY) / hueY : 0)) as [number, number, number];
  const neutral = (value: number) => {
    const ratio = referenceY > 0 ? value / referenceY : 0;
    return ratio <= (1 + blend) / 2 ? ratio / (1 + blend) : (ratio - blend) / (1 - blend);
  };
  const firstGray = neutral(firstY);
  data.setColor("material_BaseColor", new Color(firstGray, firstGray, firstGray, base.a));
  if (secondary) {
    const secondGray = neutral(secondY);
    data.setColor("material_SecondColor", new Color(secondGray, secondGray, secondGray, secondary.a));
  }
  return source;
}
