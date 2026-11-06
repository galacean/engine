import type { PlanningDocument } from "../PlanningDocument";
import type { SpatialEntity } from "../SpatialDocument";
import { initialLayoutConfiguration } from "../layout/LayoutProfiles";

const controls = {
  memberMin: 1,
  memberMax: 1,
  branchShape: "radial",
  roadMode: "none",
  openRadiusM: 0,
  radialVariationM: 0,
  orientationVariation: 0
};

function migrateEntities(entities: Record<string, SpatialEntity>, seed: number): void {
  const old = new Map<string, Record<string, unknown>>();
  const inherited = new Map<string, Record<string, unknown>>();
  const read = (id: string, visiting = new Set<string>()): Record<string, unknown> => {
    if (old.has(id)) return old.get(id)!;
    if (visiting.has(id)) throw new Error("布局参数来源循环：" + id);
    visiting.add(id);
    const component = entities[id]?.components.layout;
    const base = component?.base ? read(component.base.entity, visiting) : {};
    const values = { ...base, ...component?.values };
    inherited.set(id, base);
    old.set(id, values);
    return values;
  };
  for (const entity of Object.values(entities)) if (entity.components.layout) read(entity.id);
  const world = old.get("world") ?? {};
  for (const entity of Object.values(entities)) {
    const values = entity.components.layout?.values;
    if (!values) continue;
    const effective = { ...(entity.id === "world" ? {} : world), ...old.get(entity.id) };
    const base = { ...(entity.id === "world" ? {} : world), ...inherited.get(entity.id) };
    if (values.pattern === "single") {
      Object.assign(values, controls, { pattern: "connected" });
    } else if (effective.pattern === "single") {
      // These fields were inactive under the retired rule. Let the migrated
      // base supply their meaning instead of freezing inherited controls locally.
      for (const key of Object.keys(controls)) delete values[key];
    } else if (base.pattern === "single") {
      // A child that selected another organization must not acquire the new
      // one-member limit or disabled roads from its migrated parameter base.
      const defaults = initialLayoutConfiguration(
        seed,
        {
          id: entity.id,
          center: { x: 0, z: 0 },
          origin: { x: 0, z: 0 },
          domainId: "",
          weightM2: 0,
          areaM2: 0,
          active: true,
          memberIds: []
        },
        effective.pattern as string | undefined,
        effective.elementProfile as string | undefined
      ).rule;
      for (const key of Object.keys(controls)) {
        const prior =
          effective[key] ??
          (key === "memberMin"
            ? 0
            : key === "memberMax"
              ? Number.MAX_SAFE_INTEGER
              : (defaults as unknown as Record<string, unknown>)[key]);
        if (prior !== undefined) values[key] = prior;
      }
    }
  }
}

/** Replace retired single-envelope authoring with ordinary layout controls.
 * @param document Detached authoring document, including inactive Seed archives.
 * @remarks Size ranges and local seeds remain editable. Nonconstant ranges use
 * the current radial random stream on regeneration; no generated size is frozen.
 */
export function migrateSingleLayoutAuthoring(document: PlanningDocument): void {
  for (const [seed, scope] of [[undefined, document], ...Object.entries(document.layoutOverrides ?? {})] as const) {
    const parameters = "passthrough" in scope ? scope.passthrough.parameters : scope.parameters;
    const recipeDefaults = parameters?.poiLayout?.layoutDefaults;
    if (recipeDefaults?.pattern === "single") Object.assign(recipeDefaults, controls, { pattern: "connected" });
    migrateEntities(
      scope.entities,
      Number(seed ?? document.entities.world.components.world?.values.seed ?? document.passthrough.parameters.seed)
    );
  }
}
