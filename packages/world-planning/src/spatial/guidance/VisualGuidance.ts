import { FootprintBoundsIndex, footprintBoundsLookup } from "../layout/FootprintLookup";
import { roadGuidanceZones, type RoadGuidanceZone } from "./RoadGuidanceCues";
import policy from "../../planning-data/visual-guidance.json";
import type { IslandPlan, PlanPoint, PlanRock, PlanLandscape } from "../../semantic-study/IslandPlanModel";
import type { PlanningCheck } from "../../semantic-study/WorldPlanningContract";
import { envelope, routeIntersectsRock } from "../../semantic-study/IslandPlanAtoms";
import { settlementRandom } from "../../semantic-study/SettlementGeometry";
import { overlap, polygonBounds, boundsOverlap } from "../../semantic-study/WorldPlanningGeometry";
import { createPlanningGroundSampler, createPlanningRingQuery } from "../../semantic-study/WorldPlanningTerrain";
import { planningWhiteboxes } from "../../semantic-study/PlanningWhiteboxes";
import { treeWhiteboxes } from "../../semantic-study/TreeWhitebox";
import { pathSample } from "./GuidancePolicy";
import { guidanceRockBox } from "./GuidanceRock";
import {
  prepareGuidanceEcology,
  refreshGuidanceEcologyModule,
  restoreGuidanceEcology,
  type GuidanceEcologyExclusion
} from "./GuidanceEcology";
import { rayBox } from "./VisibilityQuery";
import type { V2Box } from "../V2Model.ts";

/** Independent intent on any sampled path. Strength is a generation goal, never a measured pixel ratio. */
export interface VisualGuidanceIntent {
  policy?: import("./WayfindingPolicy").WayfindingPolicy;
  fromPoi?: string;
  toPoi?: string;
  id: string;
  points: PlanPoint[];
  strength: number;
}
export interface GuidanceMemberEdit {
  kind?: string;
  suppressed?: boolean;
  x?: number;
  z?: number;
  width?: number;
  depth?: number;
  height?: number;
  yawDegrees?: number;
}
export interface VisualGuidanceResult {
  collisionPolicyVersion?: number;
  sourceId: string;
  fromPoi?: string;
  toPoi?: string;
  points: PlanPoint[];
  strength: number;
  keypoints?: RoadGuidanceZone[];
  requestedRouteCoverage?: number;
  plannedRouteCoverage?: number;
  requestedMassDimensions?: GuidanceDimensions;
  memberIds: string[];
  /** Placement trace. Enclosure is absent until explicitly measured; absence never means zero occlusion. */
  samples: { fraction: number; before?: number; after?: number; addedIds: string[] }[];
  /** Generation trace; partial and cold solves can encounter different blockers. */
  rejectedCandidates: number;
  /** Generation trace: first blocking hard constraint per rejected candidate, in validation order. */
  rejectionReasons: Partial<Record<GuidanceRejectionReason, number>>;
  /** Requested seeded envelope versus the geometry actually published after bounded fitting. */
  placements: { id: string; requested: GuidanceDimensions; actual: GuidanceDimensions; scale: number }[];
  ecologyExclusions: GuidanceEcologyExclusion[];
}
type GuidanceRejectionReason = "land" | "occupied" | "protected-area" | "slope" | "collision" | "journey" | "road";
interface GuidanceDimensions {
  width: number;
  depth: number;
  height: number;
}
export const VISUAL_GUIDANCE_POLICY = policy;
/** Invalidate derived supplements when bounded fitting behavior changes. */
export const GUIDANCE_GENERATION_VERSION = 7;
/** Remove derived supplements before evaluating the art-directed baseline. No input array is mutated. */
export function withoutVisualGuidance(plan: IslandPlan): IslandPlan {
  if (!plan.visualGuidance?.length) return plan;
  const ids = new Set(plan.visualGuidance.flatMap((g) => g.memberIds));
  const restored = {
    ...plan,
    rocks: plan.rocks.filter((p) => !ids.has(p.id)),
    landscapes: restoreGuidanceEcology(
      plan.landscapes?.filter((p) => !ids.has(p.id)),
      plan.visualGuidance.flatMap((g) => g.ecologyExclusions ?? [])
    ),
    visualGuidance: undefined
  };
  if (plan.visualGuidance.some((g) => g.ecologyExclusions?.length)) {
    if (restored.planning) restored.planning = { ...restored.planning };
    refreshGuidanceEcologyModule(restored);
  }
  return restored;
}
/** Fast generation-time horizon estimate. Includes existing geometry AND terrain, both directions.
 * It is deliberately distinct from the director's actual camera/GPU measurement.
 */
function enclosure(point: PlanPoint, direction: PlanPoint, boxes: V2Box[], ground: (p: PlanPoint) => number): number {
  const q = policy.probe,
    origin = { ...point, y: ground(point) + q.eyeHeightM };
  const nearby = boxes.filter(
    (b) => Math.hypot(b.center.x - point.x, b.center.z - point.z) <= q.distanceM + Math.hypot(b.sizeX, b.sizeZ) / 2
  );
  let count = 0;
  for (const reverse of [0, Math.PI])
    for (let i = 0; i < q.rays; i++) {
      const a =
        Math.atan2(direction.z, direction.x) + reverse + ((i / (q.rays - 1) - 0.5) * q.fanDegrees * Math.PI) / 180;
      const pitch = (q.elevationDegrees * Math.PI) / 180,
        d = { x: Math.cos(a) * Math.cos(pitch), z: Math.sin(a) * Math.cos(pitch), y: Math.sin(pitch) };
      let hit = nearby.some((b) => rayBox(origin, d, b) < q.distanceM);
      for (let t = q.terrainStepM; !hit && t <= q.distanceM; t += q.terrainStepM)
        hit = origin.y + d.y * t < ground({ x: point.x + d.x * t, z: point.z + d.z * t });
      if (hit) count++;
    }
  return count / (q.rays * 2);
}

/** Explicitly measure published guidance without running placement or changing geometry.
 * @param plan Complete planning population before visibility and instance overrides.
 * @param ecologyOrder Source positions in the complete pre-guidance ecological population.
 * @remarks Candidate rejection statistics remain the original generation trace. Measurements
 * compare the final world with and without each relation, rather than an intermediate solve state.
 */
export function refreshVisualGuidanceDiagnostics(plan: IslandPlan, ecologyOrder: ReadonlyMap<string, number>): void {
  if (!plan.visualGuidance?.length) return;
  const ground = createPlanningGroundSampler(plan);
  // Instance removals are a display override; the planning report always measures its fixed base.
  const population = {
    ...plan,
    authoredResources: plan.authoredResources?.filter((resource) => resource.resourceType !== "object-removal")
  };
  const parts = planningWhiteboxes(population, ground).filter((part) => part.layer !== "tree");
  const allBoxes = parts.flatMap((part) => part.boxes).filter((box) => box.occlusion);
  plan.visualGuidance = plan.visualGuidance.map((report) => {
    const members = new Set(report.memberIds);
    const baselineBoxes = parts
      .filter((part) => !members.has(part.id))
      .flatMap((part) => part.boxes)
      .filter((box) => box.occlusion);
    return {
      ...report,
      samples: report.samples.map((sample) => {
        const { point, direction } = pathSample(report.points, sample.fraction);
        return {
          ...sample,
          before: enclosure(point, direction, baselineBoxes, ground),
          after: enclosure(point, direction, allBoxes, ground)
        };
      }),
      ecologyExclusions: report.ecologyExclusions
        .map((item) => ({ ...item, originalIndex: ecologyOrder.get(item.element.id) ?? item.originalIndex }))
        .sort((a, b) => a.originalIndex - b.originalIndex)
    };
  });
}

/** Add bounded, deterministic supplements after baseline ecology, before publication checks.
 * Road guidance takes priority over unedited ambient scenery; authored content and hard geometry stay protected.
 * No global solver retry or runtime fitting.
 */
export function planVisualGuidance(
  plan: IslandPlan,
  intents: VisualGuidanceIntent[],
  edits: Record<string, GuidanceMemberEdit> = {},
  protectedEcologyIds: ReadonlySet<string> = new Set()
): PlanningCheck[] {
  if (!intents.length) {
    plan.visualGuidance = undefined;
    return [];
  }
  const ground = createPlanningGroundSampler(plan),
    checks: PlanningCheck[] = [],
    reports: VisualGuidanceResult[] = [];
  const ecology = prepareGuidanceEcology(plan, protectedEcologyIds);
  // Default roadside placement always yields ambient trees. Do not materialize
  // their 3D boxes merely to discard them again in every collision query.
  const parts = planningWhiteboxes(
    intents.every((intent) => intent.policy)
      ? {
          ...plan,
          landscapes: plan.landscapes?.filter((item) => !ecology.canYield(item.id))
        }
      : plan,
    ground
  );
  const boxOwners = new Map(parts.flatMap((part) => part.boxes.map((box) => [box, part.id] as const)));
  const boxes = parts.flatMap((p) => p.boxes).filter((b) => b.occlusion);
  // Raised canopies affect GPU visibility, but do not provide ground-level channel walls.
  const enclosingBoxes = parts
    .filter((p) => p.layer !== "tree")
    .flatMap((p) => p.boxes)
    .filter((b) => b.occlusion);
  // Transaction-owned bounds avoid rebuilding hundreds of polygons for every candidate.
  // Broad phase only rejects disjoint objects; exact footprint predicates still decide acceptance.
  const footprint = (outline: PlanPoint[]) => ({ outline, bounds: polygonBounds(outline) });
  const lands = [plan.land, ...plan.islands].map(createPlanningRingQuery);
  const occupied = [...plan.rocks, ...plan.buildings, ...plan.waters, ...(plan.plazas ?? [])].map((p) => ({
    ...footprint(p.outline),
    groupId: "groupId" in p ? p.groupId : undefined
  }));
  const protectedAreas: (ReturnType<typeof footprint> & { ownerId?: string; densityField?: boolean })[] = [
    ...(plan.planning?.reservations.filter((area) => area.kind === "activity").map((area) => footprint(area.outline)) ??
      []),
    ...plan.regions.filter((r) => r.kind === "village").map((r) => footprint(r.outline)),
    ...(plan.landscapes ?? []).map((p) => ({ ...footprint(p.outline), ownerId: p.id })),
    ...(plan.flowerRegions ?? []).flatMap((f) =>
      f.outlines.map((outline) => ({ ...footprint(outline), densityField: true }))
    )
  ];
  const collisionBoxes = boxes
    .filter((b) => b.collision)
    .map((box) => ({ box, ...footprint(envelope(box.center, box.sizeX, box.sizeZ, box.yaw)) }));
  // Final road geometry is immutable here. Broad-phase path bounds remove
  // distant journeys before exact OBB tests; rotated inflation needs sqrt(2).
  // Published journeys already use the wider, complete pavement test below.
  // Only standalone intents need an extra centerline exclusion; otherwise a
  // local subset would report different blockers from a full regeneration.
  const publishedIds = new Set(plan.routes.map((route) => route.id));
  const journeysAt = footprintBoundsLookup(
    intents.filter((intent) => !publishedIds.has(intent.id)),
    (link) => link.points
  );
  const roadCorridors = plan.routes.map((route) => ({
    route,
    clearance: (route.maxWidth ?? Math.max(route.width, ...(route.widths ?? []))) / 2 + policy.roadClearanceM
  }));
  const roadsAt = footprintBoundsLookup(roadCorridors, (item) => item.route.points);
  const maxRoadClearance = Math.max(0, ...roadCorridors.map((item) => item.clearance));
  const occupiedAt = new FootprintBoundsIndex(occupied, (item) => item.outline);
  const protectedAt = new FootprintBoundsIndex(protectedAreas, (item) => item.outline);
  const collisionAt = new FootprintBoundsIndex(collisionBoxes, (item) => item.outline);
  for (const intent of [...intents].sort((a, b) => a.id.localeCompare(b.id))) {
    // Each generated rock is independent; a shared road never exempts sibling collisions.
    const endpointClearance = intent.policy ? Math.min(6, intent.policy.spacingM / 2) : policy.endpointClearanceM;
    if (!Number.isFinite(intent.strength) || intent.strength > 1 || intent.strength < 0 || intent.points.length < 2)
      throw Error("视觉引导意图无效");
    const spacing = intent.policy?.spacingM ?? policy.sampleSpacingM;
    const length = intent.points
      .slice(1)
      .reduce((n, p, i) => n + Math.hypot(p.x - intent.points[i].x, p.z - intent.points[i].z), 0);
    const report: VisualGuidanceResult = {
      sourceId: intent.id,
      collisionPolicyVersion: GUIDANCE_GENERATION_VERSION,
      fromPoi: intent.fromPoi,
      toPoi: intent.toPoi,
      points: intent.points,
      strength: intent.strength,
      memberIds: [],
      samples: [],
      rejectedCandidates: 0,
      rejectionReasons: {},
      placements: [],
      ecologyExclusions: []
    };
    if (intent.strength === 0) {
      if (intent.fromPoi) reports.push(report);
      continue;
    }
    const count = Math.min(policy.maxSamplesPerPath, Math.floor((length - 2 * endpointClearance) / spacing) + 1);
    const zones = intent.policy ? roadGuidanceZones(intent.points, intent.policy) : undefined;
    if (zones) {
      report.keypoints = zones.zones;
      report.requestedRouteCoverage = zones.requestedFraction;
      report.plannedRouteCoverage = zones.plannedFraction;
      report.requestedMassDimensions = {
        width: intent.policy!.massWidthM,
        depth: intent.policy!.massDepthM,
        height: intent.policy!.massHeightM
      };
    }
    const slots = zones
      ? zones.zones.flatMap((cue) => {
          // Reserve longitudinal room for seeded footprints. The shared occupancy test still validates yaw and clearance.
          const span = cue.endM - cue.startM;
          const width = Math.min(intent.policy!.massWidthM, span / 1.15);
          const half = Math.max(0, (span - width * 1.15) / 2);
          const steps = half > 0 ? Math.max(1, Math.ceil(half / spacing)) : 0;
          return Array.from({ length: steps * 2 + 1 }, (_, i) => ({
            id: cue.id + ":" + i,
            distance: cue.distance + (steps ? ((i - steps) * half) / steps : 0),
            width,
            span
          }));
        })
      : Array.from({ length: Math.max(0, count) }, (_, i) => ({
          id: String(i),
          distance: endpointClearance + i * spacing,
          width: undefined,
          span: undefined
        }));
    for (const slot of slots) {
      const fraction = slot.distance / length;
      const { point, direction } = pathSample(intent.points, fraction);
      // Authored road zones already determine the desired rhythm. CPU horizon
      // probes cannot improve their placement and belong to explicit analysis.
      const before = intent.policy ? undefined : enclosure(point, direction, enclosingBoxes, ground);
      const sample: VisualGuidanceResult["samples"][number] = {
        fraction,
        ...(before === undefined ? {} : { before, after: before }),
        addedIds: []
      };
      report.samples.push(sample);
      // Fixed slots and per-slot random streams preserve identity when other slots fail or are edited.
      for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
        const id = `guide:${intent.id}:${slot.id}:${sideIndex}`,
          edit = edits[id];
        if (edit?.suppressed) continue;
        const random = (key: string) => settlementRandom(plan.parameters.seed, id + ":" + key);
        if (!edit && !intent.policy && sample.after! >= intent.strength * policy.probe.maxEnclosure) continue;
        if (!edit && random("activation") > intent.strength) continue;
        const pick = random("recipe") * policy.recipes.reduce((n, r) => n + r.weight, 0);
        let weight = 0;
        const recipe =
          (edit?.kind ? policy.recipes.find((r) => r.kind === edit.kind) : undefined) ??
          policy.recipes.find((r) => (weight += r.weight) > pick) ??
          policy.recipes[0];
        const range = (a: number[], key: string) => a[0] + (a[1] - a[0]) * random(key);
        const requestedWidth =
            edit?.width ??
            (intent.policy
              ? (slot.width ?? intent.policy.massWidthM) * (0.85 + 0.3 * random("width"))
              : range(recipe.widthM, "width")),
          requestedDepth =
            edit?.depth ??
            (intent.policy ? intent.policy.massDepthM * (0.85 + 0.3 * random("depth")) : range(recipe.depthM, "depth"));
        const requestedHeight =
          edit?.height ??
          (intent.policy
            ? intent.policy.massHeightM * (0.85 + 0.3 * random("height"))
            : Math.min(
                range(recipe.heightM, "height"),
                recipe.kind === "rock" ? requestedDepth * policy.rockShape.maxGeneratedHeightToDepth : Infinity
              ));
        // Retry smaller broad envelopes only after exhausting all full-size placements.
        // Authored edits keep exact dimensions; fitting cannot silently change their contract.
        const minimumScale = Math.min(
          1,
          Math.max(
            recipe.widthM[0] / requestedWidth,
            recipe.depthM[0] / requestedDepth,
            Math.min(...policy.fitting.scales)
          )
        );
        const scales =
          intent.policy && !edit
            ? [...new Set(policy.fitting.scales.map((scale) => Math.max(scale, minimumScale)))]
            : [1];
        let placed = false;
        // Road-zone slots already cover the longitudinal span. Try each lateral
        // shoulder once, then leave a gap instead of relocating along the road.
        const attempts = edit ? 1 : intent.policy ? policy.sideOffsetsM.length : policy.attemptsPerSample;
        for (let candidate = 0; candidate < attempts * scales.length; candidate++) {
          const attempt = candidate % attempts,
            scale = scales[Math.floor(candidate / attempts)];
          const width = requestedWidth * scale,
            depth = requestedDepth * scale;
          const height = requestedHeight * scale;
          // Opposite banks with staggered shoulders, following the actual path tangent.
          // Slowly varying openings form widening/narrowing spaces rather than independent scatter.
          const side = sideIndex ? 1 : -1;
          const corridor = policy.corridor;
          const shared = (key: string) =>
            settlementRandom(plan.parameters.seed, intent.id + ":bank:" + sideIndex + ":" + key);
          const waveLength =
            corridor.variationLengthM[0] +
            shared("length") * (corridor.variationLengthM[1] - corridor.variationLengthM[0]);
          const opening = intent.policy
            ? intent.policy.corridorWidthM * (0.45 + 0.1 * random("opening"))
            : corridor.halfWidthM[0] +
              (corridor.halfWidthM[1] - corridor.halfWidthM[0]) *
                (0.5 +
                  0.5 * Math.cos(((fraction * length) / waveLength) * Math.PI * 2 + shared("phase") * Math.PI * 2));
          const turn = ((random("yaw") - 0.5) * corridor.yawVariationDegrees * Math.PI) / 180;
          const yaw =
            edit?.yawDegrees !== undefined
              ? (edit.yawDegrees * Math.PI) / 180
              : Math.atan2(direction.z, direction.x) + turn;
          const angle = yaw - Math.atan2(direction.z, direction.x);
          const transverseHalfExtent = (Math.abs(Math.sin(angle)) * width + Math.abs(Math.cos(angle)) * depth) / 2;
          const offset = opening + policy.sideOffsetsM[attempt % policy.sideOffsetsM.length] + transverseHalfExtent;
          const along = intent.policy
            ? 0
            : side * spacing * 0.25 + (random("along:" + attempt) - 0.5) * corridor.alongJitterM;
          const center = {
            x: edit?.x ?? point.x - direction.z * offset * side + direction.x * along,
            z: edit?.z ?? point.z + direction.x * offset * side + direction.z * along
          };
          const outline = envelope(center, width, depth, yaw);
          const bounds = polygonBounds(outline);
          const intersects = (p: ReturnType<typeof footprint>) =>
            boundsOverlap(bounds, p.bounds) && overlap(p.outline, outline);
          const neighbors = {
            x0: bounds.minX - 1e-7,
            x1: bounds.maxX + 1e-7,
            z0: bounds.minZ - 1e-7,
            z1: bounds.maxZ + 1e-7
          };
          // Reject impossible footprints before any height/grade samples. The
          // same exact predicates retain their original rejection precedence.
          const footprintRejection: GuidanceRejectionReason | undefined =
            recipe.kind !== "rock" && !lands.some((land) => land.containsPolygon(outline))
              ? "land"
              : occupiedAt.query(neighbors).some((p) => intersects(p))
                ? "occupied"
                : protectedAt
                      .query(neighbors)
                      .some((p) => !(intent.policy && (p.densityField || ecology.canYield(p.ownerId))) && intersects(p))
                  ? "protected-area"
                  : undefined;
          if (footprintRejection) {
            report.rejectedCandidates++;
            report.rejectionReasons[footprintRejection] = (report.rejectionReasons[footprintRejection] ?? 0) + 1;
            continue;
          }
          const baseHeight = ground(center);
          const solid: PlanRock = {
            id,
            groupId: intent.id,
            center,
            width,
            depth,
            height,
            yaw,
            baseHeight,
            outline,
            obb: outline,
            role: "wall"
          };
          const slope =
            (Math.atan(
              Math.max(
                ...outline.map(
                  (p) => Math.abs(ground(p) - baseHeight) / Math.max(0.1, Math.hypot(p.x - center.x, p.z - center.z))
                )
              )
            ) *
              180) /
            Math.PI;
          const inflated = (clearance: number) => {
            const pad = clearance * Math.SQRT2 + 1e-7;
            return { x0: bounds.minX - pad, x1: bounds.maxX + pad, z0: bounds.minZ - pad, z1: bounds.maxZ + pad };
          };
          const intersectsPath = (points: PlanPoint[], clearance: number) => {
            const b = inflated(clearance);
            for (let i = 1; i < points.length; i++) {
              const a = points[i - 1],
                p = points[i];
              if (
                Math.max(a.x, p.x) < b.x0 ||
                Math.min(a.x, p.x) > b.x1 ||
                Math.max(a.z, p.z) < b.z0 ||
                Math.min(a.z, p.z) > b.z1
              )
                continue;
              if (routeIntersectsRock(a, p, solid, clearance)) return true;
            }
            return false;
          };
          const rejection: GuidanceRejectionReason | undefined =
            slope > policy.maxSlopeDegrees
              ? "slope"
              : // Hidden ambient trunks yield with their canopy footprints below.
                collisionAt
                    .query(neighbors)
                    .some((p) => !(intent.policy && ecology.canYield(boxOwners.get(p.box))) && intersects(p))
                ? "collision"
                : journeysAt(inflated(policy.roadClearanceM)).some((link) =>
                      intersectsPath(link.points, policy.roadClearanceM)
                    )
                  ? "journey"
                  : roadsAt(inflated(maxRoadClearance)).some((item) =>
                        intersectsPath(item.route.points, item.clearance)
                      )
                    ? "road"
                    : undefined;
          if (rejection) {
            report.rejectedCandidates++;
            report.rejectionReasons[rejection] = (report.rejectionReasons[rejection] ?? 0) + 1;
            // A collision rejects this candidate, not the remaining offsets or
            // smaller envelopes. All attempts remain inside the configured budget.
            continue;
          }
          if (intent.policy) {
            const exclusions = ecology.exclude(outline);
            report.ecologyExclusions.push(...exclusions);
            const removed = new Set(exclusions.map((item) => item.element.id));
            for (let i = protectedAreas.length - 1; i >= 0; i--)
              if (removed.has(protectedAreas[i].ownerId!)) {
                protectedAt.remove(protectedAreas[i]);
                protectedAreas.splice(i, 1);
              }
            for (let i = collisionBoxes.length - 1; i >= 0; i--)
              if (removed.has(boxOwners.get(collisionBoxes[i].box)!)) {
                collisionAt.remove(collisionBoxes[i]);
                collisionBoxes.splice(i, 1);
              }
            for (const list of [boxes, enclosingBoxes])
              for (let i = list.length - 1; i >= 0; i--) if (removed.has(boxOwners.get(list[i])!)) list.splice(i, 1);
          }
          let volumes: V2Box[];
          if (recipe.kind === "tree") {
            const tree: PlanLandscape = {
              ...solid,
              baseHeight,
              ownerId: intent.id,
              sourceId: id,
              kind: "tree",
              role: "ambient",
              locked: true,
              treeShape: recipe.treeShape,
              collisionRadius: Math.hypot(width, depth) / 2
            };
            (plan.landscapes ??= []).push(tree);
            const protectedFootprint = footprint(outline);
            protectedAreas.push(protectedFootprint);
            protectedAt.add(protectedFootprint);
            volumes = treeWhiteboxes(tree, baseHeight);
          } else {
            volumes = [guidanceRockBox(solid, ground)];
            solid.boxes = volumes;
            plan.rocks.push(solid);
            const occupiedFootprint = { ...footprint(outline), groupId: solid.groupId };
            occupied.push(occupiedFootprint);
            occupiedAt.add(occupiedFootprint);
          }
          boxes.push(...volumes);
          const newCollisionBoxes = volumes
            .filter((b) => b.collision)
            .map((box) => ({ box, ...footprint(envelope(box.center, box.sizeX, box.sizeZ, box.yaw)) }));
          collisionBoxes.push(...newCollisionBoxes);
          for (const item of newCollisionBoxes) collisionAt.add(item);
          if (recipe.kind !== "tree") enclosingBoxes.push(...volumes);
          report.memberIds.push(id);
          report.placements.push({
            id,
            requested: { width: requestedWidth, depth: requestedDepth, height: requestedHeight },
            actual: { width, depth, height },
            scale
          });
          sample.addedIds.push(id);
          placed = true;
          if (!intent.policy) sample.after = enclosure(point, direction, enclosingBoxes, ground);
          break;
        }
        if (edit && !placed)
          checks.push({
            id: "guidance-edit:" + id,
            rule: "visual-guidance-occupancy",
            owners: [intent.id, id],
            status: "fail",
            required: true,
            message: "沿途补充元素的局部编辑违反陆域、坡度、道路净空或已有占地约束"
          });
      }
    }
    reports.push(report);
    checks.push(guidanceBudgetCheck(report));
  }
  plan.visualGuidance = reports.length ? reports : undefined;
  if (reports.some((report) => report.ecologyExclusions.length)) refreshGuidanceEcologyModule(plan);
  return checks;
}

/** Build the same published diagnostics for regenerated and retained guidance. */
export function guidanceBudgetCheck(report: VisualGuidanceResult): PlanningCheck {
  return {
    id: "guidance:" + report.sourceId,
    rule: "visual-guidance-budget",
    owners: [report.sourceId, ...report.memberIds],
    status: "pass",
    required: false,
    message: `沿路错落体量 ${report.memberIds.length} 处，其中 ${report.placements.filter((p) => p.scale < 1).length} 处按可用空间缩减尺寸，${report.ecologyExclusions.length} 处自动景观按实际足迹让位；${report.rejectedCandidates} 个候选因空间约束跳过。强度是生成输入；${report.samples.some((sample) => sample.before !== undefined) ? "围合度仅为CPU视线估计" : "未执行视线围合度测量"}，非GPU占屏达标。`,
    measured: report.memberIds.length
  };
}
