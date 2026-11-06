import type { PlanningDocument } from "../PlanningDocument";
import type { SpatialEntity, SpatialComponent } from "../SpatialDocument";
import { PLANNING_COMPONENTS, planningRegistry } from "../PlanningComponents";
import { resolveComponent } from "../SpatialDocument";
import { createSpatialWorldBase, generateSpatialLand } from "../layout/SpatialTerrain";
import { createPlanningRingQuery } from "../../semantic-study/WorldPlanningTerrain";
import { defaultPoiLayout } from "../../semantic-study/PoiDistribution";
import type { SemanticRecipe } from "../../semantic-study/WorldPlanningContract";
import {
  legacyDefaultPoiLayout,
  legacyDistributePois,
  type LegacyPoiLayoutConfig,
  type LegacyPoiTier,
  type LegacyPoiSite
} from "./LegacyPoiDistribution";
import { legacyInitialLayoutConfiguration } from "./LegacyLayoutProfiles";
import { legacyPoiContentOrganizations } from "./LegacyPoiContent";

const retiredTiers = ["large", "medium", "small"] as const;
type RecordValue = Record<string, any>;

/** Only the importer understands historical class keys and identities. */
export function retireLegacyPoiSpacing(parameters: SemanticRecipe["parameters"] | undefined): void {
  for (const spacing of Object.values((parameters?.poiLayout as unknown as RecordValue)?.spacing ?? {}))
    delete (spacing as RecordValue).maxM;
}
export function legacyLandscapeScopes(landscape: unknown): RecordValue[] {
  return Object.values((landscape as RecordValue | undefined)?.tierOverrides ?? {});
}
function read(value: unknown, path: string): any {
  return path.split(".").reduce((entry: any, key) => entry?.[key], value);
}
function write(value: RecordValue, path: string, input: unknown): void {
  const keys = path.split(".");
  if (keys.some((key) => ["__proto__", "constructor", "prototype"].includes(key)))
    throw new Error("Invalid migration path");
  let target = value;
  for (const key of keys.slice(0, -1)) target = target[key] ??= {};
  target[keys.at(-1)!] = structuredClone(input);
}

function effectiveRecipe(
  parameters: SemanticRecipe["parameters"],
  edits: SemanticRecipe["edits"],
  entities: Record<string, SpatialEntity>
): SemanticRecipe {
  const recipe: SemanticRecipe = { version: 2, parameters: structuredClone(parameters), edits: structuredClone(edits) };
  const scope = { version: 1 as const, revision: 0, entities };
  for (const definition of PLANNING_COMPONENTS) {
    const world = entities.world.components[definition.type];
    if (world && definition.global) {
      const resolved = resolveComponent(scope, "world", definition.type, planningRegistry);
      for (const [key, path] of Object.entries(definition.global))
        if (resolved.sources[key]?.length) write(recipe.parameters, path, resolved.values[key]);
    }
    if (!definition.local) continue;
    for (const entity of Object.values(entities)) {
      if (entity.id === "world" || entity.id.startsWith("policy:") || !entity.components[definition.type]) continue;
      const resolved = resolveComponent(scope, entity.id, definition.type, planningRegistry);
      for (const [key, path] of Object.entries(definition.local))
        if (resolved.sources[key]?.length) write((recipe.edits[entity.id] ??= {}), path, resolved.values[key]);
    }
  }
  return recipe;
}

function repairMigratedContent(document: PlanningDocument): void {
  const scopes = [
    { entities: document.entities, parameters: document.passthrough.parameters, edits: document.passthrough.edits },
    ...Object.values(document.layoutOverrides ?? {})
  ];
  for (const scope of scopes) {
    if (!scope.parameters) continue;
    const candidates = scope.parameters.poiLayout?.candidates ?? [];
    // Only historical generated identities lack their retired category input. New
    // identities and explicit content edits must keep the current allocation.
    const sites: LegacyPoiSite[] = candidates.flatMap((candidate) => {
      const match = /^poi-(large|medium|small)-\d+$/.exec(candidate.id);
      if (!match) return [];
      return [
        {
          id: candidate.id,
          tier: match[1] as LegacyPoiTier,
          center: { ...candidate.origin },
          domainId: candidate.domainId,
          memberIds: []
        }
      ];
    });
    if (!sites.some((site) => scope.entities[site.id]?.components.layout?.values.elementProfile === undefined))
      continue;
    const recipe = effectiveRecipe(scope.parameters, scope.edits, scope.entities);
    const weights = legacyDefaultPoiLayout().territoryWeights!;
    const minimum = Math.min(...Object.values(weights)),
      maximum = Math.max(...Object.values(weights));
    // Version 1 discarded the old spacing/weight policy. Recover bindings from
    // immutable anchors and historical defaults, never from a modified partition.
    const offsets = new Map(
      sites.map((site) => {
        const nearest = Math.min(
          Infinity,
          ...sites
            .filter((other) => other.id !== site.id && other.domainId === site.domainId)
            .map((other) => (site.center.x - other.center.x) ** 2 + (site.center.z - other.center.z) ** 2)
        );
        return [site.id, Number.isFinite(nearest) ? (nearest * (weights[site.tier] - minimum)) / maximum : 0];
      })
    );
    const organizations = legacyPoiContentOrganizations(recipe, sites, offsets, document.authoredResources);
    for (const site of sites) {
      const entity = scope.entities[site.id];
      if (!entity) continue;
      entity.components.layout ??= { base: { entity: "world", component: "layout" }, values: {} };
      entity.components.layout.values.elementProfile ??= organizations[site.id].elementProfile;
    }
  }
}

/** Replace only known generated labels; user-authored names remain intact. */
function normalizeMigratedPoiNames(document: PlanningDocument): void {
  const scopes = [
    { entities: document.entities, parameters: document.passthrough.parameters },
    ...Object.values(document.layoutOverrides ?? {})
  ];
  for (const scope of scopes) {
    const candidates = scope.parameters?.poiLayout?.candidates ?? [];
    for (const [index, candidate] of candidates.entries()) {
      const entity = scope.entities[candidate.id];
      if (entity && (entity.name === "POI" || entity.name === entity.id || /^[大中小]型 POI \d+$/.test(entity.name)))
        entity.name = `POI ${index + 1}`;
    }
  }
}

/** Migrate every saved Seed once, before resolving through the current schema.
 * Old IDs remain opaque stable references. No new runtime code parses them.
 * This preserves author intent and the old power offsets; the current solver owns
 * subsequent relaxation, occupancy and content realization.
 */
export function migrateLegacyPoiAuthoring(document: PlanningDocument): void {
  if (document.poiAuthoringVersion === 2) {
    normalizeMigratedPoiNames(document);
    return;
  }
  if (document.poiAuthoringVersion === 1) {
    repairMigratedContent(document);
    document.poiAuthoringVersion = 2;
    normalizeMigratedPoiNames(document);
    return;
  }
  // Earlier archives could contain instance edits only. Materialize their shared
  // author defaults before conversion so they do not retain unreachable policies.
  for (const [seed, archive] of Object.entries(document.layoutOverrides ?? {})) {
    archive.parameters ??= { ...structuredClone(document.passthrough.parameters), seed: Number(seed) };
    if (!archive.entities.world) {
      archive.entities.world = structuredClone(document.entities.world);
      archive.entities.world.components.world ??= { values: {} };
      archive.entities.world.components.world.values.seed = Number(seed);
      for (const tier of retiredTiers) {
        const id = `policy:${tier}`;
        if (document.entities[id] && !archive.entities[id])
          archive.entities[id] = structuredClone(document.entities[id]);
      }
    }
  }
  const scopes = [
    { entities: document.entities, parameters: document.passthrough.parameters, edits: document.passthrough.edits },
    ...Object.values(document.layoutOverrides ?? {})
  ];
  for (const scope of scopes) {
    const parameters = scope.parameters;
    if (!parameters) continue;
    const entities = scope.entities,
      world = entities.world;
    if (!world) throw new Error("Saved POI scope has no world owner");
    world.components.layout ??= { values: {} };
    world.components.landscape ??= { values: {} };
    world.components.flowers ??= { values: {} };
    const savedConfig = parameters.poiLayout as unknown as RecordValue | undefined;
    const distribution = world.components.distribution?.values ?? {};
    const isLegacy =
      savedConfig?.version === 1 ||
      retiredTiers.some(
        (tier) =>
          entities[`policy:${tier}`] ||
          distribution[`${tier}.minM`] !== undefined ||
          distribution[`areaWeight.${tier}`] !== undefined
      );
    if (!isLegacy) continue;
    const config = legacyDefaultPoiLayout();
    if (savedConfig) Object.assign(config, structuredClone(savedConfig));
    config.spacing = { ...legacyDefaultPoiLayout().spacing, ...savedConfig?.spacing };
    config.territoryWeights = { ...legacyDefaultPoiLayout().territoryWeights, ...savedConfig?.territoryWeights };
    for (const tier of retiredTiers) {
      const min = distribution[`${tier}.minM`],
        weight = distribution[`areaWeight.${tier}`];
      if (min !== undefined) config.spacing[tier] = { minM: Number(min) };
      if (weight !== undefined) config.territoryWeights![tier] = Number(weight);
    }
    // Restore the original world parameters before reproducing the old anchors.
    const recipe = effectiveRecipe(parameters, scope.edits, entities);
    recipe.parameters.poiLayout = config as unknown as SemanticRecipe["parameters"]["poiLayout"];
    const plan = createSpatialWorldBase(recipe);
    generateSpatialLand(plan, recipe, []);
    const domains = [
      { id: "land-main", outline: plan.land },
      ...plan.islands.map((outline, i) => ({ id: `offshore-${i}`, outline }))
    ];
    const legacy = legacyDistributePois({ width: 1024, depth: 1024, seed: recipe.parameters.seed, domains }, config);
    const rings = domains.map((domain) => ({ ...domain, query: createPlanningRingQuery(domain.outline) }));
    const sourceSites = legacy.sites.map((site) => {
      const anchor = entities[site.id]?.components.anchor?.values;
      const center = { x: Number(anchor?.x ?? site.center.x), z: Number(anchor?.z ?? site.center.z) };
      const tier = (entities[site.id]?.components.poi?.values.tier ?? site.tier) as LegacyPoiTier;
      if (!retiredTiers.includes(tier)) throw new Error("Invalid saved POI category");
      return {
        ...site,
        center,
        tier,
        domainId: rings.find((domain) => domain.query.inside(center))?.id ?? site.domainId
      };
    });
    const distanceSquared = (a: { x: number; z: number }, b: { x: number; z: number }) =>
      (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
    const nearest = new Map(
      sourceSites.map((site) => [
        site.id,
        Math.min(
          Infinity,
          ...sourceSites
            .filter((other) => other.id !== site.id && other.domainId === site.domainId)
            .map((other) => distanceSquared(site.center, other.center))
        )
      ])
    );
    const spacingM = Math.max(
      defaultPoiLayout().spacingM,
      ...[...nearest.values()].filter(Number.isFinite).map(Math.sqrt)
    );
    const weights = config.territoryWeights!,
      minimum = Math.min(...Object.values(weights)),
      maximum = Math.max(...Object.values(weights));
    const offsets = new Map(
      sourceSites.map((site) => {
        const squared = nearest.get(site.id)!;
        const oldWeight = Number(recipe.edits[site.id]?.poi?.sizeWeight ?? 1);
        return [
          site.id,
          Number.isFinite(squared) ? squared * ((weights[site.tier] - minimum) / maximum + oldWeight - 1) : 0
        ];
      })
    );
    const organizations = legacyPoiContentOrganizations(recipe, sourceSites, offsets, document.authoredResources);
    // Reconstruct sparse policy authoring before detaching its consumers.
    const landscapeDefinition = PLANNING_COMPONENTS.find((definition) => definition.type === "landscape")!;
    for (const tier of retiredTiers) {
      const id = `policy:${tier}`;
      const entity = (entities[id] ??= { id, name: id, parent: "world", components: {} });
      const values: RecordValue = {};
      const legacyLandscape = config.landscape as unknown as RecordValue;
      if (legacyLandscape.tierDensity?.[tier] !== undefined) values.density = legacyLandscape.tierDensity[tier];
      for (const [key, path] of Object.entries(landscapeDefinition.local!)) {
        const value = read(legacyLandscape.tierOverrides?.[tier], path.replace(/^landscape\./, ""));
        if (value !== undefined) values[key] = value;
      }
      const existing = entity.components.landscape;
      entity.components.landscape = {
        base: existing?.base ?? { entity: "world", component: "landscape" },
        values: { ...values, ...existing?.values }
      };
    }
    const oldEntities = structuredClone(entities);
    const oldScope = { version: 1 as const, revision: 0, entities: oldEntities };
    const knownFields = (type: string) =>
      new Set(
        planningRegistry
          .get(type)
          .fields.filter((field) => !field.readonly)
          .map((field) => field.key)
      );
    const valuesFollowingPolicy = (id: string, type: string): RecordValue => {
      const component = oldEntities[id]?.components[type];
      if (!component) return {};
      const definition = planningRegistry.get(type);
      const resolved = resolveComponent(oldScope, id, type, planningRegistry);
      return Object.fromEntries(
        Object.entries(resolved.values).filter(
          ([key, value]) =>
            value !== undefined &&
            (type !== "layout" || resolved.sources[key]?.length) &&
            definition.fields.some((field) => field.key === key && !field.readonly)
        )
      );
    };
    for (const site of sourceSites) {
      const entity = (entities[site.id] ??= {
        id: site.id,
        name: "POI",
        parent: "world",
        origin: "generated",
        components: {}
      });
      const policy = oldEntities[`policy:${site.tier}`];
      // Freeze the old sampled geometry defaults; explicit authored values win.
      const initial = legacyInitialLayoutConfiguration(
        recipe.parameters.seed,
        site,
        undefined,
        undefined,
        organizations[site.id]
      );
      const layout = knownFields("layout");
      const sampled = Object.fromEntries(Object.entries(initial.rule).filter(([key]) => layout.has(key)));
      const policyLayout = policy?.components.layout ? valuesFollowingPolicy(policy.id, "layout") : {};
      const ownLayout = oldEntities[site.id]?.components.layout ? valuesFollowingPolicy(site.id, "layout") : {};
      entity.components.layout = {
        base: { entity: "world", component: "layout" },
        values: {
          ...sampled,
          elementProfile: initial.elementProfile,
          ...policyLayout,
          ...ownLayout
        }
      };
      for (const type of ["landscape", "flowers"]) {
        if (!policy?.components[type] && !oldEntities[site.id]?.components[type]) continue;
        const definition = planningRegistry.get(type),
          fields = definition.fields.filter((field) => !field.readonly);
        const policyValues = policy?.components[type] ? valuesFollowingPolicy(policy.id, type) : {};
        const own = oldEntities[site.id]?.components[type];
        const inherited = own?.base && own.base.entity !== "world" ? valuesFollowingPolicy(site.id, type) : {};
        const effective = { ...policyValues, ...inherited, ...own?.values };
        const base = world.components[type]
          ? resolveComponent({ version: 1, revision: 0, entities }, "world", type, planningRegistry).values
          : {};
        const local = Object.fromEntries(
          fields
            .filter(
              (field) =>
                effective[field.key] !== undefined &&
                JSON.stringify(effective[field.key]) !== JSON.stringify(base[field.key])
            )
            .map((field) => [field.key, effective[field.key]])
        );
        entity.components[type] = { base: { entity: "world", component: type }, values: local };
      }
      const rawInherited = (id: string, type: string, seen = new Set<string>()): RecordValue => {
        const key = `${id}/${type}`;
        if (seen.has(key)) throw new Error("Saved POI parameter inheritance cycle");
        seen.add(key);
        const component = oldEntities[id]?.components[type];
        return {
          ...(component?.base ? rawInherited(component.base.entity, component.base.component, seen) : {}),
          ...component?.values
        };
      };
      const flowerContext = {
        ...rawInherited(policy.id, "legacyFlowerContext"),
        ...rawInherited(policy.id, "flowers"),
        ...rawInherited(site.id, "legacyFlowerContext"),
        ...rawInherited(site.id, "flowers")
      };
      const context = Object.fromEntries(
        ["roadBandM", "roadMultiplier", "plazaMultiplier", "backgroundMultiplier"]
          .filter((key) => flowerContext[key] !== undefined)
          .map((key) => [key, flowerContext[key]])
      );
      if (Object.keys(context).length) {
        const edit = (scope.edits[site.id] ??= {});
        edit.flowers = { ...context, ...edit.flowers };
      }
      const oldWeight = Number(
        oldEntities[site.id]?.components.poi
          ? resolveComponent(oldScope, site.id, "poi", planningRegistry).values.sizeWeight
          : (scope.edits[site.id]?.poi?.sizeWeight ?? 1)
      );
      const squared = nearest.get(site.id)!;
      const offset = Number.isFinite(squared)
        ? squared * ((weights[site.tier] - minimum) / maximum + oldWeight - 1)
        : 0;
      const sizeWeight = 1 + offset / (spacingM * spacingM);
      if (!Number.isFinite(sizeWeight) || sizeWeight <= 0) throw new Error("Saved POI weight cannot be migrated");
      entity.components.poi ??= { values: {} };
      entity.components.poi.values.sizeWeight = sizeWeight;
      delete entity.components.poi.values.tier;
    }
    // Preserve explicit references from non-POI author records as well.
    const followsRetired = (component: SpatialComponent | undefined, seen = new Set<string>()): boolean => {
      const base = component?.base;
      if (!base) return false;
      const key = `${base.entity}/${base.component}`;
      if (seen.has(key)) throw new Error("Saved POI parameter inheritance cycle");
      seen.add(key);
      return (
        retiredTiers.some((tier) => base.entity === `policy:${tier}`) ||
        followsRetired(oldEntities[base.entity]?.components[base.component], seen)
      );
    };
    for (const entity of Object.values(entities)) {
      for (const [type, component] of Object.entries(entity.components)) {
        if (!followsRetired(component)) continue;
        entity.components[type] = { values: valuesFollowingPolicy(entity.id, type) };
      }
      if (entity.components.poi) delete entity.components.poi.values.tier;
      if (entity.parent?.startsWith("policy:")) entity.parent = "world";
    }
    for (const tier of retiredTiers) delete entities[`policy:${tier}`];
    world.components.distribution = { values: { spacingM, minAreaM2: 0 } };
    const next = {
      ...defaultPoiLayout(),
      ...config,
      version: 2,
      spacingM,
      minAreaM2: 0,
      candidates: sourceSites.map((site) => ({ id: site.id, origin: { ...site.center }, domainId: site.domainId }))
    } as RecordValue;
    delete next.spacing;
    delete next.territoryWeights;
    delete next.maxSitesPerTier;
    next.landscape = { ...next.landscape };
    delete next.landscape.tierDensity;
    delete next.landscape.tierOverrides;
    const recipeAliases: Record<string, string> = {
      "large-broken-rocks": "broken-rocks-01",
      "large-tapered-rocks": "tapered-rocks-01",
      "medium-broken-rocks": "broken-rocks-02",
      "medium-tapered-rocks": "tapered-rocks-02",
      "small-broken-rocks": "broken-rocks-03",
      "small-tapered-rocks": "tapered-rocks-03",
      "small-tall-tree": "landmark-tree"
    };
    if (Array.isArray(next.population?.recipes))
      for (const recipe of next.population.recipes) {
        recipe.id = recipeAliases[recipe.id] ?? recipe.id;
        delete recipe.tiers;
      }
    parameters.poiLayout = next as LegacyPoiLayoutConfig as unknown as SemanticRecipe["parameters"]["poiLayout"];
  }
  document.poiAuthoringVersion = 2;
  normalizeMigratedPoiNames(document);
}
