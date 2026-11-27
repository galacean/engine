import { loadPlantParameters } from "./ProceduralPlantResources";
import { AssetType, type Engine, Material, Matrix } from "@galacean/engine";
import type {
  ProductionRenderAtom,
  ShrubAssemblySource,
  ProductionLodGroupProfile
} from "./AssetAssemblySourceLibrary";
import { freezeImmutableData } from "@galacean/engine-terrain/terrain/ImmutableData";
import { PopulationLodMetric } from "@galacean/engine-terrain/terrain/seed/PopulationTokenCodec";
import {
  buildProceduralPlantGeometry,
  mergePlantGeometryByMaterial,
  validateProceduralPlantStructure,
  type ProceduralPlantStructure
} from "./ProceduralPlantGeometry";
import { uploadProceduralPlantGeometry, type ProceduralPlantMeshes } from "./ProceduralPlantMeshes";
import { configureProceduralPlantWindMaterial, expandProceduralTreeWindBounds } from "./TreeAssemblyRuntime";

export interface ProceduralPlantSourceDescriptor {
  readonly id: string;
  readonly label: string;
  readonly structureUrl: string;
  readonly materialUrls: Readonly<Record<string, string>>;
  readonly defaultColorRgb: readonly [number, number, number];
  readonly lodGroup: ProductionLodGroupProfile;
}

/** Compiles final plant parameters once, then exposes ordinary shared renderer bindings to Population. */
export async function loadProceduralPlantSource(
  engine: Engine,
  descriptor: ProceduralPlantSourceDescriptor
): Promise<ShrubAssemblySource> {
  const structure = freezeImmutableData(
    await loadPlantParameters<ProceduralPlantStructure>(
      engine,
      descriptor.structureUrl,
      validateProceduralPlantStructure
    )
  );
  if (descriptor.lodGroup.screenRelativeTransitionHeights.length !== structure.lods.length)
    throw new Error("Plant LOD thresholds must match the compiled geometry levels");
  const materials = new Map(
    await Promise.all(
      Object.entries(descriptor.materialUrls).map(
        async ([id, url]) =>
          [id, await engine.resourceManager.load<Material>({ type: AssetType.Material, url })] as const
      )
    )
  );
  for (const part of structure.parts)
    if (!materials.has(part.materialId)) throw new Error(`Plant material is missing: ${part.materialId}`);
  const leaves = new Set<string>();
  for (const [id, material] of materials) {
    const leaf = material.shaderData.getMacros().some((macro) => macro.name === "MATERIAL_VEGETATION_CLIMATE_LEAF");
    if (leaf) leaves.add(id);
    configureProceduralPlantWindMaterial(material, leaf);
  }
  const restGeometry = buildProceduralPlantGeometry(structure, 0);
  const geometryBounds = {
    min: [0, 1, 2].map((axis) => Math.min(...restGeometry.map(({ mesh }) => mesh.bounds[0][axis]))) as [
      number,
      number,
      number
    ],
    max: [0, 1, 2].map((axis) => Math.max(...restGeometry.map(({ mesh }) => mesh.bounds[1][axis]))) as [
      number,
      number,
      number
    ]
  };
  const windHeight = geometryBounds.max[1];
  const resources: ProceduralPlantMeshes[] = [];
  try {
    const lods: ProductionRenderAtom[] = structure.lods.map((_, lod) => {
      const geometry = mergePlantGeometryByMaterial(buildProceduralPlantGeometry(structure, lod, leaves, windHeight));
      const compiled = uploadProceduralPlantGeometry(engine, geometry);
      resources.push(compiled);
      for (const { mesh, materialId } of compiled.parts) {
        const data = geometry.find((part) => part.materialId === materialId)!.mesh;
        let radius = 0;
        if (data.leafFrames)
          data.positions.forEach((p, i) => {
            radius = Math.max(radius, Math.hypot(...p.map((v, axis) => v - data.leafFrames![i][axis])));
          });
        expandProceduralTreeWindBounds(mesh, radius);
      }
      const renderers = compiled.parts.map(({ mesh, materialId }) => ({
        entityPath: [],
        componentIndex: 0,
        mesh,
        material: materials.get(materialId)!,
        localMatrix: new Matrix(),
        localNormalMatrix: new Matrix(),
        castShadows: true,
        receiveShadows: true,
        enableVertexColor: false,
        detailInstancing: false,
        billboardInstancing: false
      }));
      // The existing shrub batch owns one primitive per level. Never silently drop a material.
      if (renderers.length !== 1) throw new Error("Shrub batching requires one material per LOD");
      return Object.freeze({
        id: descriptor.id,
        label: `${descriptor.label} LOD${lod}`,
        renderer: renderers[0],
        renderers
      });
    });
    return Object.freeze({
      id: descriptor.id,
      label: descriptor.label,
      defaultColorRgb: descriptor.defaultColorRgb,
      geometryBounds,
      lods,
      authoredLeafCounts: structure.lods.map((lod) => lod.partIds.length),
      lodGroup: descriptor.lodGroup,
      defaultLodProfile: { metric: PopulationLodMetric.InstanceCount, values: lods.map(() => 1) }
    });
  } catch (error) {
    resources.forEach((resource) => resource.destroy());
    throw error;
  }
}
