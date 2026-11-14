import { planningRegistry } from "@galacean/engine-world-planning/spatial/PlanningComponents";
import { upgradePlanningDocument, type PlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { planningSeed, switchPlanningLayoutScope } from "@galacean/engine-world-planning/spatial/PlanningLayoutScope";
import { applySpatialCommands } from "@galacean/engine-world-planning/spatial/SpatialDocument";

/** Parse project authoring data without reading or writing browser storage. */
export function parsePlanningDocument(raw: string, seed: number): PlanningDocument {
  const parsed = JSON.parse(raw) as PlanningDocument;
  // Project compatibility is checked once at the project boundary; invalid inner data must not partially reset it.
  if (parsed?.version !== 1 || !parsed.entities?.world || !parsed.passthrough) throw new Error("本地工程格式无效");
  let document = upgradePlanningDocument(parsed);
  const previousSeed = planningSeed(document);
  document = applySpatialCommands(
    document,
    [{ op: "set", entity: "world", component: "world", values: { seed } }],
    planningRegistry
  ) as PlanningDocument;
  document.revision = parsed.revision;
  switchPlanningLayoutScope(document, previousSeed);
  applySpatialCommands(document, [], planningRegistry);
  return document;
}

export function planningSeedURL(href: string, seed: number): string {
  const url = new URL(href);
  const debug = url.searchParams.get("debug") === "1";
  const template = url.searchParams.get("template");
  url.search = "";
  url.hash = "";
  url.searchParams.set("seed", String(seed));
  if (debug) url.searchParams.set("debug", "1");
  if (template !== null) url.searchParams.set("template", template);
  return url.href;
}
