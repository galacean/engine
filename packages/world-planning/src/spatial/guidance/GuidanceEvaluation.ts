import { poiMemberIds } from "../../semantic-study/PoiContents";
import type { IslandPlan } from "../../semantic-study/IslandPlanModel";
import { planningWhiteboxes } from "../../semantic-study/PlanningWhiteboxes";
import { cachedPlanningHeightmap, planningGroundSurface } from "../../semantic-study/PlanningHeightmap";
import { PlanningWalk } from "../../semantic-study/PlanningWalk";
import { GUIDANCE_POLICY as policy, linkPoints, pathSample, routeCue, type StudyLink } from "./GuidancePolicy";
import { measureVisibility, type Observer } from "./VisibilityQuery";
/** Build a fixed forward-looking eye camera, independent of target location. */
export function studyObserver(plan: IslandPlan, link: StudyLink, fraction: number): Observer {
  const ground = (cachedPlanningHeightmap(plan) ?? planningGroundSurface(plan)).sample,
    { point, direction } = pathSample(linkPoints(plan, link), fraction);
  return {
    position: { ...point, y: ground(point) + policy.observer.eyeHeightM },
    forward: { ...direction, y: 0 },
    ...policy.observer
  };
}
/** Measure actual post-generation geometry along a route, and physically walk its interior.
 * CPU viewport samples are estimates; passing does not demonstrate player cognition or beauty.
 */
export function evaluateStudyLink(plan: IslandPlan, link: StudyLink) {
  const ground = (cachedPlanningHeightmap(plan) ?? planningGroundSurface(plan)).sample,
    path = linkPoints(plan, link);
  const solids = planningWhiteboxes(plan, ground).flatMap((p) => p.boxes.map((box) => ({ ownerId: p.id, box })));
  const cue = routeCue(plan, path),
    cueIds = new Set(cue ? poiMemberIds(plan, cue) : []);
  const samples = policy.sampleFractions.map((fraction) => ({
    fraction,
    observer: studyObserver(plan, link, fraction),
    ...measureVisibility(studyObserver(plan, link, fraction), solids, new Set(link.targetIds), ground),
    cue: cue
      ? { poiId: cue.id, ...measureVisibility(studyObserver(plan, link, fraction), solids, cueIds, ground) }
      : null
  }));
  const length = path.slice(1).reduce((n, p, i) => n + Math.hypot(p.x - path[i].x, p.z - path[i].z), 0),
    walker = new PlanningWalk(plan, ground);
  // Door endpoints lie on walls. Audit the walkable interior, report the tested limits explicitly.
  const inset = Math.min(0.08, 3 / length),
    start = pathSample(path, inset).point,
    endFraction = 1 - inset;
  let reached = walker.resetOnGround(start),
    maximumSlopeDegrees = 0,
    reachedFraction = inset;
  const stepCount = Math.ceil(length / 2),
    maxFrames = Math.ceil((length / walker.metrics.walk) * 60 * 1.8);
  let frames = 0;
  if (reached)
    for (let i = Math.ceil(inset * stepCount); i <= Math.floor(endFraction * stepCount); i++) {
      const fraction = i / stepCount,
        target = pathSample(path, fraction).point,
        prev = pathSample(path, Math.max(inset, (i - 1) / stepCount)).point;
      maximumSlopeDegrees = Math.max(
        maximumSlopeDegrees,
        (Math.atan2(Math.abs(ground(target) - ground(prev)), Math.hypot(target.x - prev.x, target.z - prev.z)) * 180) /
          Math.PI
      );
      let stationary = 0;
      while (Math.hypot(walker.position.x - target.x, walker.position.z - target.z) > 0.3 && frames++ < maxFrames) {
        const dx = target.x - walker.position.x,
          dz = target.z - walker.position.z,
          d = Math.hypot(dx, dz);
        walker.advance(1 / 60, dx / d, dz / d, false, false);
        stationary = walker.speed < 0.01 ? stationary + 1 : 0;
        if (stationary > 60) break;
      }
      if (stationary > 60 || frames >= maxFrames) {
        reached = false;
        break;
      }
      reachedFraction = fraction;
    }
  return {
    linkId: link.id,
    targetIds: link.targetIds,
    samples,
    lengthM: length,
    maximumSlopeDegrees,
    walk: { reached, testedFraction: [inset, endFraction], reachedFraction, ...walker.report() },
    cameraNote: "沿路朝向、固定眼高的观察相机；第三人称漫游另行人工检查"
  };
}
