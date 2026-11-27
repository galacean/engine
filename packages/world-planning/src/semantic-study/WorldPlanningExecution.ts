import type { IslandPlan } from "./IslandPlanModel";
import type { WorldLayoutContext, WorldLayoutModule } from "./WorldLayoutPlanner";
/** A proposal is an isolated snapshot. The coordinator, not a module, accepts it. */
export interface ModuleProposal {
  plan: IslandPlan;
  notes: string[];
  frame: WorldLayoutContext["frame"];
  reservations: WorldLayoutContext["reservations"];
  reused: boolean;
}
const cache = new Map<WorldLayoutModule, { signature: string; proposal: ModuleProposal }[]>();
const keys: Record<string, string[]> = {
  lookout: ["roadWidth"],
  domain: [
    "landAspect",
    "landOrientation",
    "offshoreCoverage",
    "complexity",
    "contourDetail",
    "landSize",
    "stretch",
    "coast",
    "islands"
  ],
  water: ["complexity", "contourDetail", "rivers", "branches", "riverWidth", "riverBend", "lakeSize"],
  places: ["complexity", "contourDetail", "villages", "villageSize", "buildings", "roadWidth"],
  landforms: ["complexity", "contourDetail", "mountains", "mountainWidth", "mountainHeight", "openness", "roadWidth"],
  open: ["openness", "mountains", "mountainWidth", "riverWidth"],
  routes: [
    "crossingDetourRatio",
    "roadContourDetail",
    "roadWidth",
    "roadWidthVariation",
    "loopiness",
    "climb",
    "visibility",
    "climbTargets"
  ]
};
const owns = (module: string, id: string) =>
  module === "domain"
    ? id === "land-main" || id.startsWith("offshore-")
    : module === "water"
      ? id.startsWith("river-") || id.startsWith("lake-") || id.startsWith("valley-")
      : module === "lookout"
        ? id.startsWith("teleport-")
        : module === "places"
          ? id.startsWith("village-")
          : module === "landforms"
            ? id.startsWith("mountain-") || id.startsWith("valley-")
            : id === "routes" || id === "visual";
/** Propose a module update without mutating the accepted upstream snapshot.
 * @param module Registered owner implementation.
 * @param source Immutable-by-contract upstream facts and current intent.
 * @returns Transaction-local data; unaffected stages may reuse an identical proposal.
 */
export function proposePlanningModule(module: WorldLayoutModule, source: WorldLayoutContext): ModuleProposal {
  const parameters = Object.fromEntries(
    ["seed", ...(keys[module.id] ?? Object.keys(source.parameters))].map((k) => [
      k,
      (source.parameters as unknown as Record<string, unknown>)[k]
    ])
  );
  const edits = Object.fromEntries(Object.entries(source.edits).filter(([id]) => owns(module.id, id)));
  const placement = Object.fromEntries(
    Object.entries(source.edits)
      .filter(
        ([id, e]) =>
          e.placement &&
          (module.id === "lookout" || !id.startsWith("teleport-")) &&
          (module.id !== "domain" || owns("domain", id))
      )
      .map(([id, e]) => [id, { placement: e.placement, size: e.size }])
  );
  const signature = JSON.stringify({
    parameters,
    edits,
    placement,
    plan: source.plan,
    frame: source.frame,
    reservations: source.reservations
  });
  const entries = cache.get(module) ?? [],
    old = entries.find((e) => e.signature === signature);
  if (old) return { ...structuredClone(old.proposal), reused: true };
  const candidate: WorldLayoutContext = {
    ...source,
    plan: structuredClone(source.plan),
    notes: [...source.notes],
    frame: { ...source.frame },
    reservations: structuredClone(source.reservations),
    position: (x, z) => ({
      x:
        (candidate.frame.center?.x ?? 1024) + x * Math.cos(candidate.frame.angle) - z * Math.sin(candidate.frame.angle),
      z: (candidate.frame.center?.z ?? 1024) + x * Math.sin(candidate.frame.angle) + z * Math.cos(candidate.frame.angle)
    })
  };
  module.run(candidate);
  const proposal: ModuleProposal = {
    plan: candidate.plan,
    notes: candidate.notes,
    frame: candidate.frame,
    reservations: candidate.reservations,
    reused: false
  };
  entries.unshift({ signature, proposal: structuredClone(proposal) });
  cache.set(module, entries.slice(0, 3));
  return proposal;
}
/** Invalidate the owner's cached proposals for a bounded conflict-directed revision.
 * @param moduleId Owner whose constraints changed.
 */
export function invalidatePlanningModule(moduleId: string): void {
  for (const module of cache.keys()) if (module.id === moduleId) cache.delete(module);
}
