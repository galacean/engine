import { probeSpatialPlacement } from "./layout/SpatialWorld";
import { exportPlanningRecipe, upgradePlanningDocument, type PlanningDocument } from "./PlanningDocument";
import { generatePlanningDocument } from "./PlanningRuntime";
import type { LayoutGroup } from "./layout/LayoutKernel";
import { settlementRandom } from "../semantic-study/SettlementGeometry";
import {
  migratePopulationRanges,
  resolvePopulationRanges,
  type PlanningPopulationOptions,
  type PlanningPopulationRanges
} from "./PlanningPopulationParameters";
export type { PlanningPopulationOptions } from "./PlanningPopulationParameters";

interface PopulationOutcome {
  seed: number;
  villages: number;
  buildings: number;
  selectedPoiIds: string[];
  diagnostics: string[];
  /** Restore only unchanged initialization-owned range endpoints on an explicit replan. */
  layoutRanges?: Record<
    string,
    {
      before: { memberMin?: number; memberMax?: number };
      applied: { memberMin: number; memberMax: number };
    }
  >;
}
/** Historical result of an explicit population planning operation, not runtime restrictions. */
export type PlanningPopulationReceipt = PopulationOutcome &
  (({ version: 2 } & PlanningPopulationRanges) | { version: 1; villageTarget: number; buildingLimit: number });

// Site combinations share a finite search budget; ordinary regeneration does not consume it.
const INITIALIZATION_EVALUATION_BUDGET = 24;

function* selections(
  groups: readonly LayoutGroup[],
  count: number,
  start = 0,
  prefix: LayoutGroup[] = []
): Generator<LayoutGroup[]> {
  if (!count) {
    yield prefix;
    return;
  }
  for (let i = start; i <= groups.length - count; i++)
    yield* selections(groups, count - 1, i + 1, [...prefix, groups[i]]);
}

function* populationSelections(groups: readonly LayoutGroup[], preferred: number): Generator<LayoutGroup[]> {
  // Keep a fully validated empty fallback, then interleave smaller populations
  // so an infeasible preferred count cannot consume the entire search budget.
  yield [];
  const levels = Array.from({ length: preferred }, (_, index) => selections(groups, preferred - index));
  while (levels.length) {
    for (let index = 0; index < levels.length; ) {
      const candidate = levels[index].next();
      if (candidate.done) levels.splice(index, 1);
      else {
        yield candidate.value;
        index++;
      }
    }
  }
}

/** Realize a one-time population request using ordinary POI profiles and member ranges.
 * Every candidate retains its identity. Building suitability is established by the actual
 * footprint/slope solver; neither POI spacing nor elevation assigns a content purpose.
 * Only this explicit operation selects sites and distributes the world building budget.
 * A shared finite evaluation budget bounds the search; complete required world checks must pass.
 * The resulting per-POI ranges remain editable; the world budget does not constrain later native additions.
 * @param input Fresh author inputs, or an explicitly requested population regeneration. Not mutated.
 * @param options Overrides for the authored world ranges; absent fields use the registered defaults.
 * @returns Author inputs with the historical receipt and the complete validated structural result.
 * @throws For invalid ranges or when no publishable layout fits within the bounded initialization search.
 */
export function preparePlanningPopulation(
  input: PlanningDocument,
  options: PlanningPopulationOptions = {}
): { document: PlanningDocument; result: ReturnType<typeof generatePlanningDocument> } {
  const document = upgradePlanningDocument(input);
  const authored = exportPlanningRecipe(document).parameters.population;
  const overrides = { ...options };
  migratePopulationRanges(overrides);
  const ranges = resolvePopulationRanges({ ...authored, ...overrides });
  const { villageMin, villageMax, buildingMin, buildingMax } = ranges;
  document.entities.world.components.population = { values: { ...ranges } };
  delete document.placementState;
  for (const [id, range] of Object.entries(document.populationInitialization?.layoutRanges ?? {})) {
    const values = document.entities[id]?.components.layout?.values;
    if (!values) continue;
    for (const key of ["memberMin", "memberMax"] as const)
      if (values[key] === range.applied[key]) {
        if (range.before[key] === undefined) delete values[key];
        else values[key] = range.before[key];
      }
  }
  delete document.populationInitialization;
  const probeDocument = structuredClone(document);
  const worldLayout = (probeDocument.entities.world.components.layout ??= { values: {} });
  worldLayout.values.elementProfile = "habitable";
  // Probe normal building arrangements, independently of a previous rock-only binding.
  for (const entity of Object.values(probeDocument.entities))
    if (entity.id !== "world" && entity.components.layout) delete entity.components.layout.values.elementProfile;
  // Native resources and solid overrides retain the complete authored projection path.
  const fullProbe =
    probeDocument.authoredResources?.length ||
    Object.values(probeDocument.entities).some((entity) => entity.components.solid)
      ? generatePlanningDocument(probeDocument, undefined, [], undefined, { environment: false })
      : undefined;
  const placement = fullProbe
    ? {
        candidates: fullProbe.plan.poiDistribution!.candidates,
        groups: fullProbe.plan.spatialLayout!.groups,
        elementProfiles: fullProbe.plan.spatialLayout!.elementProfiles!
      }
    : probeSpatialPlacement(probeDocument);
  const candidates = placement.candidates;
  const eligible = placement.groups
    .filter((group) => group.volumes.length > 0 && placement.elementProfiles[group.id] === "habitable")
    .sort((a, b) => b.volumes.length - a.volumes.length || a.id.localeCompare(b.id));
  // Freeze purposes for the entire pool, including future reserve activations. These
  // are ordinary per-POI values and can subsequently be changed to add any village.
  for (const candidate of candidates) {
    const entity = (document.entities[candidate.id] ??= {
      id: candidate.id,
      name: candidate.id,
      parent: "world",
      origin: "generated",
      components: {}
    });
    const layout = (entity.components.layout ??= { base: { entity: "world", component: "layout" }, values: {} });
    layout.values.elementProfile = "outcrop";
  }
  const summarize = (result: ReturnType<typeof generatePlanningDocument>) => ({
    buildings: result.plan.buildings.length,
    villages: result.plan.spatialLayout!.groups.filter(
      (group) => result.plan.spatialLayout!.elementProfiles?.[group.id] === "habitable" && group.volumes.length > 0
    ).length
  });
  type Result = ReturnType<typeof generatePlanningDocument>;
  let previousAccepted = fullProbe?.accepted ? fullProbe : undefined;
  let evaluations = 1;
  const failures = new Set<string>();
  const solve = (draft: PlanningDocument) => {
    evaluations++;
    const result = generatePlanningDocument(draft, previousAccepted, [], undefined, { environment: false });
    if (result.accepted) previousAccepted = result;
    else for (const check of result.checks) if (check.required && check.status === "fail") failures.add(check.message);
    return result;
  };
  let chosen: PlanningDocument | undefined;
  let chosenCounts: ReturnType<typeof summarize> | undefined;
  let chosenResult: Result | undefined;
  let chosenIds: string[] = [];
  let chosenLayoutRanges: PopulationOutcome["layoutRanges"];
  const seed = exportPlanningRecipe(document).parameters.seed;
  const preferred =
    villageMin + Math.floor(settlementRandom(seed, "population:villages") * (villageMax - villageMin + 1));
  const target = Math.min(preferred, eligible.length, buildingMax);
  const attainable = Math.min(
    buildingMax,
    eligible.slice(0, target).reduce((sum, group) => sum + group.volumes.length, 0)
  );
  // Capacity ranks candidates; placement checks decide whether a site is
  // publishable. Failed placement results are never incremental baselines.
  for (const selected of populationSelections(eligible, target)) {
    if (evaluations >= INITIALIZATION_EVALUATION_BUDGET) break;
    const initial = structuredClone(document);
    for (const group of selected) initial.entities[group.id].components.layout.values.elementProfile = "habitable";
    // Reserve one accepted candidate per selected village, then distribute the
    // remaining budget according to the actual probed capacities without altering geometry.
    const capacities = selected.map((group) => group.volumes.length);
    const limits = selected.map(() => 1);
    let remaining = buildingMax - limits.length;
    for (let index = 0; index < selected.length && remaining > 0; index++) {
      const extra = Math.min(remaining, Math.max(0, capacities[index] - limits[index]));
      limits[index] += extra;
      remaining -= extra;
    }
    const layoutRanges: NonNullable<PopulationOutcome["layoutRanges"]> = {};
    let lowerRemaining = buildingMin;
    selected.forEach((group, index) => {
      const values = initial.entities[group.id].components.layout.values;
      const before = {
        ...(values.memberMin !== undefined ? { memberMin: Number(values.memberMin) } : {}),
        ...(values.memberMax !== undefined ? { memberMax: Number(values.memberMax) } : {})
      };
      const memberMax = limits[index];
      const memberMin = Math.min(memberMax, Math.max(group.rule.memberMin ?? 0, lowerRemaining));
      lowerRemaining = Math.max(0, lowerRemaining - memberMin);
      layoutRanges[group.id] = { before, applied: { memberMin, memberMax } };
      Object.assign(values, { memberMin, memberMax });
    });
    const result = solve(initial),
      counts = summarize(result);
    if (
      result.accepted &&
      counts.buildings <= buildingMax &&
      (!chosenCounts ||
        counts.villages > chosenCounts.villages ||
        (counts.villages === chosenCounts.villages && counts.buildings > chosenCounts.buildings))
    ) {
      chosen = initial;
      chosenCounts = counts;
      chosenResult = result;
      chosenIds = selected.map((group) => group.id);
      chosenLayoutRanges = layoutRanges;
    }
    if (chosenCounts && chosenCounts.villages === target && chosenCounts.buildings >= Math.min(buildingMin, attainable))
      break;
  }
  if (!chosen || !chosenCounts || !chosenResult)
    throw new Error(
      `初始化在 ${evaluations} 次有限评估内未找到满足建筑上限及完整约束的布局。` + [...failures].slice(0, 3).join("；")
    );
  if (!chosenResult.accepted)
    throw new Error(
      "初始布局未通过完整约束：" +
        chosenResult.checks
          .filter((check) => check.required && check.status === "fail")
          .map((check) => check.message)
          .join("；")
    );
  const diagnostics: string[] = [];
  if (chosenCounts.villages < villageMin)
    diagnostics.push(
      `实际生成 ${chosenCounts.villages} 个村庄，少于指导下限 ${villageMin}；建筑预算或可用占地限制了选址。`
    );
  if (chosenCounts.buildings < buildingMin)
    diagnostics.push(
      `实际生成 ${chosenCounts.buildings} 栋建筑，少于指导下限 ${buildingMin}；保留可行布局，不强制补足。`
    );
  for (const id of chosenIds) {
    const requested = eligible.find((group) => group.id === id)?.rule.memberMin ?? 0;
    const actual = chosenResult.plan.spatialLayout!.groups.find((group) => group.id === id)?.volumes.length ?? 0;
    if (actual < requested)
      diagnostics.push(
        `${id} 实际生成 ${actual} 个成员，少于原布局指导下限 ${requested}；建筑预算和可用占地优先，不强制补足。`
      );
  }
  chosen.populationInitialization = {
    version: 2,
    seed: chosenResult.plan.parameters.seed,
    ...ranges,
    ...chosenCounts,
    selectedPoiIds: chosenIds,
    layoutRanges: chosenLayoutRanges,
    diagnostics
  };
  return { document: chosen, result: chosenResult };
}

/** Initialize editable population authoring without retaining generated geometry in the document.
 * @param input Fresh inputs or a requested population replan. Not mutated.
 * @param options Overrides for the world population ranges.
 * @returns Authoring document with ordinary per-POI parameters and an initialization receipt.
 */
export function initializePlanningPopulation(
  input: PlanningDocument,
  options: PlanningPopulationOptions = {}
): PlanningDocument {
  return preparePlanningPopulation(input, options).document;
}
