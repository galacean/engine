import { RuntimeProjectInputs } from "@galacean/engine-project/runtime-editor/project/runtime-project-inputs";
import { RuntimeProjectEdit } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
import type { RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { nativeAssetFormats } from "@galacean/engine-runtime-editor/project/runtime-native-formats";
import { RuntimeSceneEdit } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-scene-edit";
import {
  exportPlanningScene,
  importPlanningScene,
  PLANNING_ENTITY_COMPONENT,
  PLANNING_PROJECT_COMPONENT,
  type PlanningSceneAsset
} from "../PlanningSceneAsset.ts";
import {
  exportPlanningAuthoring,
  exportPlanningRecipe,
  upgradePlanningDocument,
  type PlanningDocument
} from "@galacean/engine-world-planning/spatial/PlanningDocument";
import {
  applySpatialCommands,
  resolveComponent,
  type SpatialDocument
} from "@galacean/engine-world-planning/spatial/SpatialDocument";
import { planningRegistry } from "@galacean/engine-world-planning/spatial/PlanningComponents";
import type { RuntimeEditPreparation } from "@galacean/engine-runtime-editor/runtime-editor/runtime-editor";
import {
  DEFAULT_PLANT_PROJECT_RESOURCES,
  type PlantProjectResources
} from "@galacean/engine-vegetation/asset-assembly/PlantSpeciesResources";
import defaultPlantSpeciesCatalog from "@galacean/engine-vegetation/asset-assembly/generated/procedural-trees/plant-project-plant-species.json";
import {
  SEED_WORLD_DEFAULT_GROUND_WIND_TUNING,
  validateGroundWindTuning
} from "@galacean/engine-vegetation/world/SeedWorldGroundWindTuningModel";
import { PLANNING_VISUAL_AUTHORING, visualAuthoringProperties } from "../PlanningVisualAuthoring.ts";
import {
  WATER_COMPONENT,
  activePlanningWaterBodies,
  planningWaterFrame,
  transformPlanningWater,
  planningWaterSourceId
} from "../PlanningWaterSource.ts";
import type { WaterSourceAuthoring } from "@galacean/engine-world-planning/spatial/runtime/NativeWaterEditor";
import { initializePlanningWater, retainRemovedWater } from "./PlanningWaterInitialization.ts";
import { planningSeed } from "@galacean/engine-world-planning/spatial/PlanningLayoutScope";
import { createSpatialTerrainPlan } from "@galacean/engine-world-planning/spatial/layout/SpatialTerrain";
import { createPlanningGroundSampler } from "@galacean/engine-world-planning/semantic-study/WorldPlanningTerrain";
import {
  planningLakeCollarMinHeight,
  type LakeParameters
} from "@galacean/engine-world-planning/spatial/hydrology/LakeRegions";
import { generatePlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningRuntime";
import { compositionReliefGround } from "@galacean/engine-world-planning/spatial/SpatialCompositionGeometry";
import type { RiverParameters } from "@galacean/engine-world-planning/spatial/hydrology/RiverRegions";
import { COMPOSITION_OWNER } from "@galacean/engine-world-planning/spatial/SpatialComposition";
import {
  spatialCompositionParameters,
  type SpatialCompositionParameters
} from "@galacean/engine-world-planning/spatial/SpatialCompositionParameters";
import {
  resolveWaterMaterialFileLook,
  updateWaterMaterialParameters,
  type WaterMaterialFile
} from "@galacean/engine-water/water/native/WaterMaterial";
import { withSeedWorldWaterColor } from "@galacean/engine-water/world/SeedWorldWaterColor";
import { WORLD_TEMPLATE_ART } from "@galacean/engine-world-planning/spatial/WorldTemplateArtDirection";

const ownedProperties = new Map<string, readonly string[]>([
  [WATER_COMPONENT, ["authoring", "enabled"]],
  ...PLANNING_VISUAL_AUTHORING.map(
    (descriptor) =>
      [
        descriptor.type,
        [
          ...visualAuthoringProperties(descriptor),
          ...(descriptor.type === "PlanningLighting" ? ["profileReference", "profile"] : [])
        ]
      ] as const
  ),
  ["PlanningProjectAuthoring", ["metadata", "hasSeedArchives"]],
  ["PlanningEntityAuthoring", ["planningId", "origin", "parentId", "spatialComponents", "authoring"]],
  ["PlanningSeedArchiveAuthoring", ["metadata"]],
  ["PlanningVegetationResources", ["catalog", "appearance", "production"]],
  [
    "PlanningGroundWind",
    ["windEnabled", ...Object.keys(SEED_WORLD_DEFAULT_GROUND_WIND_TUNING).filter((key) => key !== "enabled")]
  ]
]);

// Cache parsed inputs, never validation success. All consumers still execute their
// rules; public documents remain detached. Keep only the latest project view.
let parsed:
  | {
      inputs: RuntimeProjectInputs;
      document?: { value: PlanningDocument | undefined };
      vegetation?: { value: PlantProjectResources | undefined };
      winds?: Record<string, unknown>[];
    }
  | undefined;
function planningInputs(pack: RuntimeProjectPackage): NonNullable<typeof parsed> {
  // Readers resolve only hierarchy types/text and domain sidecars. Resource
  // existence/types (including vegetation) are checked against the live pack below.
  // A new host-state file must not invalidate an unchanged hierarchy parse.
  const inputs = {
    ...pack,
    project: { ...pack.project, files: pack.project.files.filter((file) => /^(Scene|Prefab|glTF)$/i.test(file.type)) },
    documents:
      pack.documents && Object.fromEntries(Object.entries(pack.documents).filter(([path]) => !path.endsWith(".meta")))
  };
  if (!parsed?.inputs.matches(inputs))
    parsed = { inputs: new RuntimeProjectInputs(inputs, { contentTypes: ["Scene", "Prefab"] }) };
  return parsed;
}

export function planningVegetationReferences(pack: RuntimeProjectPackage): PlantProjectResources | undefined {
  const input = planningInputs(pack);
  input.vegetation ??= { value: readPlanningVegetationReferences(pack) };
  return input.vegetation.value && { ...input.vegetation.value };
}

function readPlanningVegetationReferences(pack: RuntimeProjectPackage): PlantProjectResources | undefined {
  const content = pack.contents[pack.project.scene];
  if (typeof content !== "string") return undefined;
  const source = JSON.parse(content);
  if (
    !source.components?.some((component: { type: string }) => component.type === "PlanningVegetationResources") &&
    !source.entities?.some((entity: { instance?: unknown }) => entity.instance)
  )
    return undefined;
  const scene = new RuntimeSceneEdit(
    new RuntimeProjectEdit(
      pack,
      nativeAssetFormats(() => ({}))
    ),
    pack.project.scene
  );
  const owners = scene.queryComponents({ type: "PlanningVegetationResources" });
  if (!owners.length) return undefined;
  if (owners.length !== 1) throw new Error("Scene requires one vegetation resource owner");
  const props = scene.readComponent(owners[0].id).props ?? {};
  return Object.fromEntries(
    Object.keys(DEFAULT_PLANT_PROJECT_RESOURCES).map((key) => {
      const reference = props[key];
      if (!reference || typeof reference !== "object" || !("$ref" in reference) || typeof reference.$ref !== "string")
        throw new Error(`Vegetation ${key} requires a project asset reference`);
      return [key, reference.$ref];
    })
  ) as unknown as PlantProjectResources;
}

export const validatePlanningSource: RuntimeEditPreparation = async (edit) => {
  await edit.run(({ draft }) => {
    validatePlanningProject(draft.preview());
  }, true);
};

/** Seed World's authored owner is mandatory after import; deleting it cannot silently start a new world. */
export function validatePlanningProject(pack: RuntimeProjectPackage): void {
  const document = planningSourceDocument(pack);
  if (!document) {
    if (pack.documents?.[`${pack.project.scene}.planning-source.json`])
      throw new Error("Imported project requires a PlanningProjectAuthoring owner");
    return;
  }
  applySpatialCommands(document, [], planningRegistry);
  if (pack.project.files.some((file) => file.virtualPath === DEFAULT_PLANT_PROJECT_RESOURCES.catalog)) {
    const refs = planningVegetationReferences(pack);
    if (!refs) throw new Error("Planning Scene requires a vegetation resource owner");
    for (const [key, type] of [
      ["catalog", "PlantSpecies"],
      ["appearance", "PlantAppearance"],
      ["production", "PlantProduction"]
    ] as const)
      if (pack.project.files.find((file) => file.virtualPath === refs[key])?.type !== type)
        throw new Error(`Vegetation ${key} requires a ${type} asset`);
  }
  const input = planningInputs(pack);
  if (!input.winds) {
    const draft = new RuntimeProjectEdit(
        pack,
        nativeAssetFormats(() => ({}))
      ),
      scene = new RuntimeSceneEdit(draft, pack.project.scene);
    const winds = scene.queryComponents({ type: "PlanningGroundWind" });
    if (winds.length > 1) throw new Error("Scene requires one ground wind owner");
    input.winds = winds.map((record) => scene.readComponent(record.id).props ?? {});
  }
  for (const wind of input.winds) {
    const { windEnabled, ...props } = wind;
    validateGroundWindTuning({
      ...SEED_WORLD_DEFAULT_GROUND_WIND_TUNING,
      ...props,
      ...(windEnabled === undefined ? {} : { enabled: windEnabled as boolean })
    });
  }
}

export function planningSourceDocument(pack: RuntimeProjectPackage): PlanningDocument | undefined {
  const input = planningInputs(pack);
  input.document ??= { value: readPlanningSourceDocument(pack) };
  return input.document.value && structuredClone(input.document.value);
}

function readPlanningSourceDocument(pack: RuntimeProjectPackage): PlanningDocument | undefined {
  const content = pack.contents[pack.project.scene];
  if (typeof content !== "string") return undefined;
  const source = JSON.parse(content);
  if (
    !source.components?.some((component: { type: string }) => component.type === PLANNING_PROJECT_COMPONENT) &&
    !source.entities?.some((entity: { instance?: unknown }) => entity.instance)
  )
    return undefined;
  return readPlanningProjectSource(
    new RuntimeProjectEdit(
      pack,
      nativeAssetFormats(() => ({}))
    ),
    pack.project.scene
  );
}

function compositionWaterKind(id: string | undefined, origin?: unknown): "lake" | "river" | "waterfall" | undefined {
  if (origin === "authored") return;
  if (id === `lake:authored:${COMPOSITION_OWNER}`) return "lake";
  const rivers = `river:authored:${COMPOSITION_OWNER}:`;
  if (id === `${rivers}drop`) return "waterfall";
  if (id?.startsWith(rivers)) return "river";
}

function compositionWaterSlots(document: SpatialDocument) {
  const values = document.entities.world?.components.landscapeComposition
    ? resolveComponent(document, "world", "landscapeComposition", planningRegistry).values
    : undefined;
  const layout = spatialCompositionParameters(values as Partial<SpatialCompositionParameters> | undefined);
  const river = layout.enabled && layout.streamWidthM > 0;
  return {
    river,
    lake: layout.enabled && layout.basinRadiusM > 0,
    waterfall: river && layout.waterfallWidthM > 0 && Math.max(layout.leftReliefM, layout.rightReliefM) > 0
  };
}

function templateId(document: PlanningDocument): string {
  return document.entities.world.components.worldTemplate
    ? String(resolveComponent(document, "world", "worldTemplate", planningRegistry).values.id ?? "")
    : "";
}

/** Composition water overrides belong to their layout. Independent native Water survives layout replacement. */
export function retainPlanningWaterSource(document: PlanningDocument, pack: RuntimeProjectPackage): PlanningDocument {
  const source = planningSourceDocument(pack);
  if (!source || planningSeed(source) !== planningSeed(document)) return document;
  const next = structuredClone(document);
  const template = templateId(next);
  const templateChanged = template !== templateId(source);
  const slots = templateChanged ? undefined : compositionWaterSlots(next);
  let replan = templateChanged;
  // A saved template ID does not prove that its old river elevations still fit the terrain.
  if (!replan && template) {
    const terrain = createSpatialTerrainPlan(exportPlanningRecipe(next));
    const ground = compositionReliefGround(
      terrain.parameters.spatialComposition,
      createPlanningGroundSampler(terrain, { natural: true })
    );
    replan = Object.values(source.entities).some((entity) => {
      if (compositionWaterKind(entity.id, entity.origin)) return false;
      const river = entity.components.rivers?.values as Partial<RiverParameters> | undefined;
      return (
        river?.enabled !== false &&
        river?.points?.some((point) => point.elevation !== undefined && point.elevation > ground(point) + 1e-6)
      );
    });
  }
  const waterIds = { lake: [] as string[], river: [] as string[] };
  for (const entity of Object.values(source.entities)) {
    const compositionKind = compositionWaterKind(entity.id, entity.origin);
    if (compositionKind && !slots?.[compositionKind]) continue;
    if (entity.id === "planning-ocean" || entity.id.startsWith("river:") || entity.id.startsWith("lake:")) {
      next.entities[entity.id] = structuredClone(entity);
      // The composition generates its own water. Replan independent water using its native IDs.
      if (compositionKind) continue;
      for (const kind of ["lake", "river"] as const) {
        const component = kind === "lake" ? "lakes" : "rivers";
        if (!replan || !entity.components[component] || entity.components[component].values.enabled === false) continue;
        waterIds[kind].push(entity.id);
        delete next.entities[entity.id].components[component];
      }
    }
  }
  if (replan && (waterIds.lake.length || waterIds.river.length)) {
    for (const kind of ["lake", "river"] as const) {
      const component = kind === "lake" ? "lakes" : "rivers";
      next.entities.world.components[component] = {
        values: {
          ...next.entities.world.components[component]?.values,
          countMin: waterIds[kind].length,
          countMax: waterIds[kind].length
        }
      };
    }
    const result = generatePlanningDocument(next, undefined, [], undefined, { environment: false });
    if (!result.accepted) throw new Error("新模板河湖规划未通过校验");
    const plan = { ...result.plan, waters: result.plan.waters.map((water) => ({ ...water })) };
    for (const kind of ["lake", "river"] as const) {
      const waters = plan.waters.filter((water) => water.kind === kind && new RegExp(`^${kind}:\\d+$`).test(water.id));
      const component = kind === "lake" ? "lakes" : "rivers";
      Object.assign(next.entities.world.components[component].values, {
        countMin: waters.length,
        countMax: waters.length
      });
      waters.forEach((water, index) => {
        water.id = waterIds[kind][index];
      });
      // A missing placement is a disabled source, not a failed world or an explicit deletion.
      for (const id of waterIds[kind].slice(waters.length)) {
        const retained = structuredClone(source.entities[id].components[component]);
        retained.values.enabled = false;
        next.entities[id].components[component] = retained;
      }
    }
    const draft = new RuntimeProjectEdit(
      pack,
      nativeAssetFormats(() => ({}))
    );
    const initialized = initializePlanningWater(draft, next, plan);
    draft.finish();
    return initialized;
  }
  // A template replaces the terrain, so retained absolute lake levels need a new datum.
  if (template || templateChanged) {
    const terrainPlan = createSpatialTerrainPlan(exportPlanningRecipe(next));
    const ground = createPlanningGroundSampler(terrainPlan, { natural: true });
    for (const entity of Object.values(next.entities)) {
      const lake = entity.components.lakes?.values as Partial<LakeParameters> | undefined;
      if (!lake || lake.enabled === false || !lake.shoreline || lake.referenceLevel === undefined) continue;
      const outer = lake.shoreline
        .filter((point) => point.ring === "shore")
        .map((point) => ({ x: point.x + (lake.offsetX ?? 0), z: point.z + (lake.offsetZ ?? 0) }));
      if (outer.length < 3) continue;
      const rim = Math.fround(planningLakeCollarMinHeight(terrainPlan, outer, ground) - 0.1);
      if (lake.referenceLevel + (lake.levelOffsetM ?? 0) <= rim) continue;
      lake.referenceLevel = rim;
      lake.levelOffsetM = 0;
      lake.allowCarving = true;
    }
  }
  return next;
}

/** Read the planning subtree through the same Source/Prefab identities as the editor. */
export function readPlanningProjectSource(draft: RuntimeProjectEdit, path: string): PlanningDocument | undefined {
  const scene = new RuntimeSceneEdit(draft, path);
  const projects = scene.queryComponents({ type: PLANNING_PROJECT_COMPONENT });
  if (!projects.length) return undefined;
  if (projects.length !== 1) throw new Error("Scene requires one planning authoring owner");
  const file: PlanningSceneAsset = {
    version: "2.0",
    refs: [],
    entities: [],
    components: [],
    scene: { name: "Planning authoring", rootEntities: [0], background: { mode: 0, color: [0, 0, 0, 1] } }
  };
  const references = (value: unknown): unknown => {
    if (!value || typeof value !== "object") return value;
    if ("$ref" in value && typeof value.$ref === "string") {
      let index = file.refs.findIndex((ref) => ref.url === value.$ref);
      if (index < 0) index = file.refs.push({ url: value.$ref }) - 1;
      return { $ref: index };
    }
    if (Array.isArray(value)) return value.map(references);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, references(item)]));
  };
  const append = (id: string): number => {
    const entity = scene.readEntity(id),
      index = file.entities.length;
    const node: PlanningSceneAsset["entities"][number] = { name: entity.name ?? "", components: [], children: [] };
    file.entities.push(node);
    for (const identity of scene.queryComponents({ entityId: id })) {
      if (!identity.type.startsWith("Planning") && identity.type !== WATER_COMPONENT) continue;
      const component = scene.readComponent(identity.id);
      if (component.type === "PlanningEntityAuthoring")
        component.props = { ...component.props, planningId: planningWaterSourceId(scene, id)! };
      if (component.type === WATER_COMPONENT && component.props?.authoring) {
        const input = component.props.authoring as unknown as WaterSourceAuthoring,
          frame = planningWaterFrame(scene, id);
        component.props = {
          ...component.props,
          enabled: component.props.enabled !== false && frame.active,
          authoring: {
            ...input,
            shape: transformPlanningWater(input.shape, frame)
          } as unknown as GalaceanSourceValueRecord
        };
      }
      node.components.push(file.components.length);
      file.components.push({
        type: component.type,
        props: references(component.props ?? {}) as Record<string, unknown>
      });
    }
    for (const child of entity.children ?? []) node.children!.push(append(child));
    return index;
  };
  append(projects[0].entityId);
  const document = retainRemovedWater(upgradePlanningDocument(importPlanningScene(file)), draft.preview());
  // Older saves could attach a composition's native water to a layout without the corresponding water feature.
  for (const { entities, edits } of [
    { entities: document.entities, edits: document.passthrough.edits },
    ...Object.values(document.layoutOverrides ?? {})
  ]) {
    const slots = compositionWaterSlots({ version: document.version, revision: document.revision, entities });
    for (const id of new Set([...Object.keys(entities), ...Object.keys(edits)])) {
      const kind = compositionWaterKind(id, entities[id]?.origin);
      if (!kind || slots[kind]) continue;
      delete entities[id];
      delete edits[id];
    }
  }
  return document;
}

/** Update owned records in the existing Scene. Unrelated objects and stable IDs survive. */
export function writePlanningProjectSource(draft: RuntimeProjectEdit, path: string, document: PlanningDocument): void {
  const desired = exportPlanningScene(document),
    scene = new RuntimeSceneEdit(draft, path);
  const assets = new Set(draft.list().map((file) => file.virtualPath));
  const templateWaterMaterials = new Map<string, string>();
  const activeTemplateId = templateId(document);
  const lakeMaterial = "Water/Materials/lake.mat";
  if (
    (activeTemplateId === "titan-wasteland" || activeTemplateId === "low-poly" || activeTemplateId === "oil-paint") &&
    assets.has(lakeMaterial)
  ) {
    const isLowPoly = activeTemplateId === "low-poly";
    const isOilPaint = activeTemplateId === "oil-paint";
    for (const pool of WORLD_TEMPLATE_ART[activeTemplateId]?.water ?? []) {
      const entityId = `lake:authored:template:${activeTemplateId}:water:${pool.id}`;
      if (!document.entities[entityId]?.components.lakes?.values.enabled) continue;
      const target = `Water/Materials/template-${activeTemplateId}-${pool.id}.mat`;
      if (!assets.has(target)) {
        const file = JSON.parse(draft.read(lakeMaterial) as string) as WaterMaterialFile;
        if (file.shaderData && Object.keys(file.shaderData).length > 0) {
          const colored = withSeedWorldWaterColor(resolveWaterMaterialFileLook(file), pool.color);
          // Optical tint distance describes the water, independently of the dimensions of its bed.
          const appearance = colored.appearance.appearance;
          const depth = appearance.depthResponse;
          const tintedLook =
            "distanceMeters" in depth && pool.depthTintDistanceM !== undefined
              ? {
                  ...colored,
                  appearance: {
                    ...colored.appearance,
                    appearance: { ...appearance, depthResponse: { ...depth, distanceMeters: pool.depthTintDistanceM } }
                  }
                }
              : colored;
          const look = {
            ...tintedLook,
            optics: {
              ...tintedLook.optics,
              profile: {
                ...tintedLook.optics.profile,
                absorptionCoefficient: isOilPaint
                  ? ([1.35, 0.34, 0.24] as const)
                  : isLowPoly
                    ? ([1.55, 0.24, 0.16] as const)
                    : ([1.75, 0.16, 0.3] as const),
                scatteringCoefficient: isOilPaint ? 0.38 : isLowPoly ? 0.44 : 0.48,
                scatteringColor: isOilPaint
                  ? ([0.08, 0.36, 0.44] as const)
                  : isLowPoly
                    ? ([0.04, 0.54, 0.68] as const)
                    : ([0.05, 0.72, 0.58] as const),
                maximumSurfaceOpticalDistance: isOilPaint ? 2.4 : isLowPoly ? 1.8 : 2.2,
                reflectionIntensity: isOilPaint ? 0.88 : isLowPoly ? 0.78 : 0.58
              }
            }
          };
          const content = updateWaterMaterialParameters(file, look);
          content.shaderData.material_AppearanceV2DepthDistance = {
            type: "Float",
            value: pool.depthTintDistanceM ?? (isLowPoly ? 0.42 : 0.65)
          };
          content.shaderData.material_AppearanceV2DepthExponent = { type: "Float", value: 0.65 };
          content.shaderData.material_AppearanceV2DepthColor = {
            type: "Vector4",
            value: isLowPoly ? { x: 0.018, y: 0.34, z: 0.48, w: 1 } : { x: 0.012, y: 0.48, z: 0.4, w: 1 }
          };
          content.name = `${activeTemplateId} ${pool.id}`;
          draft.create({ virtualPath: target, path: target, type: "Material" }, JSON.stringify(content));
          assets.add(target);
        }
      }
      if (assets.has(target)) templateWaterMaterials.set(entityId, target);
    }
  }
  // Existing external lighting is outside the vegetation conversion. Keep its explicit
  // URL adapter; do not turn it into an unresolved project reference or discard authoring.
  for (const component of desired.components)
    if (component.type === "PlanningLighting") {
      const reference = component.props.profileReference as { url: string } | undefined;
      if (reference && !assets.has(reference.url)) {
        component.props.profileUrl = reference.url;
        delete component.props.profileReference;
      }
    }
  const winds = scene.queryComponents({ type: "PlanningGroundWind" });
  if (winds.length > 1) throw new Error("Scene requires one ground wind owner");
  desired.entities[0].components.push(desired.components.length);
  desired.components.push({
    type: "PlanningGroundWind",
    props: winds[0] ? (scene.readComponent(winds[0].id).props ?? {}) : {}
  });
  if (draft.list().some((file) => file.virtualPath === DEFAULT_PLANT_PROJECT_RESOURCES.catalog)) {
    const current = scene.queryComponents({ type: "PlanningVegetationResources" });
    if (current.length > 1) throw new Error("Scene requires one vegetation resource owner");
    const oilPaintCatalog = "World/Vegetation/template-oil-paint-plant-species.json";
    if (activeTemplateId === "oil-paint" && !assets.has(oilPaintCatalog)) {
      const catalog = structuredClone(defaultPlantSpeciesCatalog) as unknown as {
        foliageVariation?: {
          regionExposureStops?: [number, number];
          plantExposureStops?: [number, number];
          regionalTint?: { colors: [number[], number[]]; influence: number; plantInfluence?: number };
        };
        assets?: Array<{
          id: string;
          instanceScale?: [number, number, number];
          geometryLodOffset?: number;
          geometryLeafRetention?: number;
          instanceVariation?: {
            yawDegrees: number;
            leafSize: number;
            leafDensity: number;
            leafColor: [number, number, number];
            barkTint: [number, number, number];
          };
          vegetation?: {
            layer?: string;
            seedWorld?: boolean;
          };
        }>;
        treeRecipes?: Array<{ id: string; vegetation?: { seedWorld?: boolean } }>;
        shrubRecipes?: Array<{ id: string; vegetation?: { seedWorld?: boolean } }>;
      };
      catalog.foliageVariation = {
        regionExposureStops: [-0.35, 0.25],
        plantExposureStops: [-0.25, 0.25],
        regionalTint: {
          colors: [
            [0.2, 0.56, 0.08],
            [0.88, 0.16, 0.05]
          ],
          influence: 0.92,
          plantInfluence: 0.9
        }
      };
      // Oil-paint forest uses slender procedural birch trees/saplings, upright grass tufts, and fallen autumn leaves.
      for (const entry of catalog.shrubRecipes ?? []) {
        if (entry.vegetation) entry.vegetation.seedWorld = false;
      }
      for (const entry of catalog.treeRecipes ?? []) {
        if (entry.vegetation) entry.vegetation.seedWorld = false;
      }
      const oilPaintShapes: Readonly<
        Record<
          string,
          {
            scale: [number, number, number];
            geometryLodOffset?: number;
            geometryLeafRetention?: number;
            leafDensity?: number;
            leafSize?: number;
          }
        >
      > = {
        // Physically prune ~85% of leaf cards at CPU mesh build time + shift to LOD2/LOD3 + enlarge remaining leaf cards!
        // Cuts actual GPU Submitted Tris per tree by >82% (LOD2 ~800 tris, LOD3 ~280 tris) while bold 2.4x leaves stay lush!
        SM_BirchTree_01: {
          scale: [1.08, 1.12, 1.08],
          geometryLodOffset: 2,
          geometryLeafRetention: 0.14,
          leafDensity: 1.0,
          leafSize: 2.35
        },
        SM_BirchTree_02: {
          scale: [1.12, 1.15, 1.12],
          geometryLodOffset: 2,
          geometryLeafRetention: 0.14,
          leafDensity: 1.0,
          leafSize: 2.45
        },
        SM_BirchTree_07: {
          scale: [1.1, 1.14, 1.1],
          geometryLodOffset: 2,
          geometryLeafRetention: 0.12,
          leafDensity: 1.0,
          leafSize: 2.55
        },
        // Ultra-low-poly eye-level saplings (~80-130 tris total vs 1,794 tris before -> -93% GPU triangles!)
        SM_BirchBush_03: {
          scale: [1.08, 1.42, 1.08],
          geometryLodOffset: 3,
          geometryLeafRetention: 0.36,
          leafDensity: 1.0,
          leafSize: 2.35
        },
        SM_BirchBush_04: {
          scale: [1.06, 1.38, 1.06],
          geometryLodOffset: 3,
          geometryLeafRetention: 0.34,
          leafDensity: 1.0,
          leafSize: 2.45
        },
        // Broad, low-card upright grass tuft clumps
        SM_Grass_03_01: { scale: [1.38, 1.65, 1.38] },
        SM_Grass_03_02: { scale: [1.32, 1.55, 1.32] },
        SM_Grass_03_03: { scale: [1.44, 1.75, 1.44] }
      };
      for (const entry of catalog.assets ?? []) {
        if (
          entry.vegetation &&
          ((entry.vegetation.layer === "herbs" && !entry.id.startsWith("SM_Grass_03_")) ||
            entry.id.startsWith("SM_Mushroom_"))
        ) {
          entry.vegetation.seedWorld = false;
        }
        const shape = oilPaintShapes[entry.id];
        if (!shape) continue;
        entry.instanceScale = [...shape.scale];
        if (shape.geometryLodOffset !== undefined) entry.geometryLodOffset = shape.geometryLodOffset;
        if (shape.geometryLeafRetention !== undefined) entry.geometryLeafRetention = shape.geometryLeafRetention;
        if (shape.leafDensity !== undefined || shape.leafSize !== undefined) {
          entry.instanceVariation = {
            leafColor: [1, 1, 1],
            barkTint: [1, 1, 1],
            ...entry.instanceVariation,
            yawDegrees: entry.instanceVariation?.yawDegrees ?? 0,
            leafDensity: shape.leafDensity ?? entry.instanceVariation?.leafDensity ?? 1,
            leafSize: shape.leafSize ?? entry.instanceVariation?.leafSize ?? 1
          };
        }
      }
      draft.create(
        { virtualPath: oilPaintCatalog, path: oilPaintCatalog, type: "PlantSpecies" },
        JSON.stringify(catalog)
      );
      assets.add(oilPaintCatalog);
    }
    const baseProps = current[0]
      ? { ...(scene.readComponent(current[0].id).props ?? {}) }
      : Object.fromEntries(Object.entries(DEFAULT_PLANT_PROJECT_RESOURCES).map(([key, path]) => [key, { $ref: path }]));
    const currentCatalogRef = (baseProps.catalog as { $ref?: string } | undefined)?.$ref;
    if (activeTemplateId === "oil-paint" && assets.has(oilPaintCatalog)) {
      if (!currentCatalogRef || currentCatalogRef === DEFAULT_PLANT_PROJECT_RESOURCES.catalog) {
        baseProps.catalog = { $ref: oilPaintCatalog };
      }
    } else if (currentCatalogRef === oilPaintCatalog) {
      baseProps.catalog = { $ref: DEFAULT_PLANT_PROJECT_RESOURCES.catalog };
    }
    desired.entities[0].components.push(desired.components.length);
    desired.components.push({ type: "PlanningVegetationResources", props: baseProps });
  }
  const existing = scene.queryComponents({ type: PLANNING_PROJECT_COMPONENT });
  if (existing.length > 1) throw new Error("Scene requires one planning authoring owner");
  // Independent Water and Prefab members retain their native Source. Materialized
  // composition water follows its layout and is removed when that layout is replaced.
  const parents = new Map(
    scene.list().flatMap((entity) => (entity.children ?? []).map((child) => [child, entity.id] as const))
  );
  const waterOwners = new Set<string>();
  for (const body of activePlanningWaterBodies(scene)) {
    const id = planningWaterSourceId(scene, body.entityId);
    if (compositionWaterKind(id)) {
      const identity = scene.queryComponents({ entityId: body.entityId, type: PLANNING_ENTITY_COMPONENT })[0];
      if (scene.readComponent(identity.id).props?.origin !== "authored") continue;
    }
    for (let id: string | undefined = body.entityId; id && !waterOwners.has(id); id = parents.get(id))
      waterOwners.add(id);
  }
  const references = (value: unknown): unknown => {
    if (!value || typeof value !== "object") return value;
    if ("$ref" in value && typeof value.$ref === "number") return { $ref: desired.refs[value.$ref].url };
    if (Array.isArray(value)) return value.map(references);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, references(item)]));
  };
  const key = (index: number) => {
    const records = desired.entities[index].components.map((index) => desired.components[index]);
    const identity = records.find((record) => record.type === "PlanningEntityAuthoring");
    const archive = records.find((record) => record.type === "PlanningSeedArchiveAuthoring");
    return identity
      ? identity.props.planningId
      : archive
        ? (archive.props.metadata as { seed: string }).seed
        : undefined;
  };
  const synchronize = (index: number, id: string, archived = false) => {
    const node = desired.entities[index];
    if (scene.readEntity(id).name !== node.name) scene.update(id, { name: node.name });
    const remaining = new Map(
      scene
        .queryComponents({ entityId: id })
        .filter((record) => ownedProperties.has(record.type))
        .map((record) => [record.type, record])
    );
    for (const componentIndex of node.components) {
      const component = desired.components[componentIndex],
        current = remaining.get(component.type);
      let props = references(component.props) as GalaceanSourceValueRecord;
      const entityKey = key(index);
      const templateMaterial =
        component.type === WATER_COMPONENT && typeof entityKey === "string"
          ? templateWaterMaterials.get(entityKey)
          : undefined;
      if (!current && templateMaterial && assets.has(templateMaterial)) {
        props.authoring = { ...(props.authoring as GalaceanSourceValueRecord), material: { $ref: templateMaterial } };
      }
      if (current && component.type === "PlanningEntityAuthoring" && current.id.startsWith("@instance:"))
        props = { ...props, planningId: scene.readComponent(current.id).props!.planningId! };
      if (current && component.type === WATER_COMPONENT) {
        const previous = scene.readComponent(current.id).props?.authoring as GalaceanSourceValueRecord | undefined;
        const previousMatRef = (previous?.material as { $ref?: string } | undefined)?.$ref;
        const resolvedMat =
          activeTemplateId === "low-poly" &&
          templateMaterial &&
          assets.has(templateMaterial) &&
          (!previousMatRef || previousMatRef === lakeMaterial)
            ? { $ref: templateMaterial }
            : previous?.material;
        props = {
          ...props,
          authoring: {
            ...previous,
            ...(props.authoring as GalaceanSourceValueRecord),
            ...(previous?.quality ? { quality: previous.quality } : {}),
            ...(resolvedMat ? { material: resolvedMat } : {})
          }
        };
        const input = props.authoring as unknown as WaterSourceAuthoring;
        const frame = planningWaterFrame(scene, id),
          previousInput = previous as unknown as WaterSourceAuthoring;
        const shape =
          JSON.stringify(transformPlanningWater(previousInput.shape, frame)) === JSON.stringify(input.shape)
            ? previousInput.shape
            : transformPlanningWater(input.shape, frame, true);
        props.authoring = {
          ...input,
          shape:
            shape.kind === "river" && previousInput.shape.kind === "river"
              ? { ...shape, course: { ...shape.course, id: previousInput.shape.course.id } }
              : shape
        } as unknown as GalaceanSourceValueRecord;
        if (!frame.active) props.enabled = scene.readComponent(current.id).props?.enabled ?? true;
      }
      if (!current) scene.addComponent(id, { type: component.type, props });
      else scene.reconcileComponent(current.id, props, ownedProperties.get(component.type)!);
      remaining.delete(component.type);
    }
    for (const record of remaining.values()) {
      // Active bodies belong to the native Water edit transaction. Archives keep parameter data only.
      if (record.type === WATER_COMPONENT && !archived) continue;
      scene.removeComponent(record.id);
    }
    const children = new Map(
      (scene.readEntity(id).children ?? []).map((child) => {
        const records = scene.queryComponents({ entityId: child }).map((record) => scene.readComponent(record.id));
        const identity = records.find((record) => record.type === "PlanningEntityAuthoring");
        const archive = records.find((record) => record.type === "PlanningSeedArchiveAuthoring");
        return [
          planningWaterSourceId(scene, child) ?? (archive?.props?.metadata as { seed?: string } | undefined)?.seed,
          child
        ];
      })
    );
    for (const child of node.children ?? []) {
      const identity = key(child),
        current = children.get(identity as string);
      const inArchive =
        archived ||
        desired.entities[child].components.some((i) => desired.components[i].type === "PlanningSeedArchiveAuthoring");
      synchronize(
        child,
        current ?? scene.create({ name: desired.entities[child].name, parentEntityId: id }).id,
        inArchive
      );
      children.delete(identity as string);
    }
    for (const [identity, child] of children)
      if (identity !== undefined && !waterOwners.has(child)) scene.delete(child);
  };
  scene.batch(() => synchronize(0, existing[0]?.entityId ?? scene.create({ name: "Planning authoring" }).id));
}

/** Merge independent native component and domain-tool changes, rejecting conflicting author intent. */
export function mergePlanningAuthoring(
  base: PlanningDocument,
  current: PlanningDocument,
  next: PlanningDocument
): PlanningDocument {
  const merge = (before: unknown, left: unknown, right: unknown): unknown => {
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    if (same(before, right) || same(left, right)) return left;
    if (same(before, left)) return right;
    const record = (value: unknown): value is Record<string, unknown> =>
      !!value && typeof value === "object" && !Array.isArray(value);
    if (record(before) && record(left) && record(right)) {
      return Object.fromEntries(
        [...new Set([...Object.keys(before), ...Object.keys(left), ...Object.keys(right)])]
          .map((key) => [key, merge(before[key], left[key], right[key])])
          .filter(([, value]) => value !== undefined)
      );
    }
    throw new Error("Conflicting native and planning edits to the same author property");
  };
  // Revision is the session's concurrency counter, not author intent. Native
  // edits and history can restore Source metadata from a different session count.
  return exportPlanningAuthoring({
    ...(merge({ ...base, revision: 0 }, { ...current, revision: 0 }, { ...next, revision: 0 }) as PlanningDocument),
    revision: next.revision
  });
}
