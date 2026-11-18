import {
  AssetType,
  BoundingBox,
  Color,
  MeshRenderer,
  Quaternion,
  RenderFace,
  Texture2D,
  Vector2,
  Vector3,
  Vector4,
  type Engine,
  type Entity,
  type Material,
  type ModelMesh,
  type PBRMaterial
} from "@galacean/engine";
import { createSurfaceMaterial } from "@galacean/engine-terrain/surface/SurfaceMaterial";
import { createPlantGeometryExample } from "@galacean/engine-vegetation/asset-assembly/ProceduralPlantExamples";
import {
  buildProceduralPlantGeometry,
  mergePlantGeometryByMaterial,
  type PlantPart,
  type PlantPoint,
  type PlantShape,
  type ProceduralPlantStructure
} from "@galacean/engine-vegetation/asset-assembly/ProceduralPlantGeometry";
import { uploadProceduralPlantGeometry } from "@galacean/engine-vegetation/asset-assembly/ProceduralPlantMeshes";
import {
  configureProceduralPlantWindMaterial,
  expandProceduralTreeWindBounds
} from "@galacean/engine-vegetation/asset-assembly/TreeAssemblyRuntime";
import {
  createDefaultProceduralTreeDistributionTuning,
  createProceduralTreeFoliageGeometryTuning,
  createProceduralTreeMeshesForLods,
  type ProceduralTreeSource
} from "@galacean/engine-vegetation/asset-assembly/ProceduralTreeGenerator";
import {
  createTreeAssemblyInstanceStorage,
  createTreeAssemblyInstancedMesh,
  uploadTreeAssemblyInstances
} from "@galacean/engine-vegetation/asset-assembly/TreeAssemblyInstancedMesh";
import { DEAD_TREE_ASSET_ID } from "@galacean/engine-vegetation/asset-assembly/TreeSpeciesCatalog";
import { TREE_SPECIES_LOD_POLICIES } from "@galacean/engine-vegetation/asset-assembly/TreeSpeciesLodPolicy";
import { TREE_SPECIES_MATERIAL_RESOURCES } from "@galacean/engine-vegetation/asset-assembly/TreeSpeciesMaterialResources";
import { TREE_SPECIES_PARAMETERS } from "@galacean/engine-vegetation/asset-assembly/TreeSpeciesParameters";
import { TREE_STRUCTURE as DEAD_TREE_STRUCTURE } from "@galacean/engine-vegetation/asset-assembly/TreeStructureDeadTree";
import { settlementRandom } from "../../semantic-study/SettlementGeometry";
import { templateLinearColor } from "../WorldTemplateCatalog";

export type TemplateProceduralPlantKind = "dead-wood" | "dry-grass" | "desert-shrub" | "pastel-flower";

export interface TemplateProceduralPlantInstance {
  readonly id: string;
  readonly kind: TemplateProceduralPlantKind;
  readonly x: number;
  readonly z: number;
  readonly heightM: number;
  readonly yawDegrees?: number;
  readonly variant?: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
type PlantColorways = readonly [PlantPoint, PlantPoint, PlantPoint];
const hexPalette = (a: string, b: string, c: string): PlantColorways => [
  templateLinearColor(a),
  templateLinearColor(b),
  templateLinearColor(c)
];

const PROCEDURAL_PALETTE: Record<TemplateProceduralPlantKind, Record<string, PlantColorways>> = {
  "dead-wood": { bark: hexPalette("#cbb096", "#b89b80", "#a3866c") },
  "dry-grass": { foliage: hexPalette("#d8b882", "#e2c694", "#c29e68") },
  "desert-shrub": {
    bark: hexPalette("#8a6d52", "#997a5d", "#785e46"),
    foliage: hexPalette("#7e8a54", "#8e9a60", "#6c7846")
  },
  "pastel-flower": {
    foliage: hexPalette("#8ea062", "#7f9256", "#9eaf6f"),
    petals: hexPalette("#f8b8f4", "#f0a2f4", "#fcd0f8")
  }
};

function tubeShape(sections: readonly [number, PlantPoint, number][]): PlantShape {
  return {
    kind: "tube",
    capStart: true,
    capEnd: true,
    sections: sections.map(([at, center, radius]) => ({ at, center, radius }))
  };
}

function uprightOrientation(angle: number, tilt: number): PlantPart["orientation"] {
  return [Math.sin(angle) * Math.sin(tilt / 2), 0, Math.cos(angle) * Math.sin(tilt / 2), Math.cos(tilt / 2)];
}

function dryGrassRecipe(): ProceduralPlantStructure {
  const blade = createPlantGeometryExample("grass").shapes.blade;
  const parts: PlantPart[] = [];
  for (let i = 0; i < 9; i++) {
    const bearing = i * GOLDEN_ANGLE;
    parts.push({
      id: `blade-${i}`,
      shapeId: "blade",
      materialId: "foliage",
      parentId: null,
      attachment: 0,
      offset: [Math.sin(bearing) * 0.055, 0, Math.cos(bearing) * 0.055],
      orientation: uprightOrientation(bearing, 0.14 + (i % 5) * 0.14),
      scale: 0.72 + (i % 4) * 0.22
    });
  }
  return {
    version: 1,
    shapes: { blade },
    parts,
    lods: [
      {
        partIds: parts.map(({ id }) => id),
        resolution: { subdivisionsPerSpan: 2, widthSegments: 1, radialSegments: 5 }
      }
    ]
  };
}

function desertShrubRecipe(): ProceduralPlantStructure {
  const leaf = createPlantGeometryExample("flower").shapes.leaf;
  const twig = tubeShape([
    [0, [0, 0, 0], 0.022],
    [0.28, [0.04, 0.16, 0.01], 0.016],
    [0.58, [0.12, 0.34, 0.03], 0.011],
    [0.82, [0.22, 0.46, 0.04], 0.006],
    [1, [0.31, 0.51, 0.05], 0.002]
  ]);
  const parts: PlantPart[] = [];
  for (let i = 0; i < 12; i++) {
    const angle = i * GOLDEN_ANGLE;
    const twigId = `twig-${i}`;
    parts.push({
      id: twigId,
      shapeId: "twig",
      materialId: "bark",
      parentId: null,
      attachment: 0,
      offset: [Math.cos(angle) * 0.04, 0, Math.sin(angle) * 0.04],
      orientation: uprightOrientation(angle, 0.22 + (i % 4) * 0.14),
      scale: 0.72 + (i % 4) * 0.12
    });
    for (let j = 0; j < 4; j++) {
      parts.push({
        id: `${twigId}-leaf-${j}`,
        shapeId: "leaf",
        materialId: "foliage",
        parentId: twigId,
        attachment: 0.32 + 0.18 * j,
        offset: [0, 0, 0],
        orientation: uprightOrientation(angle + j * GOLDEN_ANGLE, 0.68 + (j % 2) * 0.22),
        scale: 0.34 + (j % 2) * 0.08
      });
    }
  }
  return {
    version: 1,
    shapes: { twig, leaf },
    parts,
    lods: [
      {
        partIds: parts.map(({ id }) => id),
        resolution: { subdivisionsPerSpan: 2, widthSegments: 2, radialSegments: 5 }
      }
    ]
  };
}

function pastelFlowerRecipe(): ProceduralPlantStructure {
  const flowerExample = createPlantGeometryExample("flower");
  const shapes: Record<string, PlantShape> = {
    stem: flowerExample.shapes.stem,
    leaf: flowerExample.shapes.leaf,
    petal: flowerExample.shapes.petal
  };
  const parts: PlantPart[] = [];
  for (let b = 0; b < 9; b++) {
    const angle = b * GOLDEN_ANGLE;
    const radial = 0.08 + (b % 4) * 0.19;
    const stemId = `bloom-stem-${b}`;
    parts.push({
      id: stemId,
      shapeId: "stem",
      materialId: "foliage",
      parentId: null,
      attachment: 0,
      offset: [Math.cos(angle) * radial, 0, Math.sin(angle) * radial],
      orientation: uprightOrientation(angle, 0.16 + (b % 4) * 0.15),
      scale: 0.62 + (b % 3) * 0.18
    });
    for (let k = 0; k < 2; k++) {
      const leafAngle = angle + k * Math.PI * 0.7;
      parts.push({
        id: `${stemId}-leaf-${k}`,
        shapeId: "leaf",
        materialId: "foliage",
        parentId: stemId,
        attachment: 0.25 + k * 0.25,
        offset: [0, 0, 0],
        orientation: uprightOrientation(leafAngle, 0.72),
        scale: 0.52
      });
    }
    for (let p = 0; p < 5; p++) {
      const pa = (p * 2 * Math.PI) / 5;
      const s = Math.sin(pa / 2),
        c = Math.cos(pa / 2),
        h = Math.SQRT1_2;
      parts.push({
        id: `${stemId}-petal-${p}`,
        shapeId: "petal",
        materialId: "petals",
        parentId: stemId,
        attachment: 1,
        offset: [0, 0, 0],
        orientation: [-h * c, h * s, h * s, h * c],
        scale: 1.55
      });
    }
  }
  return {
    version: 1,
    shapes,
    parts,
    lods: [
      {
        partIds: parts.map(({ id }) => id),
        resolution: { subdivisionsPerSpan: 2, widthSegments: 2, radialSegments: 6 }
      }
    ]
  };
}

function recipeFor(kind: Exclude<TemplateProceduralPlantKind, "dead-wood">): ProceduralPlantStructure {
  if (kind === "dry-grass") return dryGrassRecipe();
  if (kind === "pastel-flower") return pastelFlowerRecipe();
  return desertShrubRecipe();
}

function createDeadTreeVariantMeshes(engine: Engine): readonly { mesh: ModelMesh; destroy: () => void }[] {
  const deadParams = TREE_SPECIES_PARAMETERS["dead-tree"]!;
  const lodPolicy = TREE_SPECIES_LOD_POLICIES["dead-tree"]!;
  const foliageTuning = createProceduralTreeFoliageGeometryTuning();
  const measuredSource: ProceduralTreeSource = {
    id: DEAD_TREE_ASSET_ID,
    label: "Desert Dead Tree Measured",
    size: deadParams.size,
    proceduralProfile: "white-birch",
    proceduralGeometryIdentity: "dead-tree",
    structureParameters: DEAD_TREE_STRUCTURE
  };
  const measuredLod = createProceduralTreeMeshesForLods(
    engine,
    measuredSource,
    [0],
    deadParams.leafCountTuning,
    deadParams.distributionTuning,
    foliageTuning,
    lodPolicy.triangleBudget
  )[0]!;

  const saplingBase: ProceduralTreeSource = {
    id: `${DEAD_TREE_ASSET_ID}:weeping-desert`,
    label: "Desert Weeping Snag",
    size: 10.5,
    proceduralProfile: "white-birch",
    proceduralGeometryIdentity: "desert-weeping-snag"
  };
  const weepingDistribution = {
    ...createDefaultProceduralTreeDistributionTuning(saplingBase),
    geometrySeed: 294817523,
    trunkCount: 1,
    trunkClearHeightPercentOfHeight: 28,
    trunkRadiusPercentOfHeight: 1.55,
    trunkCurveVariationDegrees: 18,
    trunkSplitAngleDegrees: 16,
    branchCount: 7,
    branchLengthPercentOfParent: 42,
    branchMaximumLengthPercentOfHeight: 56,
    branchLengthVariationPercent: 22,
    branchCurveVariationDegrees: 30,
    branchAttractionUp: -0.14,
    branchDownAngleDegrees: 46,
    branchDownAngleVariationDegrees: 14,
    twigCount: 24,
    twigLengthPercentOfParent: 54,
    twigMaximumLengthPercentOfHeight: 28,
    twigLengthVariationPercent: 36,
    twigCurveVariationDegrees: 44,
    twigAttractionUp: -0.22,
    twigDownAngleDegrees: 62,
    twigDownAngleVariationDegrees: 16,
    leafNormalCrownBlendPercent: 0
  };
  const weepingLod = createProceduralTreeMeshesForLods(
    engine,
    saplingBase,
    [0],
    { lod0Count: 0, lod1Count: 0, lod2Count: 0, lod3Count: 0 },
    weepingDistribution,
    foliageTuning,
    lodPolicy.triangleBudget
  )[0]!;

  return [
    {
      mesh: measuredLod.trunk,
      destroy: () => {
        measuredLod.trunk.destroy();
        measuredLod.crown.destroy();
      }
    },
    {
      mesh: weepingLod.trunk,
      destroy: () => {
        weepingLod.trunk.destroy();
        weepingLod.crown.destroy();
      }
    }
  ];
}

function bindDeadTreeBarkTextures(engine: Engine, material: PBRMaterial, isDisposed: () => boolean): void {
  const resources = TREE_SPECIES_MATERIAL_RESOURCES["dead-tree"];
  if (!resources) return;
  const [uScale, vScale] = resources.trunkUvTilesPerMeter;
  material.shaderData.setVector2("material_UvScale", new Vector2(uScale, vScale));
  material.shaderData.enableMacro("MATERIAL_HAS_UV_SCALE");
  void Promise.all([
    engine.resourceManager.load<Texture2D>({ type: AssetType.Texture, url: resources.barkAlbedoUrl }),
    engine.resourceManager.load<Texture2D>({ type: AssetType.Texture, url: resources.barkNormalUrl })
  ])
    .then(([albedo, normal]) => {
      if (isDisposed()) return;
      if (albedo instanceof Texture2D) material.baseTexture = albedo;
      if (normal instanceof Texture2D) material.normalTexture = normal;
    })
    .catch(() => {});
}

const PROCEDURAL_LEAF_SLOTS: Record<Exclude<TemplateProceduralPlantKind, "dead-wood">, ReadonlySet<string>> = {
  "dry-grass": new Set(["foliage"]),
  "desert-shrub": new Set(["foliage"]),
  "pastel-flower": new Set(["petals"])
};

const PROCEDURAL_WIND_PARAMS: Record<
  Exclude<TemplateProceduralPlantKind, "dead-wood">,
  readonly [wholeLimit: number, wholeFreqHz: number, leafLimit: number, leafFreqHz: number]
> = {
  "dry-grass": [0.35, 0.65, 0.34, 1.18],
  "desert-shrub": [0.95, 0.65, 0.28, 1.65],
  "pastel-flower": [1.35, 0.78, 0.1, 1.55]
};

function createProceduralWindMaterial(
  engine: Engine,
  vegetationTemplate: Material | undefined,
  isLeaf: boolean,
  windHeight: number,
  windParams: readonly [number, number, number, number]
): Material {
  if (!vegetationTemplate || vegetationTemplate.shader.name !== "Terrain/Vegetation") {
    const fallback = createSurfaceMaterial(engine, { baseColor: new Color(1, 1, 1, 1) });
    fallback.renderFace = RenderFace.Double;
    return fallback;
  }
  const material = vegetationTemplate.clone();
  const data = material.shaderData;
  for (const macro of data.getMacros()) {
    if (
      macro.name.startsWith("MATERIAL_WIND_") ||
      macro.name.startsWith("MATERIAL_SECOND_COLOR_") ||
      [
        "MATERIAL_HAS_BASETEXTURE",
        "MATERIAL_HAS_SMOOTHNESS_TEXTURE",
        "MATERIAL_HAS_NORMALTEXTURE",
        "MATERIAL_ENABLE_SECOND_COLOR",
        "MATERIAL_PROCEDURAL_TREE_CANOPY_OCCLUSION",
        "MATERIAL_PROCEDURAL_TREE_TRUNK_VERTICAL_GRADIENT"
      ].includes(macro.name)
    ) {
      data.disableMacro(macro);
    }
  }
  data.setTexture("material_BaseTexture", null!);
  configureProceduralPlantWindMaterial(material, isLeaf);
  data.setFloat("material_ProceduralTreeHeight", windHeight);
  data.setVector4("material_ProceduralTreeWindParams", new Vector4(...windParams));
  data.setColor("material_BaseColor", new Color(1, 1, 1, 1));
  data.setColor("material_TranslucencyColor", new Color(1, 0.94, 0.88, 1));
  data.setFloat("material_TranslucencyIntensity", isLeaf ? 0.45 : 0.22);
  data.setFloat("material_LeafAlbedoBrightness", 1);
  data.setFloat("material_LeafAlbedoDesaturation", 0);
  data.setFloat("material_LeafAlbedoTextureBlend", 0);
  data.setFloat("material_LeafFlipBackfaceNormals", 0);
  data.setFloat("material_LightingFlatness", 0.15);
  data.setFloat("material_Smoothness", 0.18);
  data.setFloat("material_Tiling", 1);
  data.setFloat("material_UVBaseLock", 0);
  data.setFloat("material_AlphaCutoff", 0);
  data.setFloat("material_GrassDistanceFadeEnable", 0);
  return material;
}

/** Mounts native procedural desert trees/shrubs/grass declared on a template via GPU instancing. */
export function mountTemplateProceduralPlants(
  root: Entity,
  anchor: { x: number; y: number; z: number },
  ground: (x: number, z: number) => number | undefined,
  plants: readonly TemplateProceduralPlantInstance[],
  seed: number,
  vegetationTemplate?: Material
): () => void {
  let disposed = false;
  const disposals: Array<() => void> = [];
  const grouped = new Map<TemplateProceduralPlantKind, TemplateProceduralPlantInstance[]>();
  for (const item of plants) {
    const list = grouped.get(item.kind) ?? [];
    list.push(item);
    grouped.set(item.kind, list);
  }
  const owner = root.createChild("Template procedural plants");
  const rotQuat = new Quaternion();

  for (const [kind, entries] of grouped) {
    const positioned = entries
      .map((entry) => {
        const worldY = ground(anchor.x - entry.x, anchor.z + entry.z);
        if (worldY === undefined || !Number.isFinite(worldY)) return undefined;
        return { entry, localX: -entry.x, localY: worldY - anchor.y, localZ: entry.z };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    if (!positioned.length) continue;

    if (kind === "dead-wood") {
      const material = createSurfaceMaterial(root.engine, { baseColor: new Color(1, 1, 1, 1), normalStrength: 0.75 });
      material.renderFace = RenderFace.Double;
      disposals.push(() => material.destroy());
      bindDeadTreeBarkTextures(root.engine, material, () => disposed);

      const variants = createDeadTreeVariantMeshes(root.engine);
      for (const variant of variants) disposals.push(variant.destroy);
      const colors = PROCEDURAL_PALETTE["dead-wood"].bark;

      variants.forEach((variantMesh, variantIndex) => {
        const subset = positioned.filter(({ entry }, idx) => ((entry.variant ?? idx) & 1) === variantIndex);
        if (!subset.length) return;
        const floor = variantMesh.mesh.bounds.min.y;
        const sourceHeight = Math.max(0.01, variantMesh.mesh.bounds.max.y - floor);
        const bounds = new BoundingBox(
          new Vector3(Infinity, Infinity, Infinity),
          new Vector3(-Infinity, -Infinity, -Infinity)
        );
        const storage = createTreeAssemblyInstanceStorage(root.engine, subset.length);
        disposals.push(() => storage.instanceBuffer.destroy(true));

        subset.forEach(({ entry, localX, localY, localZ }, index) => {
          const scaleY = entry.heightM / sourceHeight;
          const scaleXZ = scaleY * 1.12;
          const base = localY - floor * scaleY - Math.min(0.08, entry.heightM * 0.02);
          const yaw = entry.yawDegrees ?? 0;
          const tiltX = (settlementRandom(seed, `dead-tilt-x:${entry.id}`) - 0.5) * 9;
          const tiltZ = (settlementRandom(seed, `dead-tilt-z:${entry.id}`) - 0.5) * 9;
          Quaternion.rotationYawPitchRoll(
            (yaw * Math.PI) / 180,
            (tiltX * Math.PI) / 180,
            (tiltZ * Math.PI) / 180,
            rotQuat
          );
          bounds.min.set(
            Math.min(bounds.min.x, localX - entry.heightM),
            Math.min(bounds.min.y, base - entry.heightM * 0.2),
            Math.min(bounds.min.z, localZ - entry.heightM)
          );
          bounds.max.set(
            Math.max(bounds.max.x, localX + entry.heightM),
            Math.max(bounds.max.y, base + entry.heightM * 1.5),
            Math.max(bounds.max.z, localZ + entry.heightM)
          );
          const offset = index * storage.recordFloats;
          storage.staging.set(
            [localX, base, localZ, 1, rotQuat.x, rotQuat.y, rotQuat.z, rotQuat.w, scaleXZ, scaleY, scaleXZ, 1],
            offset
          );
          const rawColor =
            entry.variant ?? Math.floor(settlementRandom(seed, `template-plant:${entry.id}`) * colors.length);
          const color = colors[Math.abs(Math.trunc(rawColor)) % colors.length];
          storage.staging.set([...color, 1], offset + 12);
        });

        const name = `dead-wood/variant-${variantIndex}`;
        const view = createTreeAssemblyInstancedMesh(
          root.engine,
          variantMesh.mesh,
          subset.length,
          bounds,
          name,
          storage
        );
        disposals.push(() => view.mesh.destroy());
        uploadTreeAssemblyInstances(view, subset.length);
        const renderer = owner.createChild(name).addComponent(MeshRenderer);
        renderer.mesh = view.mesh;
        renderer.setMaterial(material);
        renderer.castShadows = renderer.receiveShadows = true;
        renderer.shaderData.enableMacro("RENDERER_ASSET_ASSEMBLY_INSTANCE");
      });
      continue;
    }

    const structure = recipeFor(kind);
    const leafSlots = PROCEDURAL_LEAF_SLOTS[kind];
    const windParams = PROCEDURAL_WIND_PARAMS[kind];
    const restParts = buildProceduralPlantGeometry(structure, 0);
    const floor = Math.min(...restParts.map(({ mesh }) => mesh.bounds[0][1]));
    const maxRestY = Math.max(...restParts.map(({ mesh }) => mesh.bounds[1][1]));
    const windHeight = Math.max(0.05, maxRestY);
    const sourceHeight = Math.max(0.01, maxRestY - floor);
    const geometry = mergePlantGeometryByMaterial(buildProceduralPlantGeometry(structure, 0, leafSlots, windHeight));
    const meshes = uploadProceduralPlantGeometry(root.engine, geometry);
    disposals.push(() => meshes.destroy());
    for (const { mesh, materialId } of meshes.parts) {
      const data = geometry.find((item) => item.materialId === materialId)!.mesh;
      let radius = 0;
      if (data.leafFrames) {
        data.positions.forEach((p, idx) => {
          radius = Math.max(radius, Math.hypot(...p.map((v, axis) => v - data.leafFrames![idx][axis])));
        });
      }
      expandProceduralTreeWindBounds(mesh, radius);
    }
    const materials = Object.fromEntries(
      Object.keys(PROCEDURAL_PALETTE[kind]).map((slot) => {
        const material = createProceduralWindMaterial(
          root.engine,
          vegetationTemplate,
          leafSlots.has(slot),
          windHeight,
          windParams
        );
        disposals.push(() => material.destroy());
        return [slot, material];
      })
    );
    const bounds = new BoundingBox(
      new Vector3(Infinity, Infinity, Infinity),
      new Vector3(-Infinity, -Infinity, -Infinity)
    );
    const transforms = positioned.map(({ entry, localX, localY, localZ }) => {
      const scale = entry.heightM / sourceHeight;
      const base = localY - floor * scale - Math.min(0.03, entry.heightM * 0.06);
      const yaw = ((entry.yawDegrees ?? 0) * Math.PI) / 180;
      const reach = entry.heightM * 1.6;
      bounds.min.set(
        Math.min(bounds.min.x, localX - reach),
        Math.min(bounds.min.y, base - entry.heightM),
        Math.min(bounds.min.z, localZ - reach)
      );
      bounds.max.set(
        Math.max(bounds.max.x, localX + reach),
        Math.max(bounds.max.y, base + entry.heightM * 2.2),
        Math.max(bounds.max.z, localZ + reach)
      );
      return [localX, base, localZ, 1, 0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2), scale, scale, scale, 1];
    });
    const palette = PROCEDURAL_PALETTE[kind];
    for (const part of meshes.parts) {
      const name = `${kind}/${part.materialId}`;
      const colors = palette[part.materialId];
      const storage = createTreeAssemblyInstanceStorage(root.engine, positioned.length);
      disposals.push(() => storage.instanceBuffer.destroy(true));
      transforms.forEach((transform, index) => {
        const offset = index * storage.recordFloats;
        const rawVariant =
          positioned[index].entry.variant ??
          Math.floor(settlementRandom(seed, `template-plant:${positioned[index].entry.id}`) * colors.length);
        const colorIndex = Math.abs(Math.trunc(rawVariant)) % colors.length;
        const color = colors[colorIndex];
        storage.staging.set(transform, offset);
        storage.staging.set([...color, 1], offset + 12);
      });
      const view = createTreeAssemblyInstancedMesh(root.engine, part.mesh, positioned.length, bounds, name, storage);
      disposals.push(() => view.mesh.destroy());
      uploadTreeAssemblyInstances(view, positioned.length);
      const renderer = owner.createChild(name).addComponent(MeshRenderer);
      renderer.mesh = view.mesh;
      renderer.setMaterial(materials[part.materialId]);
      renderer.castShadows = renderer.receiveShadows = true;
      renderer.shaderData.enableMacro("RENDERER_ASSET_ASSEMBLY_INSTANCE");
    }
  }
  return () => {
    disposed = true;
    for (const destroy of disposals.reverse()) destroy();
  };
}
