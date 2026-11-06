import type { PlanningDocument } from "../PlanningDocument";
import type { SpatialEntity } from "../SpatialDocument";
import { legacyInitialLayoutConfiguration } from "./LegacyLayoutProfiles";

/** Retire organization aliases and the road boolean at the authoring boundary, including inherited policies. */
export function upgradeLegacyLayouts(
  entities: Record<string, SpatialEntity>,
  seed: number,
  legacyDefaults: boolean,
  placementState?: PlanningDocument["placementState"]
): void {
  const hasCurrentLayout = Object.values(entities).some(
    (entity) => entity.components.layout?.values.pattern === "single"
  );
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
        ? legacyInitialLayoutConfiguration(seed, {
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
    // A recent rule can arrive in an older wrapper; its explicit content binding
    // already uses the current profile contract, including linked parameter bases.
    if (!hasCurrentLayout) delete values.elementProfile;
    delete values.count;
    delete values.memberCount;
    delete values.memberBranches;
  }
}
