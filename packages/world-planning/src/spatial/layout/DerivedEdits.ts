import { boxGroundBottom } from "./VolumeTerrain";
import type { IslandPlan, PlanPoint } from "../../semantic-study/IslandPlanModel";
import { envelope } from "../../semantic-study/IslandPlanAtoms";
import type { VolumeEdit } from "./LayoutKernel";

/** Apply explicit instance dimensions after population sampling. The candidate ID remains stable. */
export function applyLandscapeEdits(
  plan: IslandPlan,
  edits: Record<string, VolumeEdit>,
  ground: (p: PlanPoint) => number
): void {
  for (let i = 0; i < (plan.landscapes?.length ?? 0); i++) {
    const prior = plan.landscapes![i];
    const edit = edits[prior.id];
    if (!edit || !Object.keys(edit).length) continue;
    // Candidate fields and accepted snapshots can share an unedited element.
    // Instance overrides must never write back into either cache.
    const element = { ...prior };
    plan.landscapes![i] = element;
    element.center = { x: edit.x ?? element.center.x, z: edit.z ?? element.center.z };
    const priorWidth = element.width,
      priorDepth = element.depth;
    element.width = edit.width ?? element.width;
    element.depth = edit.depth ?? element.depth;
    element.height = edit.height ?? element.height;
    if (edit.yawDegrees !== undefined) element.yaw = (edit.yawDegrees * Math.PI) / 180;
    element.outline = envelope(element.center, element.width, element.depth, element.yaw);
    const scale = Math.max(element.width / priorWidth, element.depth / priorDepth);
    element.collisionRadius *= scale;
    if (element.canopyRadius !== undefined) element.canopyRadius *= scale;
    element.baseHeight = boxGroundBottom(
      element.kind === "tree"
        ? { ...element, width: element.collisionRadius * 2, depth: element.collisionRadius * 2 }
        : element,
      ground
    );
  }
}
/** Compare published spatial outputs, including removals. UI and automation share this receipt. */
export function changedSpatialOutputs(before: IslandPlan | undefined, after: IslandPlan): string[] {
  const collect = (p: IslandPlan | undefined) =>
    new Map(
      (p
        ? [
            ...(p.spatialLayout?.groups.flatMap((g) => g.volumes) ?? []),
            ...(p.poiDistribution?.sites ?? []),
            ...p.routes,
            ...p.waters,
            ...p.bridges,
            ...p.rocks,
            ...(p.landscapes ?? []),
            ...(p.flowerRegions ?? [])
          ]
        : []
      ).map((v) => [v.id, v])
    );
  const previous = collect(before),
    next = collect(after);
  const changed = [...new Set([...previous.keys(), ...next.keys()])].filter((id) => {
    const a = previous.get(id),
      b = next.get(id);
    return a !== b && JSON.stringify(a) !== JSON.stringify(b);
  });
  if (JSON.stringify(before?.naturalVegetation) !== JSON.stringify(after.naturalVegetation)) changed.push("world");
  if (JSON.stringify(before?.farming) !== JSON.stringify(after.farming)) changed.push(after.farming?.poiId ?? "world");
  return changed;
}
