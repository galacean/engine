import {
  AssetType,
  Camera,
  CompareFunction,
  Material,
  Matrix,
  MeshRenderer,
  ModelMesh,
  PBRMaterial,
  Script,
  TextureWrapMode,
  Vector3,
  type Texture2D,
  type Entity,
  type GLTFResource
} from "@galacean/engine";
import type { GUI } from "dat.gui";
import { TerrainLodGroupRendererRuntime } from "@galacean/engine-terrain/terrain/lod/TerrainLodGroupRendererRuntime";
import type {
  TerrainProjectResolvedGeometry,
  TerrainProjectResolvedRenderer
} from "@galacean/engine-terrain/terrain/project/TerrainProjectAsset";
import { createSurfaceMaterial } from "@galacean/engine-terrain/surface/SurfaceMaterial";
import type {
  IslandPlan,
  PlanLandscape,
  PlanRock
} from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import { planningRemovedObjectIds } from "@galacean/engine-world-planning/spatial/PlanningResources";
import {
  SeedWorldExactInstanceCellRuntime,
  createSeedWorldExactInstanceLodEntry
} from "@galacean/engine-world-planning/world/SeedWorldExactInstanceCellRuntime";
import { fitContainedPrefab, fitGroundedPrefabHeight } from "./MojaveGrounding";
import mojaveAssets from "./MojaveAssets.json";
const { models: catalog, geometry: geometryCatalog } = mojaveAssets;

const geometryModels = new Map(geometryCatalog.map(item => [item.id, item]));
const models = new Map(catalog.map((item) => [`mojave/${item.id}`, item]));
type LodDefinition = Extract<TerrainProjectResolvedGeometry, { kind: "lod-group" }>["lodGroup"];
interface RockInstance {
  entity: Entity;
  definition: LodDefinition;
  runtime: TerrainLodGroupRendererRuntime;
  family: "groups" | "stones" | "plants";
}
/** Scene-owned three-level controls; metre distances refer to an unscaled reference asset at the current FOV. */
export const mojaveLodTuning = {
  enabled: true,
  fadeSeconds: 0.45,
  groups: { near: 95.7, far: 382.8, cull: 1196 },
  stones: { near: 29, far: 116, cull: 363 },
  plants: { near: 20, far: 60, cull: 150 }
};

/** Drives canonical terrain LOD groups, including terminal fade and delayed first admission. */
export class MojaveRockLodRuntime extends Script {
  camera!: Camera;
  readonly instances: RockInstance[] = [];
  readonly materials: Material[] = [];
  readonly rockMaterials: PBRMaterial[] = [];
  private elapsed = 0;
  private scheduler?: SeedWorldExactInstanceCellRuntime;
  private lodEnabled = mojaveLodTuning.enabled;
  /** Rebuilds only transition policy when artist-authored distances change. */
  rebuild(): void {
    for (const item of this.instances) {
      const distances = mojaveLodTuning[item.family];
      const projection = item.definition.size / (2 * Math.tan((this.camera.fieldOfView * Math.PI) / 360));
      const thresholds = [
        distances.near,
        Math.max(distances.near + 1, distances.far),
        Math.max(distances.far + 1, distances.cull)
      ];
      const definition = {
        ...item.definition,
        lods: item.definition.lods.map((lod, i) => ({
          ...lod,
          screenRelativeTransitionHeight: projection / thresholds[i]
        }))
      };
      for (const renderer of item.entity.getComponentsIncludeChildren(MeshRenderer, [])) renderer.castShadows = true;
      item.runtime = new TerrainLodGroupRendererRuntime(
        item.entity,
        this.camera,
        definition,
        mojaveLodTuning.fadeSeconds
      );
      // Start outside the terminal threshold, then use the canonical terminal-to-visible transition.
      item.runtime.updateRenderersWithScreenRelativeHeight(this.elapsed, 0);
    }
    this.lodEnabled = mojaveLodTuning.enabled;
    const tuning = { enabled: this.lodEnabled, distanceScale: 1 };
    for (const item of this.instances) item.runtime.setTuning(tuning);
    this.scheduler = new SeedWorldExactInstanceCellRuntime(
      this.camera,
      this.instances.map((item) =>
        createSeedWorldExactInstanceLodEntry(item.entity.name, item.family, item.entity, item.runtime)
      )
    );
    // Use the shared Cell scheduler for both moving-camera queries and static reuse.
    this.scheduler.setMode("cell");
  }
  override onUpdate(seconds: number): void {
    this.elapsed += seconds;
    if (this.lodEnabled !== mojaveLodTuning.enabled) {
      this.lodEnabled = mojaveLodTuning.enabled;
      const tuning = { enabled: this.lodEnabled, distanceScale: 1 };
      for (const item of this.instances) item.runtime.setTuning(tuning);
      this.scheduler?.invalidate();
    }
    this.scheduler?.update(this.elapsed);
  }
  override onDestroy(): void {
    for (const material of this.materials) material.destroy();
  }
}

/** Mounts the same live instance policy in the existing right-hand inspector. */
export function mountMojaveLodControls(gui: GUI, read: () => Entity | undefined): void {
  const surface = gui.addFolder("Surface / 岩石表面");
  const tuning = { textureSize: 1 / 0.3, topSlope: 0.45, topSoftness: 0.4 };
  const update = () => {
    for (const material of read()?.getComponent(MojaveRockLodRuntime)?.rockMaterials ?? []) {
      material.shaderData.setFloat("material_WorldTextureSize", tuning.textureSize);
      material.shaderData.getVector2("material_TerrainCoverageSlope").set(tuning.topSlope, tuning.topSoftness);
    }
  };
  surface.add(tuning, "textureSize", 0.5, 20, 0.1).name("岩壁纹理尺寸 / 米").onChange(update);
  surface.add(tuning, "topSlope", 0, 0.95, 0.01).name("顶部色块起点").onChange(update);
  surface.add(tuning, "topSoftness", 0.01, 0.5, 0.01).name("顶部过渡宽度").onChange(update);
  const folder = gui.addFolder("Mojave LOD / 岩石层级");
  const rebuild = () => read()?.getComponent(MojaveRockLodRuntime)?.rebuild();
  folder.add(mojaveLodTuning, "enabled").name("LOD / 开启");
  folder.add(mojaveLodTuning, "fadeSeconds", 0.1, 2, 0.05).name("Fade seconds / 渐变秒").onFinishChange(rebuild);
  for (const family of ["groups", "stones", "plants"] as const) {
    const child = folder.addFolder(
      { groups: "岩石组距离 / 米", stones: "单石距离 / 米", plants: "植被距离 / 米" }[family]
    );
    for (const key of ["near", "far", "cull"] as const)
      child
        .add(mojaveLodTuning[family], key, 1, 1500, 1)
        .name({ near: "近→中", far: "中→远", cull: "远→退场" }[key])
        .onFinishChange(rebuild);
  }
}

/** Materializes only assets selected by the published plan; terrain retains shared texture ownership. */
export async function createSeedWorldMojavePreview(
  parent: Entity,
  plan: IslandPlan,
  isCurrent: () => boolean,
  camera: Camera,
  terrain: Material
): Promise<Entity | undefined> {
  const removed = planningRemovedObjectIds(plan.authoredResources ?? []);
  const placements = [...plan.rocks, ...(plan.landscapes ?? [])].filter(
    (item): item is (PlanRock | PlanLandscape) & { assetId: string } =>
      !!item.assetId && models.has(item.assetId) && !removed.has(item.id)
  );
  if (!placements.length) return undefined;
  const resources = new Map(
    await Promise.all(
      [...new Set(placements.map((p) => p.assetId))].map(
        async (id) =>
          [
            id,
            await parent.engine.resourceManager.load<GLTFResource>({
              type: AssetType.GLTF,
              url: models.get(id)!.url
            })
          ] as const
      )
    )
  );
  if (!isCurrent()) return undefined;
  const group = parent.createChild("Mojave desert layout");
  const driver = group.addComponent(MojaveRockLodRuntime);
  driver.camera = camera;
  const vegetationTemplate = await parent.engine.resourceManager.load<Material>({
    type: AssetType.Material,
    url: new URL("../../../../packages/terrain/src/data/seed-world/public/materials/stylized-mushroom-1.mat", import.meta.url).href
  });
  if (!isCurrent()) {
    group.destroy();
    return undefined;
  }
  const base = await parent.engine.resourceManager.load<Texture2D>({
    type: AssetType.KTX2,
    url: mojaveAssets.surface.base
  });
  if (!isCurrent()) {
    group.destroy();
    return undefined;
  }
  base.wrapModeU = base.wrapModeV = TextureWrapMode.Repeat;
  const sharedRockMaterial = createSurfaceMaterial(parent.engine, {
    baseTexture: base,
    worldBase: true,
    textureSizeMetres: 1 / 0.3,
    terrainColorRegion: "top",
    terrainCoverageSlope: [0.45, 0.4],
    terrain
  });
  sharedRockMaterial.shaderData.setTexture("material_LodDitherTexture", vegetationTemplate.shaderData.getTexture("material_LodDitherTexture"));
  sharedRockMaterial.shaderData.setFloat("material_LodDitherTextureInvSize", vegetationTemplate.shaderData.getFloat("material_LodDitherTextureInvSize"));
  sharedRockMaterial.name = "Mojave shared world sand + terrain top";
  driver.materials.push(sharedRockMaterial);
  driver.rockMaterials.push(sharedRockMaterial);
  const materialCache = new Map<Material, Material>();
  try {
    for (const item of placements) {
      const source = models.get(item.assetId)!;
      const plant = source.id.startsWith("J");
      const model = resources.get(item.assetId)!.instantiateSceneRoot();
      group.addChild(model);
      model.name = item.id;
      const embedding = "groundEmbeddingFraction" in source ? (source.groundEmbeddingFraction ?? 0) : 0;
      const geometry = geometryModels.get(source.id);
      const sourceSize = (geometry?.size ?? source.size) as [number, number, number];
      const fit = plant
        ? (() => {
            const heightFit = fitGroundedPrefabHeight(item.baseHeight ?? 0, item.height, sourceSize[1], embedding);
            return { bottom: heightFit.bottom, scale: heightFit.scaleY };
          })()
        : fitContainedPrefab(item.baseHeight ?? 0, [item.width, item.height, item.depth], sourceSize, embedding);
      // Centre the union of ALL LOD bounds inside the authored OBB. Its buried
      // section may extend below the ground; its exposed part stays contained.
      const centerX = geometry ? (geometry.min[0] + geometry.max[0]) * 0.5 : 0;
      const centerZ = geometry ? (geometry.min[2] + geometry.max[2]) * 0.5 : 0;
      const yaw = -item.yaw;
      model.transform.setPosition(
        item.center.x - fit.scale * (Math.cos(yaw) * centerX + Math.sin(yaw) * centerZ),
        fit.bottom - fit.scale * (geometry?.min[1] ?? 0),
        item.center.z - fit.scale * (-Math.sin(yaw) * centerX + Math.cos(yaw) * centerZ)
      );
      model.transform.setRotation(0, (yaw * 180) / Math.PI, 0);
      model.transform.setScale(fit.scale, fit.scale, fit.scale);
      const bindings: TerrainProjectResolvedRenderer[][] = [[], [], []];
      const visit = (entity: Entity, path: number[]) => {
        for (const [componentIndex, renderer] of entity.getComponents(MeshRenderer, []).entries()) {
          const lodIndex = Number(entity.name.replace("LOD", ""));
          if (!Number.isInteger(lodIndex) || lodIndex < 0 || lodIndex > 2)
            throw new Error(`Missing LOD identity: ${entity.name}`);
          const materials = renderer.getMaterials().map((original) => {
            if (!original) throw new Error(`Missing material: ${source.id}`);
            if (!plant) return sharedRockMaterial;
            let material = materialCache.get(original);
            if (!material) {
              // Imported plants use the existing generic wind receiver. They do not carry
              // the generated tree's hierarchy payload; keep all parts on the same branch
              // response so the crown remains attached to its trunk across every LOD.
              material = vegetationTemplate.clone();
              material.name = `${original.name} · native vegetation wind`;
              const data = material.shaderData;
              data.disableMacro("MATERIAL_HAS_NORMALTEXTURE");
              data.disableMacro("MATERIAL_ENABLE_TRANSLUCENCY");
              data.setTexture("material_BaseTexture", (original as PBRMaterial).baseTexture);
              data.setColor("material_BaseColor", (original as PBRMaterial).baseColor);
              data.setFloat("material_WorldPickDepthCompare", CompareFunction.LessEqual);
              data.setFloat("material_AlphaCutoff", original.name.includes("Leaves") ? 0.5 : 0);
              data.setFloat("material_Smoothness", 0);
              data.setFloat("material_GrassDistanceFadeEnable", 0);
              data.setFloat("material_UVBaseLock", 0);
              data.setFloat("material_WindForce", 1);
              data.setFloat("material_WindWavesScale", 0.75);
              data.setFloat("material_WindFlowDensity", 1);
              data.enableMacro("MATERIAL_WIND_ROOT_LOAD");
              if (original.name.includes("Leaves")) {
                data.enableMacro("MATERIAL_WIND_VERTEX_PIVOT");
                data.setVector3("material_WindPivotFlutter", new Vector3(0.3, 1.2, 6));
              }
              data.enableMacro("MATERIAL_ENABLE_WIND");
              data.enableMacro("MATERIAL_VEGETATION_CLIMATE_BRANCH");
              materialCache.set(original, material);
              driver.materials.push(material);
            }
            return material;
          });
          renderer.setMaterials(materials);
          renderer.castShadows = true;
          renderer.receiveShadows = true;
          bindings[lodIndex].push({
            entityPath: path,
            componentIndex,
            mesh: renderer.mesh as ModelMesh,
            material: materials[0],
            localMatrix: new Matrix(),
            localNormalMatrix: new Matrix(),
            castShadows: true,
            receiveShadows: true,
            enableVertexColor: false,
            detailInstancing: false,
            billboardInstancing: false
          });
        }
        entity.children.forEach((child, index) => visit(child, [...path, index]));
      };
      visit(model, []);
      if (bindings.some((b) => !b.length)) throw new Error(`Incomplete three-level asset: ${source.id}`);
      const definition: LodDefinition = {
        fadeMode: "CrossFade",
        animateCrossFading: true,
        localReferencePoint: [0, source.size[1] / 2, 0],
        size: Math.max(...sourceSize),
        lods: bindings.map((renderers, i) => ({
          renderers,
          fadeTransitionWidth: 0,
          screenRelativeTransitionHeight: [0.125, 0.03125, 0.01][i]
        }))
      };
      driver.instances.push({
        entity: model,
        definition,
        runtime: undefined!,
        family: plant ? "plants" : source.id.startsWith("A") ? "groups" : "stones"
      });
    }
    driver.rebuild();
    const rocks = driver.instances.filter((item) => item.family !== "plants");
    const renderers = rocks.flatMap((item) => item.entity.getComponentsIncludeChildren(MeshRenderer, []));
    const uniqueMaterials = new Set(renderers.flatMap((renderer) => renderer.getMaterials()));
    const rockMaterial = driver.rockMaterials[0];
    const macros = rockMaterial.shaderData
      .getMacros()
      .map((m) => m.name)
      .sort();
    document.body.dataset.mojaveSurface = JSON.stringify({
      shader: rockMaterial.shader.name,
      rocks: rocks.length,
      assets: Object.fromEntries([...models.keys()].map(id => [id, placements.filter(item => item.assetId === id).length]).filter(([, count]) => count)),
      renderers: renderers.length,
      materials: uniqueMaterials.size,
      materialVariants: new Set(
        [...uniqueMaterials].map((m) =>
          m!.shaderData
            .getMacros()
            .map((x) => x.name)
            .sort()
            .join(";")
        )
      ).size,
      macros,
      textures: driver.rockMaterials.map((material) => ({
        name: material.name,
        base: material.baseTexture ? [material.baseTexture.width, material.baseTexture.height] : null,
        normal: material.normalTexture ? [material.normalTexture.width, material.normalTexture.height] : null
      }))
    });
  } catch (error) {
    group.destroy();
    throw error;
  }
  return group;
}
