import animalTypes from "../planning-data/animal-types.json";
import { defaultPoiLayout } from "../semantic-study/PoiDistribution";
import { initialLayoutConfiguration } from "./layout/LayoutProfiles";
import { isGlobalRoadId } from "./layout/RoadIdentity";
import type { SemanticRecipe, SemanticEdit } from "../semantic-study/WorldPlanningContract";
import type { IslandPlan } from "../semantic-study/IslandPlanModel";
import { PLANNING_COMPONENTS, planningRegistry } from "./PlanningComponents";
import { resolveComponent, type SpatialDocument, type SpatialEntity, type SpatialComponent } from "./SpatialDocument";
import { validatePlanningResources, type PlanningResource } from "./PlanningResources";
import { normalizePlantMaterialFields } from "./PlantMaterialParameters";
import { retireRockPaletteFields } from "../integrations/terrain/rock-formation/ColorPalette.ts";
import type { LegacyFlowerContext } from "./ecology/FlowerInfluences";
import {
  NATURAL_VEGETATION_SIZE_CONTROLS,
  resolveNaturalVegetationSizes,
  type NaturalVegetationSizeOverrides
} from "../runtime/NaturalVegetationLayers.ts";
/** Only unexposed solver configuration remains in passthrough; authored fields have one owner. */
export interface PlanningDocument extends SpatialDocument {
  /** Explicit fresh-start requests, scoped by Seed. Authoring undo retains the
   * original IDs; completion receipts live with the corresponding farm save. */
  farmInitializationRequests?: Record<string, { id: string; statePath: string }>;
  /** Author water cuts are applied after the independent global plan. Absent means legacy comparison is required. */
  waterAuthoringVersion?: 1;
  authoredResources?: PlanningResource[];
  passthrough: SemanticRecipe;
  /** Legacy import only. New sessions keep derived snapshots outside the authoring document. */
  placementState?: import("./layout/SpatialWorld").SpatialLayoutState;
  samplingVersion?: number;
  /** Authoring migration marker for independent organization and internal-road choices. */
  layoutVersion?: 2;
  /** Inactive layouts retain instance edits; only entities for the active Seed enter the solver. */
  layoutOverrides?: Record<
    string,
    {
      entities: Record<string, SpatialEntity>;
      edits: SemanticRecipe["edits"];
      parameters?: SemanticRecipe["parameters"];
      placementState?: import("./layout/SpatialWorld").SpatialLayoutState;
      authoredResources?: PlanningResource[];
      waterAuthoringVersion?: 1;
    }
  >;
}
/** Legacy max affected a random stop threshold, not a geometric upper bound. Keep only the authored minimum. */
function retirePoiSpacingMax(parameters: SemanticRecipe["parameters"] | undefined): void {
  for (const spacing of Object.values(parameters?.poiLayout?.spacing ?? {}))
    delete (spacing as { maxM?: unknown }).maxM;
}
/** Offshore landmark height overrides were withdrawn; generic POI/solid dimensions remain authored. */
function retireOffshoreContents(scope: {
  parameters?: SemanticRecipe["parameters"];
  edits?: SemanticRecipe["edits"];
}): void {
  if (scope.parameters) writePath(scope.parameters, "offshoreContents", undefined);
  for (const edit of Object.values(scope.edits ?? {})) writePath(edit, "offshoreContents", undefined);
}
/** Removed terrain quality controls must not survive in current or archived recipes. */
function retireTerrainSampling(scope: {
  parameters?: SemanticRecipe["parameters"];
  edits?: SemanticRecipe["edits"];
}): void {
  for (const values of [scope.parameters, ...Object.values(scope.edits ?? {})]) {
    if (!values) continue;
    for (const key of ["terrainDetailEnabled", "terrainDetailSpacingM", "terrainSampling"])
      writePath(values, key, undefined);
  }
}
const legacyPlantSizeIds = new Set(NATURAL_VEGETATION_SIZE_CONTROLS.flatMap((control) => control.assetIds));
function legacyPlantSizeField(key: string): boolean {
  const parts = key.split(".");
  return (
    parts.length === 3 &&
    parts[0] === "plantSizes" &&
    legacyPlantSizeIds.has(parts[1]) &&
    (parts[2] === "scaleMin" || parts[2] === "scaleMax")
  );
}
/** Compact old author fields without flattening their parameter-source relationships. */
function retireSpeciesSizeFields(entities: Record<string, SpatialEntity>): void {
  for (const entity of Object.values(entities)) {
    const values = entity.components.landscape?.values;
    if (!values) continue;
    const fields = Object.keys(values).filter(legacyPlantSizeField);
    if (!fields.length) continue;
    const rows = new Map(
      ((values.legacyPlantSizes as LegacyPlantSize[] | undefined) ?? []).map((row) => [row.id, { ...row }])
    );
    for (const key of fields) {
      const [, id, bound] = key.split(".");
      const row = rows.get(id) ?? { id };
      row[bound as "scaleMin" | "scaleMax"] = values[key] as number;
      rows.set(id, row);
      delete values[key];
    }
    values.legacyPlantSizes = [...rows.values()];
  }
}
type LegacyPlantSize = { id: string; scaleMin?: number; scaleMax?: number };
/** Saved species endpoints retain the old sparse base semantics; current edits use shared layer fields. */
function inheritedSpeciesSizes(
  document: PlanningDocument,
  id = "world",
  visiting = new Set<string>()
): NaturalVegetationSizeOverrides {
  if (visiting.has(id)) throw new Error("植被参数来源循环：" + id);
  const component = document.entities[id]?.components.landscape;
  if (!component) return {};
  visiting.add(id);
  const sizes = { ...(component.base ? inheritedSpeciesSizes(document, component.base.entity, visiting) : {}) };
  for (const { id: assetId, ...range } of (component.values.legacyPlantSizes as LegacyPlantSize[] | undefined) ?? [])
    sizes[assetId] = { ...sizes[assetId], ...range };
  visiting.delete(id);
  return sizes;
}
/** Retire organization aliases and the road boolean at the authoring boundary, including inherited policies. */
function upgradeLayouts(
  entities: Record<string, SpatialEntity>,
  seed: number,
  legacyDefaults: boolean,
  placementState?: PlanningDocument["placementState"]
): void {
  // Snapshot before mutation: a child's old meaning must not depend on entity iteration order.
  const resolved = new Map<string, Record<string, unknown>>();
  const read = (id: string, visiting = new Set<string>()): Record<string, unknown> => {
    if (resolved.has(id)) return resolved.get(id)!;
    if (visiting.has(id)) throw new Error("布局参数来源循环：" + id);
    visiting.add(id);
    const component = entities[id]?.components.layout;
    const inherited = component?.base ? read(component.base.entity, visiting) : {};
    const values = { ...inherited, ...component?.values };
    resolved.set(id, values);
    return values;
  };
  for (const entity of Object.values(entities)) if (entity.components.layout) read(entity.id);
  for (const entity of Object.values(entities)) {
    const values = entity.components.layout?.values;
    if (!values) continue;
    const tier = entity.id.split("-")[1] as "large" | "medium" | "small";
    const policy = entity.id.startsWith("poi-") ? (resolved.get("policy:" + tier) ?? {}) : {};
    const effective = { ...policy, ...resolved.get(entity.id) };
    const base = entity.components.layout.base;
    const inherited = base ? (resolved.get(base.entity) ?? {}) : policy;
    const initial =
      (legacyDefaults || inherited.pattern === "scatter" || effective.pattern === "auto") &&
      ["large", "medium", "small"].includes(tier)
        ? initialLayoutConfiguration(seed, {
            id: entity.id,
            tier,
            center: { x: 0, z: 0 },
            domainId: "",
            radiusM: 0,
            memberIds: []
          }).rule
        : undefined;
    const oldPattern =
      effective.pattern && effective.pattern !== "auto"
        ? effective.pattern
        : initial?.roadMode === "none"
          ? "scatter"
          : initial?.pattern;
    if (values.pattern === "scatter") {
      values.pattern = "connected";
      values.branchShape = "radial";
      values.roadMode ??= effective.roadMode ?? "none";
    } else if (
      (effective.pattern === "scatter" || (legacyDefaults && oldPattern === "scatter")) &&
      effective.branchShape !== undefined
    ) {
      // This field was inactive on scatter, even when inherited from a former curve.
      values.branchShape = "radial";
    } else if (values.pattern === "curve") {
      values.pattern = "connected";
      values.branchShape = "curve";
    }
    if (
      legacyDefaults &&
      oldPattern === "scatter" &&
      effective.memberBranches !== undefined &&
      effective.roadMode === undefined
    )
      values.roadMode = "none";
    if (values.memberBranches !== undefined && effective.roadMode === undefined)
      values.roadMode = oldPattern === "scatter" ? "none" : values.memberBranches === false ? "backbone" : "members";
    // An explicit child organization must not inherit the no-road mode introduced on an old scatter base.
    if (inherited.pattern === "scatter" && effective.pattern !== "scatter") {
      values.branchShape ??= effective.branchShape ?? initial?.branchShape ?? "radial";
    }
    if (inherited.pattern === "scatter" && effective.pattern !== "scatter" && effective.roadMode === undefined) {
      values.roadMode =
        oldPattern === "scatter"
          ? "none"
          : effective.memberBranches === true
            ? "members"
            : effective.memberBranches === false
              ? "backbone"
              : initial?.roadMode === "members"
                ? "members"
                : "backbone";
    }
    // Former default scatter + an explicit connected/courtyard override had a backbone.
    // Freeze only this changed default; future edits use the independent road enum.
    if (legacyDefaults && initial?.roadMode === "none" && oldPattern !== "scatter" && effective.roadMode === undefined)
      values.roadMode ??= effective.memberBranches === true ? "members" : "backbone";
    // "auto" was a selection mode, not an organization. Freeze each existing POI's
    // sampled organization so deleting the token cannot expose a different inherited rule.
    if (effective.pattern === "auto" && initial) values.pattern = initial.pattern;
    else if (values.pattern === "auto") delete values.pattern;
    // Consume retired inputs before dropping them. Export and import share the same
    // migration, including inactive Seeds; no generated snapshot survives the boundary.
    let spacing = values.spacingM;
    if (values.radiusM !== undefined && spacing === undefined && effective.spacingM === undefined) {
      const old = placementState?.groups.find((g) => g.id === entity.id)?.rule;
      const n = Number(effective.count ?? (old as { count?: number } | undefined)?.count ?? 1);
      const w = Number(effective.widthMaxM ?? old?.widthMaxM ?? 12),
        d = Number(effective.depthMaxM ?? old?.depthMaxM ?? 12);
      spacing = Math.max(0, Number(values.radiusM) / Math.sqrt(Math.max(1, n) / Math.PI) - Math.hypot(w, d));
    }
    if (spacing !== undefined) {
      values.spacingMinM ??= spacing;
      values.spacingMaxM ??= spacing;
    }
    delete values.radiusM;
    delete values.spacingM;
    delete values.elementProfile;
    delete values.count;
    delete values.memberCount;
    delete values.memberBranches;
  }
}
/** Authoring boundary: discard legacy generated caches before copying any parameter data. */
export function exportPlanningAuthoring(document: PlanningDocument): PlanningDocument {
  const { placementState: _cache, layoutOverrides, ...authoring } = document;
  const result: PlanningDocument = structuredClone({
    ...authoring,
    layoutVersion: 2,
    ...(layoutOverrides
      ? {
          layoutOverrides: Object.fromEntries(
            Object.entries(layoutOverrides).map(([seed, archive]) => {
              const { placementState: _archiveCache, ...parameters } = archive;
              return [seed, parameters];
            })
          )
        }
      : {})
  });
  retirePoiSpacingMax(result.passthrough.parameters);
  retireOffshoreContents(result.passthrough);
  retireTerrainSampling(result.passthrough);
  for (const scope of [result, ...Object.values(result.layoutOverrides ?? {})]) retireSpeciesSizeFields(scope.entities);
  for (const [seed, scope] of [[undefined, result], ...Object.entries(result.layoutOverrides ?? {})] as const) {
    upgradeLayouts(
      scope.entities,
      Number(seed ?? result.entities.world.components.world?.values.seed ?? result.passthrough.parameters.seed),
      document.layoutVersion !== 2,
      seed === undefined ? document.placementState : document.layoutOverrides?.[seed]?.placementState
    );
    for (const entity of Object.values(scope.entities)) {
      delete entity.components.offshoreContents;
      delete entity.components.terrainSampling;
      for (const tier of ["large", "medium", "small"])
        if (entity.components.distribution) delete entity.components.distribution.values[tier + ".maxM"];
    }
    if ("edits" in scope) {
      retirePoiSpacingMax(scope.parameters);
      retireOffshoreContents(scope);
      retireTerrainSampling(scope);
    }
  }
  return result;
}

export function readPath(value: unknown, path: string): unknown {
  return path.split(".").reduce((v: any, key) => v?.[key], value);
}
export function writePath(value: any, path: string, data: unknown): void {
  const keys = path.split(".");
  if (keys.some((k) => ["__proto__", "prototype", "constructor"].includes(k))) throw new Error("无效字段路径");
  let target = value;
  for (const key of keys.slice(0, -1)) {
    if (data === undefined && target[key] === undefined) return;
    target = target[key] ??= {};
  }
  if (data === undefined) delete target[keys.at(-1)!];
  else target[keys.at(-1)!] = data;
}
export function componentKind(id: string, edit: SemanticEdit, plan?: IslandPlan): string {
  if (edit.suspensionBridge || plan?.bridges.some((b) => b.id === id)) return "bridge";
  if (id.startsWith("flowers:")) return "flowerRegion";
  if (plan?.plazas?.some((p) => p.id === id) || id.includes("-plaza-")) return "plaza";
  if (isGlobalRoadId(id)) return "globalRoute";
  if (edit.road || plan?.routes.some((r) => r.id === id)) return "route";
  if (plan?.buildings.some((b) => b.id === id)) return "building";
  if (plan?.poiDistribution?.sites.some((p) => p.id === id) || id.startsWith("poi-")) return "poi";
  if (edit.canyon || plan?.mountains.some((m) => m.id === id && m.semanticKind === "canyon")) return "canyon";
  return (
    plan?.planning?.modules.find((m) => m.id === id)?.kind ??
    (id.startsWith("village-")
      ? "village"
      : id.startsWith("offshore-")
        ? "island"
        : id.startsWith("landform-")
          ? "mountain"
          : id === "routes"
            ? "routes"
            : id === "landscape"
              ? "landscape"
              : "unknown")
  );
}
/** Retired metre values cannot map to one percentage across differently shaped cells.
 * Old projects adopt 100%; an explicit new percentage always wins.
 */
function upgradeLandscapeFalloff(recipe: SemanticRecipe): void {
  const configs = [
    recipe.parameters.poiLayout?.landscape,
    ...Object.values(recipe.parameters.poiLayout?.landscape.tierOverrides ?? {}),
    ...Object.values(recipe.edits).map((edit) => edit.landscape)
  ];
  for (const config of configs)
    if (config && "radialFalloffM" in config) {
      config.falloffRatio ??= 1;
      delete config.radialFalloffM;
    }
}
/** Retired components still carry supported recipe inputs. Move those author values
 * before removing the component; explicit alternate bases are resolved once, while
 * the automatic world/region inheritance remains sparse in the private recipe.
 */
function upgradeFlowerContext(
  entities: Record<string, SpatialEntity>,
  parameters: SemanticRecipe["parameters"] | undefined,
  edits: SemanticRecipe["edits"],
  fallbackWorld?: SpatialEntity,
  fallbackFlowers?: LegacyFlowerContext
): void {
  const keys = ["roadBandM", "roadMultiplier", "plazaMultiplier", "backgroundMultiplier"] as const;
  const legacyEntities = new Set(
    Object.values(entities)
      .filter(
        (entity) =>
          entity.components.legacyFlowerContext ||
          keys.some((key) => entity.components.flowers?.values[key] !== undefined)
      )
      .map((entity) => entity.id)
  );
  if (
    fallbackWorld &&
    (fallbackWorld.components.legacyFlowerContext ||
      keys.some((key) => fallbackWorld.components.flowers?.values[key] !== undefined))
  )
    legacyEntities.add("world");
  if (!legacyEntities.size) return;
  const context = (entity: SpatialEntity | undefined): SpatialComponent | undefined => {
    if (!entity) return;
    const flowers = entity.components.flowers,
      legacy = entity.components.legacyFlowerContext;
    const values = Object.fromEntries(
      keys.flatMap((key) => {
        const value = flowers?.values[key] !== undefined ? flowers.values[key] : legacy?.values[key];
        if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value)))
          throw new Error("旧花丛参数无效：" + entity.id + "." + key);
        return value === undefined ? [] : [[key, value]];
      })
    );
    if (!legacy && !Object.keys(values).length && !flowers?.base) return;
    if (legacy?.base && legacy.base.component !== "legacyFlowerContext")
      throw new Error("旧花丛参数来源必须是相同组件类型");
    if (flowers?.base && flowers.base.component !== "flowers") throw new Error("花丛参数来源必须是相同组件类型");
    // A separated legacy component owns its own base, including an explicit absence.
    const base = legacy ? legacy.base : flowers?.base;
    return { values, ...(base ? { base: { entity: base.entity, component: "legacyFlowerContext" } } : {}) };
  };
  const components = new Map(Object.values(entities).map((entity) => [entity.id, context(entity)]));
  if (!components.has("world") && fallbackWorld) components.set("world", context(fallbackWorld));
  const inheritedLegacy = (id: string, visiting = new Set<string>()): boolean => {
    if (legacyEntities.has(id)) return true;
    if (visiting.has(id)) return false;
    visiting.add(id);
    const base = components.get(id)?.base;
    return !!base && inheritedLegacy(base.entity, visiting);
  };
  const global = Object.fromEntries(
    keys.flatMap((key) => {
      const value = (parameters?.flowers ?? fallbackFlowers)?.[key];
      return value === undefined ? [] : [[key, value]];
    })
  );
  const resolve = (id: string, visiting = new Set<string>()): Record<string, unknown> => {
    if (visiting.has(id)) throw new Error("旧花丛参数来源循环：" + id);
    const component = components.get(id);
    if (!component) {
      // Legacy recipes may already hold the global values outside the component.
      if (id === "world") return global;
      throw new Error("旧花丛参数来源不存在：" + id);
    }
    visiting.add(id);
    const values = {
      ...(id === "world" ? global : {}),
      ...(component.base ? resolve(component.base.entity, visiting) : {}),
      ...component.values
    };
    visiting.delete(id);
    return values;
  };
  for (const entity of Object.values(entities)) {
    const component = components.get(entity.id);
    if (!component || !inheritedLegacy(entity.id)) continue;
    const values =
      component.base && (entity.id === "world" || component.base.entity !== "world")
        ? resolve(entity.id)
        : component.values;
    if (!Object.keys(values).length) continue;
    const destination = entity.id === "world" ? parameters : (edits[entity.id] ??= {});
    if (!destination) throw new Error("旧花丛世界参数缺少 Seed 存档：" + entity.id);
    Object.assign((destination.flowers ??= {}), values as LegacyFlowerContext);
  }
}
/** Lossless migration of current URLs. GUI and tools subsequently edit components, not recipe paths. */
export function importPlanningDocument(recipe: SemanticRecipe, plan?: IslandPlan): PlanningDocument {
  recipe = structuredClone(recipe);
  if (recipe.parameters.farming) {
    delete (recipe.parameters.farming as { riverPreference?: unknown }).riverPreference;
    delete (recipe.parameters.farming as { roadWidthM?: unknown }).roadWidthM;
  }
  retirePoiSpacingMax(recipe.parameters);
  retireOffshoreContents(recipe);
  upgradeLandscapeFalloff(recipe);
  const passthrough = structuredClone(recipe);
  const document: PlanningDocument = {
    version: 1,
    revision: 0,
    layoutVersion: 2,
    entities: { world: { id: "world", name: "世界", components: {} } },
    passthrough
  };
  for (const definition of PLANNING_COMPONENTS)
    if (definition.global) {
      const values: Record<string, unknown> = {};
      for (const [key, path] of Object.entries(definition.global)) {
        const value = readPath(recipe.parameters, path);
        if (value !== undefined) values[key] = value;
        writePath(passthrough.parameters, path, undefined);
      }
      document.entities.world.components[definition.type] = { values };
    }
  // Older recipe exports used asset IDs; give these authored values the same
  // component owner and reset semantics as migrated Planning.json fields.
  const oldSizes = passthrough.parameters.poiLayout?.landscape.plantSizes;
  const legacyRows = Object.entries(oldSizes ?? {})
    .filter(([id]) => legacyPlantSizeIds.has(id))
    .map(([id, range]) => ({ id, ...range }));
  if (legacyRows.length) {
    document.entities.world.components.landscape.values.legacyPlantSizes = legacyRows;
    for (const { id } of legacyRows) delete (oldSizes as Record<string, unknown>)[id];
    if (!Object.keys(oldSizes!).length) delete passthrough.parameters.poiLayout!.landscape.plantSizes;
  }
  for (const definition of PLANNING_COMPONENTS)
    if ((definition.presentation && !definition.kinds) || definition.runtime)
      document.entities.world.components[definition.type] = { values: {} };
  for (const tier of ["large", "medium", "small"]) {
    const id = "policy:" + tier,
      density = recipe.parameters.poiLayout?.landscape.tierDensity?.[tier as "large"];
    const values: Record<string, unknown> = density === undefined ? {} : { density };
    for (const [key, path] of Object.entries(PLANNING_COMPONENTS.find((d) => d.type === "landscape")!.local!)) {
      const value = readPath(
        recipe.parameters.poiLayout?.landscape.tierOverrides?.[tier as "large"],
        path.replace(/^landscape\./, "")
      );
      if (value !== undefined) values[key] = value;
    }
    document.entities[id] = {
      id,
      name:
        ["large", "medium", "small"].indexOf(tier) === 0
          ? "大型 POI 景观"
          : tier === "medium"
            ? "中型 POI 景观"
            : "小型 POI 景观",
      parent: "world",
      components: {
        landscape: {
          base: { entity: "world", component: "landscape" },
          values
        }
      }
    };
  }
  if (passthrough.parameters.poiLayout) {
    delete passthrough.parameters.poiLayout.landscape.tierDensity;
    delete passthrough.parameters.poiLayout.landscape.tierOverrides;
  }
  for (const [id, edit] of Object.entries(recipe.edits)) {
    const kind = componentKind(id, edit, plan),
      entity: SpatialEntity = { id, name: id, components: {} };
    for (const definition of PLANNING_COMPONENTS)
      if (
        definition.local &&
        (definition.kinds?.includes(kind) ||
          (definition.type === "landscape" && edit.landscape) ||
          (definition.type === "flowerInfluence" && edit.flowerInfluence) ||
          (definition.type === "landscapeInfluence" && edit.landscapeInfluence) ||
          (definition.type === "flowers" && edit.flowers))
      ) {
        const values: Record<string, unknown> = {};
        for (const [key, path] of Object.entries(definition.local)) {
          const value = readPath(edit, path);
          if (value !== undefined) {
            values[key] = value;
            writePath(passthrough.edits[id], path, undefined);
          }
        }
        if (Object.keys(values).length)
          entity.components[definition.type] = {
            values,
            base: definition.global
              ? {
                  entity:
                    definition.type === "landscape" && id.startsWith("poi-") ? "policy:" + id.split("-")[1] : "world",
                  component: definition.type
                }
              : undefined
          };
      }
    document.entities[id] = entity;
  }
  for (const patch of recipe.parameters.terrainPatches ?? []) {
    const { id, ...values } = patch;
    if (!id || document.entities[id]) throw new Error("地势实体 ID 缺失或重复：" + id);
    document.entities[id] = { id, name: "区域缓坡", parent: "world", components: { relief: { values } } };
  }
  delete document.passthrough.parameters.terrainPatches;
  return upgradePlanningDocument(document);
}
/** The legacy operators already consume the automatic world → tier → POI chain.
 * Alternate explicit bases must instead be resolved into this compile's private recipe;
 * the authoring document remains sparse so future base edits continue to propagate.
 */
function usesImplicitBase(document: PlanningDocument, entity: SpatialEntity, type: string): boolean {
  const component = entity.components[type];
  if (!component?.base) return false;
  let source: string | undefined = PLANNING_COMPONENTS.find((d) => d.type === type)?.global ? "world" : undefined;
  if (type === "landscape" && !entity.id.startsWith("policy:")) {
    const tier = entity.components.poi
      ? resolveComponent(document, entity.id, "poi", planningRegistry).values.tier
      : /^poi-(large|medium|small)-/.exec(entity.id)?.[1];
    if (tier) source = "policy:" + tier;
  }
  return component.base.entity === source && component.base.component === type;
}
/** Compile authoring components to the private inputs of the existing geometry operators. */
export function exportPlanningRecipe(document: PlanningDocument): SemanticRecipe {
  if (
    PLANNING_COMPONENTS.some(
      (d) => (d.global || (d.presentation && !d.kinds) || d.runtime) && !document.entities.world.components[d.type]
    )
  )
    document = upgradePlanningDocument(document);
  const recipe = structuredClone(document.passthrough);
  // Legacy recipes may omit POI configuration. Restore unexposed solver defaults
  // only in the compiled input; authoring components below retain precedence.
  recipe.parameters.poiLayout = { ...defaultPoiLayout(), ...recipe.parameters.poiLayout };
  retirePoiSpacingMax(recipe.parameters);
  retireOffshoreContents(recipe);
  const patches = Object.values(document.entities)
    .filter((e) => e.components.relief)
    .map((e) => ({ id: e.id, ...resolveComponent(document, e.id, "relief", planningRegistry).values })) as NonNullable<
    SemanticRecipe["parameters"]["terrainPatches"]
  >;
  if (patches.length) recipe.parameters.terrainPatches = patches;
  else delete recipe.parameters.terrainPatches;
  for (const definition of PLANNING_COMPONENTS)
    if (definition.global) {
      const { values, sources } = resolveComponent(document, "world", definition.type, planningRegistry);
      for (const [key, path] of Object.entries(definition.global)) {
        if (definition.sparseGlobal && !sources[key]?.length) continue;
        if (values[key] !== undefined) writePath(recipe.parameters, path, values[key]);
      }
    }
  const legacySizes = inheritedSpeciesSizes(document);
  if (Object.keys(legacySizes).length) {
    const source = recipe.parameters.poiLayout!.landscape.plantSizes;
    recipe.parameters.poiLayout!.landscape.plantSizes = {
      ...source,
      ...Object.fromEntries(Object.entries(legacySizes).map(([id, range]) => [id, { ...source?.[id], ...range }]))
    };
    resolveNaturalVegetationSizes(recipe.parameters.poiLayout!.landscape.plantSizes);
  }
  for (const tier of ["large", "medium", "small"] as const) {
    const scope = document.entities["policy:" + tier]?.components.landscape;
    if (scope) {
      const entity = document.entities["policy:" + tier];
      const inherited = !!scope.base && !usesImplicitBase(document, entity, "landscape");
      const effective = resolveComponent(document, entity.id, "landscape", planningRegistry).values;
      if (scope.values.density !== undefined || (inherited && effective.density !== undefined)) {
        recipe.parameters.poiLayout!.landscape.tierDensity ??= {};
        recipe.parameters.poiLayout!.landscape.tierDensity[tier] = Number(effective.density);
      }
      for (const [key, path] of Object.entries(PLANNING_COMPONENTS.find((d) => d.type === "landscape")!.local!))
        if (key !== "density" && (scope.values[key] !== undefined || inherited))
          writePath(
            recipe.parameters.poiLayout!.landscape,
            "tierOverrides." + tier + "." + path.replace(/^landscape\./, ""),
            effective[key]
          );
    }
  }
  for (const entity of Object.values(document.entities)) {
    if (entity.id === "world" || entity.id.startsWith("policy:")) continue;
    for (const definition of PLANNING_COMPONENTS) {
      const component = entity.components[definition.type];
      if (!component || !definition.local) continue;
      const edit = (recipe.edits[entity.id] ??= {});
      const effective = resolveComponent(document, entity.id, definition.type, planningRegistry).values;
      const implicitBase = usesImplicitBase(document, entity, definition.type);
      for (const [key, path] of Object.entries(definition.local))
        if (component.values[key] !== undefined || (component.base && !implicitBase)) {
          const value = effective[key];
          writePath(edit, path, value);
        }
    }
  }
  return recipe;
}

/** Remove retired authoring contracts once, while retaining registered extension components and current overrides. */
export function upgradePlanningDocument(input: PlanningDocument): PlanningDocument {
  const document = exportPlanningAuthoring(input);
  for (const scope of [document, ...Object.values(document.layoutOverrides ?? {})])
    for (const entity of Object.values(scope.entities)) {
      const rock = entity.components.rockFormation;
      if (rock) retireRockPaletteFields(rock.values);
    }
  // POI depth has no unique metre conversion. Retire it only at the import boundary;
  // missing metre fields use the registered 120m/160m/160m defaults. Explicit metre
  // values and component bases remain authored, including those in archived Seeds.
  // Old sparse counts could inherit max=2; preserve min-only values against the new
  // max=1 default without overriding any explicit maximum in their base chain.
  const animalMaximums = planningRegistry.get("animals").fields.filter((field) => field.key.endsWith(".max"));
  for (const scope of [document, ...Object.values(document.layoutOverrides ?? {})]) {
    // A saved Seed may predate animals entirely. Add the authoring slot before
    // archive activation, so its defaults remain editable through UI and tools.
    if (scope.entities.world) scope.entities.world.components.animals ??= { values: {} };
    const components = Object.values(scope.entities).flatMap((entity) =>
      entity.components.animals ? [entity.components.animals] : []
    );
    const hasAuthoredMaximum = (
      component: SpatialComponent,
      key: string,
      visiting = new Set<SpatialComponent>()
    ): boolean => {
      if (Object.hasOwn(component.values, key)) return true;
      if (!component.base || visiting.has(component)) return false;
      visiting.add(component);
      const base = scope.entities[component.base.entity]?.components[component.base.component];
      return !!base && hasAuthoredMaximum(base, key, visiting);
    };
    const additions: { component: SpatialComponent; key: string; minimum: number }[] = [];
    for (const component of components) {
      const values = component.values;
      for (const key of ["foodSearchDistance", "farmAttraction", "satiationSeconds", "shooFoodCooldown"])
        delete values[`interaction.${key}`];
      if (values.minimumFruitEaters !== undefined) {
        values.minimumEatingAnimals ??= values.minimumFruitEaters;
        delete values.minimumFruitEaters;
      }
      // Retire circular ranges and the old bird pool. Non-flying model counts migrate
      // to species totals; flight-capable species share the birdCount quota.
      const totals = new Map<string, number>();
      for (const type of animalTypes)
        for (const suffix of ["min", "max"]) {
          const oldKey = `${type.typeId}.${suffix}`,
            newKey = `species.${type.speciesId}.${suffix}`;
          const value = values[oldKey];
          if (typeof value === "number") totals.set(newKey, (totals.get(newKey) ?? 0) + value);
          delete values[oldKey];
        }
      for (const [key, value] of totals) {
        // A selected species must exist. Legacy 0/N becomes 1/N; explicit 0/0
        // remains excluded. Current species fields are never rewritten.
        values[key] ??= key.endsWith(".min") && value === 0 && totals.get(key.slice(0, -4) + ".max") !== 0 ? 1 : value;
        if (key.endsWith(".max") && value === 0) values[key.slice(0, -4) + ".min"] ??= 0;
      }
      for (const key of [
        "spawnPoiDepth",
        "roamPoiDepth",
        "visibilityPoiDepth",
        "spawnRadius",
        "roamRadius",
        "birds.min",
        "birds.max"
      ])
        delete values[key];
      for (const type of animalTypes.filter((t) => t.canFly))
        for (const suffix of ["min", "max"]) delete values[`species.${type.speciesId}.${suffix}`];
      for (const field of animalMaximums) {
        const minimum = values[field.key.slice(0, -4) + ".min"];
        if (
          typeof minimum === "number" &&
          Number.isInteger(minimum) &&
          minimum > Number(field.default) &&
          !hasAuthoredMaximum(component, field.key)
        )
          additions.push({ component, key: field.key, minimum });
      }
    }
    for (const { component, key, minimum } of additions) component.values[key] = minimum;
  }
  for (const scope of [document, ...Object.values(document.layoutOverrides ?? {})])
    if (scope.authoredResources !== undefined) validatePlanningResources(scope.authoredResources);
  upgradeFlowerContext(document.entities, document.passthrough.parameters, document.passthrough.edits);
  for (const archive of Object.values(document.layoutOverrides ?? {}))
    upgradeFlowerContext(
      archive.entities,
      archive.parameters,
      archive.edits,
      document.entities.world,
      document.passthrough.parameters.flowers
    );
  for (const entities of [document.entities, ...Object.values(document.layoutOverrides ?? {}).map((a) => a.entities)])
    for (const entity of Object.values(entities)) {
      const materials = entity.components.plantMaterial;
      if (materials) materials.values = normalizePlantMaterialFields(materials.values);
    }

  // Procedural plants own their appearance parameters; retire the removed ecology recolouring layer.
  const landscape = document.passthrough.parameters.poiLayout?.landscape;
  if (landscape) {
    writePath(landscape, "vegetationAppearance", undefined);
    for (const scope of Object.values(landscape.tierOverrides ?? {}))
      writePath(scope, "vegetationAppearance", undefined);
  }
  for (const edits of [
    document.passthrough.edits,
    ...Object.values(document.layoutOverrides ?? {}).map((a) => a.edits)
  ])
    for (const edit of Object.values(edits)) writePath(edit, "landscape.vegetationAppearance", undefined);
  for (const entities of [document.entities, ...Object.values(document.layoutOverrides ?? {}).map((a) => a.entities)])
    for (const entity of Object.values(entities)) {
      const values = entity.components.landscape?.values;
      if (values)
        for (const key of Object.keys(values)) if (key.startsWith("vegetationAppearance.")) delete values[key];
    }
  upgradeLandscapeFalloff(document.passthrough);
  for (const archive of Object.values(document.layoutOverrides ?? {}))
    if (archive.parameters)
      upgradeLandscapeFalloff({ version: 2, parameters: archive.parameters, edits: archive.edits });
  // Former scalar depth is an explicit constant range, including archived Seeds and legacy recipes.
  const migrateDepth = (values: Record<string, unknown> | undefined) => {
    if (!values || values.depthM === undefined) return;
    values.depthMinM ??= values.depthM;
    values.depthMaxM ??= values.depthM;
    delete values.depthM;
  };
  for (const scope of [document, ...Object.values(document.layoutOverrides ?? {})]) {
    for (const entity of Object.values(scope.entities)) migrateDepth(entity.components.rivers?.values);
  }
  for (const recipe of [
    document.passthrough,
    ...Object.values(document.layoutOverrides ?? {}).map((a) => ({ parameters: a.parameters, edits: a.edits }))
  ]) {
    migrateDepth(recipe.parameters?.rivers as Record<string, unknown> | undefined);
    for (const edit of Object.values(recipe.edits ?? {}))
      migrateDepth(edit.rivers as Record<string, unknown> | undefined);
  }
  const retired = new Set([
    "regionArea",
    "buildingRules",
    "content",
    "village",
    "buildingPolicy",
    "buildingSize",
    "legacyBuildingBias",
    "landform",
    "canyon",
    "visualGuidance",
    "localRoad",
    "ambient",
    "worldElevation",
    "regionElevation",
    "transform",
    "legacyFlowerContext",
    "buildingAppearance",
    "riverNetwork"
  ]);
  for (const parameters of [
    document.passthrough.parameters,
    ...Object.values(document.layoutOverrides ?? {}).map((a) => a.parameters)
  ]) {
    if (parameters?.farming) {
      delete (parameters.farming as { riverPreference?: unknown }).riverPreference;
      delete (parameters.farming as { roadWidthM?: unknown }).roadWidthM;
    }
  }
  for (const scope of [document, ...Object.values(document.layoutOverrides ?? {})]) {
    const { entities } = scope;
    for (const entity of Object.values(entities)) {
      if (entity.id.startsWith("world-river-")) {
        delete entities[entity.id];
        continue;
      }
      for (const type of retired) delete entity.components[type];
      for (const [type, component] of Object.entries(entity.components)) {
        const definition = PLANNING_COMPONENTS.find((d) => d.type === type);
        if (!definition) throw new Error("工程缺少组件插件：" + type);
        if (type === "landscape" && component.values.radialFalloffM !== undefined) component.values.falloffRatio ??= 1;
        const fields = new Set(definition.fields.map((f) => f.key));
        for (const key of Object.keys(component.values)) if (!fields.has(key)) delete component.values[key];
      }
    }
  }
  for (const edits of [
    document.passthrough.edits,
    ...Object.values(document.layoutOverrides ?? {}).map((a) => a.edits)
  ]) {
    for (const id of Object.keys(edits)) if (id.startsWith("world-river-")) delete edits[id];
    for (const edit of Object.values(edits))
      for (const key of [
        "buildingCount",
        "floorAreaRatio",
        "buildingPolicy",
        "buildingSize",
        "transform",
        "canyon",
        "regionElevation",
        "size",
        "density",
        "width",
        "height",
        "centerRichness",
        "landformType"
      ])
        if (key !== "size" || !Object.entries(edits).some(([id, e]) => e === edit && id.startsWith("offshore-")))
          delete (edit as any)[key];
  }
  for (const key of ["buildingPolicy", "regionElevation", "worldElevation", "worldRivers"])
    delete (document.passthrough.parameters as any)[key];
  for (const definition of PLANNING_COMPONENTS)
    if (definition.global || (definition.presentation && !definition.kinds) || definition.runtime)
      document.entities.world.components[definition.type] ??= { values: {} };
  for (const entities of [document.entities, ...Object.values(document.layoutOverrides ?? {}).map((a) => a.entities)]) {
    for (const tier of ["large", "medium", "small"]) {
      const id = "policy:" + tier;
      const entity = (entities[id] ??= {
        id,
        name: ({ large: "大型 POI", medium: "中型 POI", small: "小型 POI" } as Record<string, string>)[tier],
        parent: "world",
        components: {}
      });
      entity.name = ({ large: "大型 POI", medium: "中型 POI", small: "小型 POI" } as Record<string, string>)[tier];
      entity.components.layout ??= { values: {} };
    }
  }
  for (const scope of [document, ...Object.values(document.layoutOverrides ?? {})])
    if (scope.waterAuthoringVersion !== undefined && scope.waterAuthoringVersion !== 1)
      throw new Error("Unsupported water authoring version");
  document.samplingVersion ??= 1;
  return document;
}
