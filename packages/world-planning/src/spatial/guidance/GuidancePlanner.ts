import { solidOccupancy } from "../SolidOccupancy";
import { envelope } from "../../semantic-study/IslandPlanAtoms";
import { overlap } from "../../semantic-study/WorldPlanningGeometry";
import { cachedPlanningHeightmap, planningGroundSurface } from "../../semantic-study/PlanningHeightmap";
import { planningWhiteboxes } from "../../semantic-study/PlanningWhiteboxes";
import { studyObserver } from "./GuidanceEvaluation";
import { measureVisibility } from "./VisibilityQuery";
import { PlanningSession } from "../PlanningSession";
import type { SpatialCommand } from "../SpatialDocument";
import type { IslandPlan } from "../../semantic-study/IslandPlanModel";
import { GUIDANCE_POLICY as policy, studyLinks, linkPoints, pathSample, routeCue } from "./GuidancePolicy";
import { settlementRandom } from "../../semantic-study/SettlementGeometry";
export interface GuidanceAttempt {
  purpose: string;
  status: string;
  message?: string;
  commands: SpatialCommand[];
  placementChecks?: { candidate: number; blockedBy: string[] }[];
}
/** Compile a small, bounded study into ordinary authoring transactions.
 * Existing POI positions and identities are retained. Failed candidates retain the valid snapshot.
 * This prototype proposes a slope, a cue and a roadside shoulder; it is not a visibility optimizer.
 */
export async function applyGuidanceStudy(session: PlanningSession): Promise<GuidanceAttempt[]> {
  const initial = session.result!.plan,
    links = studyLinks(initial),
    hill = links.find((l) => l.from.tier === "large");
  if (!hill) throw new Error("当前布局没有村庄与中型建筑的直接接路关系，不能执行该样本");
  const points = linkPoints(initial, hill),
    start = points[0],
    center = hill.to.center;
  const attempts: GuidanceAttempt[] = [];
  const apply = async (purpose: string, commands: SpatialCommand[]) => {
    const receipt = await session.dispatch(commands, session.document.revision);
    attempts.push({ purpose, status: receipt.status, message: receipt.message, commands });
    return receipt.status === "accepted";
  };
  const slopeId = "relief:" + hill.to.id;
  const slopeAccepted = await apply("宽缓斜坡承载房屋", [
    {
      op: "create",
      entity: {
        id: slopeId,
        name: "坡上建筑 · 地势",
        parent: hill.to.id,
        components: {
          relief: {
            values: {
              x: center.x,
              z: center.z,
              yawDegrees: (Math.atan2(center.z - start.z, center.x - start.x) * 180) / Math.PI,
              ...policy.slope
            }
          }
        }
      }
    }
  ]);
  if (!slopeAccepted) return attempts;
  const cue = routeCue(initial, points),
    tree = initial.landscapes?.find((p) => p.poiId === cue?.id && p.role === "poi");
  if (tree)
    await apply("保留小型POI身份，强化途中高树线索", [
      { op: "set", entity: tree.id, component: "solid", values: { height: policy.cueHeightM } }
    ]);
  const sign = settlementRandom(initial.parameters.seed, hill.id + ":shoulder-side") > 0.5 ? 1 : -1;
  // Candidate placement uses road-relative geometry and policy, never seed-specific coordinates.
  for (let i = 0; i < Math.min(policy.shoulder.candidateBudget, policy.shoulder.fractions.length); i++) {
    const current = session.result!.plan,
      path = linkPoints(current, hill);
    const road = current.routes.find((r) => r.id === hill.routeId)!;
    const checks: { candidate: number; blockedBy: string[] }[] = [];
    let placement: { x: number; z: number; yawDegrees: number } | undefined;
    for (const [candidate, settings] of policy.shoulder.placementCandidates.entries()) {
      const sample = pathSample(path, policy.shoulder.fractions[i] + settings.fractionOffset);
      const offset =
        road.width / 2 + policy.shoulder.roadClearanceM + policy.shoulder.depthM / 2 + settings.extraClearanceM;
      const x = sample.point.x - sample.direction.z * offset * sign * settings.side,
        z = sample.point.z + sample.direction.x * offset * sign * settings.side,
        yaw = Math.atan2(sample.direction.z, sample.direction.x);
      const outline = envelope({ x, z }, policy.shoulder.widthM, policy.shoulder.depthM, yaw);
      const occupancy = solidOccupancy(current, outline);
      const blockedBy = [
        ...(!occupancy.inside ? ["land-boundary"] : []),
        ...occupancy.blockers.map((b) => b.id),
        ...current.routes.flatMap((r) =>
          !r.outline ? ["missing-road-footprint:" + r.id] : overlap(r.outline, outline) ? [r.id] : []
        ),
        ...(current.landscapes ?? [])
          .filter((p) => (p.role === "poi" || p.locked) && overlap(p.outline, outline))
          .map((p) => p.id)
      ];
      checks.push({ candidate, blockedBy });
      if (!blockedBy.length) {
        placement = { x, z, yawDegrees: (yaw * 180) / Math.PI };
        break;
      }
    }
    if (!placement) {
      attempts.push({
        purpose: "沿路侧向岩体",
        status: "unavailable",
        message: "有限候选均有占地冲突，保留已有布局",
        commands: [],
        placementChecks: checks
      });
      continue;
    }
    const { x, z, yawDegrees } = placement;
    await apply("沿路侧向岩体：限制横穿、保留前进开口", [
      {
        op: "create",
        entity: {
          id: "guidance:" + hill.to.id + ":" + i,
          name: "沿路岩肩 " + (i + 1),
          parent: "world",
          components: {
            appearance: { values: { kind: "rock" } },
            solid: {
              values: {
                x,
                z,
                width: policy.shoulder.widthM,
                depth: policy.shoulder.depthM,
                height: policy.shoulder.heightsM[i],
                yawDegrees
              }
            }
          }
        }
      }
    ]);
    attempts[attempts.length - 1].placementChecks = checks;
  }
  // One bounded opening proposal uses measured occluders; authored objects and POI bodies are protected.
  const plan = session.result!.plan,
    link = studyLinks(plan).find((l) => l.id === hill.id)!;
  const ground = (cachedPlanningHeightmap(plan) ?? planningGroundSurface(plan)).sample,
    solids = planningWhiteboxes(plan, ground).flatMap((p) => p.boxes.map((box) => ({ ownerId: p.id, box })));
  const visibility = measureVisibility(
    studyObserver(plan, link, policy.opening.fraction),
    solids,
    new Set(link.targetIds),
    ground
  );
  if (visibility.projectedSamples >= policy.opening.minimumProjectionSamples) {
    const candidates = Object.entries(visibility.blockers)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .filter(
        ([id]) =>
          plan.landscapes?.some((p) => p.id === id && p.role !== "poi" && !p.locked) && !session.document.entities[id]
      )
      .slice(0, policy.opening.maxAmbientRemovals);
    if (candidates.length)
      await apply(
        "目的地显露开口：仅移除实测遮挡的普通景观",
        candidates.map(([id]) => ({ op: "remove" as const, entity: id }))
      );
  }
  return attempts;
}
/** Record all changed physical objects, including indirect changes; do not conceal regeneration. */
export function geometryDifference(before: IslandPlan, after: IslandPlan) {
  const entries = (p: IslandPlan) =>
    new Map([...p.buildings, ...p.rocks, ...p.routes, ...(p.landscapes ?? [])].map((e) => [e.id, JSON.stringify(e)]));
  const a = entries(before),
    b = entries(after);
  return {
    changed: [...b.keys()].filter((id) => a.has(id) && a.get(id) !== b.get(id)),
    added: [...b.keys()].filter((id) => !a.has(id)),
    removed: [...a.keys()].filter((id) => !b.has(id))
  };
}
