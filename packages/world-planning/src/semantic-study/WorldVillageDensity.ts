import type { SemanticParameters, SemanticEdit, SemanticResult } from "./WorldPlanningContract";
import { finalizePlanningTerrain, createPlanningGroundSampler } from "./WorldPlanningTerrain";
import { finalizeVillageAreaPaths } from "./WorldLayoutPlaces";
import { buildPlanningVisuals, planningSightBlocked } from "./WorldLayoutRoutes";
import { validatePlanningWorld } from "./WorldPlanningValidation";

/** Update a feasible village packing without invoking any spatial layout stage.
 * Only density-only transactions on accepted snapshots qualify. Full independent
 * scoped geometry audits still inspect new buildings against terrain, mountains and routes.
 * @param parameters Normalized world intent; must equal the accepted recipe.
 * @param edits Requested per-object edits, normalized in this transaction.
 * @param previous Accepted snapshot containing reusable building capacity.
 * @returns An isolated accepted result or rollback; undefined requires general planning.
 */
export function updateVillageDensity(
  parameters: SemanticParameters,
  edits: Record<string, SemanticEdit>,
  previous: SemanticResult,
  audit = true
): SemanticResult | undefined {
  if (!previous.accepted || JSON.stringify(parameters) !== JSON.stringify(previous.recipe.parameters)) return;
  const changed = [...new Set([...Object.keys(edits), ...Object.keys(previous.recipe.edits)])].filter(
    (id) => JSON.stringify(edits[id] ?? {}) !== JSON.stringify(previous.recipe.edits[id] ?? {})
  );
  if (!changed.length) return;
  for (const id of changed) {
    const before = { ...previous.recipe.edits[id] },
      after = { ...edits[id] };
    delete before.density;
    delete after.density;
    if (
      JSON.stringify(before) !== JSON.stringify(after) ||
      !Number.isFinite(edits[id]?.density) ||
      previous.recipe.edits[id]?.locked ||
      !previous.plan.regions.find((r) => r.id === id && r.kind === "village" && r.buildingCapacity)
    )
      return;
  }
  const start = performance.now(),
    plan = structuredClone(previous.plan),
    data = plan.planning!,
    ground = createPlanningGroundSampler(plan);
  const protectedViews = !audit
    ? []
    : previous.plan.sights.filter(
        (s) =>
          (s.id === "sight-spawn" || s.id === "sight-teleport-0") &&
          s.status === "pass" &&
          s.eyeHeight !== undefined &&
          s.targetHeight !== undefined
      );
  for (const id of changed) {
    const region = plan.regions.find((r) => r.id === id)!,
      pool = region.buildingCapacity!,
      density = Math.max(0, Math.min(1, edits[id].density!));
    edits[id].density = density;
    const owners = new Set(pool.buildings.map((b) => b.id));
    const eligible = pool.buildings.filter(
      (building) =>
        !protectedViews.some((view) =>
          planningSightBlocked(
            { ...plan, rocks: [], buildings: [{ ...building, baseHeight: ground(building.center) }] },
            view.from,
            view.eyeHeight!,
            view.to,
            view.targetHeight!,
            [],
            () => -Infinity
          )
        )
    );
    const buildings = eligible.slice(0, Math.round(pool.buildings.length * density)),
      active = new Set(buildings.map((b) => b.id));
    if (buildings.length < Math.round(pool.buildings.length * density))
      data.adjustments.push({
        owners: [id, "visual"],
        reason: "保留出生点与眺望点的已确认视廊，局部建筑密度按可用容量调整",
        requested: Math.round(pool.buildings.length * density),
        resolved: buildings.length
      });
    plan.buildings = plan.buildings.filter((b) => b.regionId !== id).concat(structuredClone(buildings));
    data.ports = data.ports
      .filter((p) => !owners.has(p.ownerId))
      .concat(structuredClone(pool.ports.filter((p) => active.has(p.ownerId))));
    data.relations = data.relations
      .filter((r) => !r.owners.some((owner) => owners.has(owner)))
      .concat(structuredClone(pool.relations.filter((r) => r.owners.some((owner) => active.has(owner)))));
    region.navigationLinks = region
      .navigationLinks!.filter((link) => !owners.has(link.to.replace(/-door$/, "")))
      .concat(structuredClone(pool.links.filter((link) => active.has(link.to.replace(/-door$/, "")))));
    const module = data.modules.find((m) => m.id === id)!;
    module.requested.density = density;
    Object.assign(module.resolved, {
      buildings: buildings.length,
      density: pool.buildings.length ? buildings.length / pool.buildings.length : 0,
      height: Math.max(0, ...buildings.map((b) => b.height))
    });
  }
  if (audit) {
    finalizePlanningTerrain(plan);
    finalizeVillageAreaPaths(plan, new Set(changed));
  } else {
    for (const building of plan.buildings)
      if (changed.includes(building.regionId)) building.baseHeight = ground(building.center);
    for (const port of data.ports)
      if (changed.some((id) => port.ownerId.startsWith(id + "-building-"))) port.height = ground(port.position);
  }
  const changedOwners = new Set([
    ...changed,
    ...plan.regions
      .filter((r) => changed.includes(r.id))
      .flatMap((r) => r.buildingCapacity!.buildings.map((b) => b.id)),
    "visual"
  ]);
  data.checks = data.checks.filter(
    (c) => !c.owners.some((id) => changedOwners.has(id)) && c.rule !== "V01" && c.rule !== "V02"
  );
  buildPlanningVisuals(plan, 0.7);
  const auditStart = performance.now();
  data.checks = audit
    ? [...new Map([...data.checks, ...validatePlanningWorld(plan, new Set(changed))].map((c) => [c.id, c])).values()]
    : [];
  const accepted = !data.checks.some((c) => c.required && c.status !== "pass");
  data.revision++;
  data.rounds = 0;
  data.changedIds = [
    ...changed,
    ...(JSON.stringify(plan.sights) !== JSON.stringify(previous.plan.sights) ? ["visual"] : [])
  ];
  data.status = accepted ? "valid" : "invalid";
  const notes = [
    `建筑局部更新 ${Math.round(performance.now() - start)}ms；独立约束检查 ${Math.round(performance.now() - auditStart)}ms；布局阶段重算 0`
  ];
  if (!accepted) notes.push("局部候选未满足约束，保留已接受地图");
  return {
    recipe: { version: 2, parameters, edits },
    plan: accepted ? plan : previous.plan,
    accepted,
    checks: data.checks,
    changedIds: data.changedIds,
    notes
  };
}
