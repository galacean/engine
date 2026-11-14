import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import { planningWhiteboxes } from "@galacean/engine-world-planning/semantic-study/PlanningWhiteboxes";
import type { SeedWorldPopulationPreview } from "@galacean/engine-world-planning/runtime/SeedWorldPopulationPlan";
import { rayBox, type Point3 } from "@galacean/engine-world-planning/spatial/guidance/VisibilityQuery";
import { subjectVolumes, subjectViewFitDistance } from "@galacean/engine-world-planning/spatial/PlanningSubjectView";
import { PLANNING_REFERENCE } from "@galacean/engine-world-planning/planning-data/PlanningReference";
import { bridgeGround } from "@galacean/engine-world-planning/spatial/hydrology/RiverCrossings";
import { distanceToBox } from "@galacean/engine-world-planning/geometry/V2Geometry";
import { createPlanningWaterQuery } from "@galacean/engine-world-planning/spatial/runtime/PlanningWaterQueries";

const CATEGORIES = ["building", "tree", "water", "vegetation", "rock"] as const;
type Category = (typeof CATEGORIES)[number];

export interface PlanningSpawnView {
  readonly eye: Point3;
  readonly target: Point3;
  readonly subjectId?: string;
  /** A fitted view is distinct from the legacy anchor fallback when no candidate is feasible. */
  readonly framing: "fitted" | "fallback";
  /** CPU viewport samples over published OBBs and surfaces, not rendered pixel coverage. */
  readonly coverage: Readonly<Record<Category, number>>;
  readonly missing: readonly Category[];
}

export interface PlanningSpawnViewOptions {
  readonly aspect: number;
  readonly verticalFovDegrees: number;
  readonly eyeHeight: number;
  readonly farClip: number;
  readonly desertComposition?: boolean;
  /** Viewport sampling precision only; it does not impose an aesthetic acceptance threshold. */
  readonly rows?: number;
}

/** The published spawn is a village anchor, not a wall-side camera constraint. Fit actual
 * building envelopes at grounded, dry, clear standing positions. Prefer unobscured subjects,
 * then the least represented scenery categories, then proximity to the village anchor.
 * Trees/rocks use the existing conservative OBBs; fine foliage and grass use ground coverage.
 */
export function selectPlanningSpawnView(
  plan: IslandPlan,
  ground: (x: number, z: number) => number | undefined,
  population: Pick<SeedWorldPopulationPreview, "detailDensityFields">,
  options: PlanningSpawnViewOptions
): PlanningSpawnView {
  const { aspect, verticalFovDegrees, eyeHeight, farClip, desertComposition } = options;
  const rows = options.rows ?? 16;
  if (
    ![aspect, verticalFovDegrees, eyeHeight, farClip].every((value) => Number.isFinite(value) && value > 0) ||
    verticalFovDegrees >= 180 ||
    !Number.isInteger(rows) ||
    rows < 1
  )
    throw new Error("Invalid spawn view parameters");
  const support = bridgeGround(plan, (point) => ground(point.x, point.z) ?? NaN);
  const floor = support(plan.spawn);
  if (floor === undefined || !Number.isFinite(floor)) throw new Error("Spawn terrain is unavailable");
  const anchorEye = { ...plan.spawn, y: floor + eyeHeight };
  const parts = planningWhiteboxes(plan, (point) => ground(point.x, point.z) ?? -Infinity);
  const solids = parts.flatMap((part) =>
    part.boxes
      .filter((box) => box.occlusion)
      .map((box) => ({
        box,
        ownerId: part.id,
        category: (part.layer === "building"
          ? "building"
          : part.layer === "tree"
            ? "tree"
            : part.layer === "rock" || part.layer === "landscape-rock"
              ? "rock"
              : undefined) as Category | undefined
      }))
  );
  const visibleBuildings = new Set(parts.filter((part) => part.layer === "building").map((part) => part.id));
  const village = plan.spatialLayout?.groups.find((group) =>
    group.ports.some((port) => port.position.x === plan.spawn.x && port.position.z === plan.spawn.z)
  );
  const buildings = subjectVolumes(plan)
    .filter((building) => building.kind === "building")
    .filter((building) => visibleBuildings.has(building.id));
  // Worlds without buildings frame their native POI rock volumes using the same clearance search.
  const subjects = buildings.length ? buildings : subjectVolumes(plan).filter((volume) => volume.kind === "rock");
  const local = subjects.filter(
    (subject) => (subject.kind === "building" ? subject.regionId : subject.groupId) === village?.id
  );
  const candidates = (local.length ? local : subjects).slice().sort((a, b) => a.id.localeCompare(b.id));
  const waterAt = createPlanningWaterQuery(plan, (point) => ground(point.x, point.z) ?? -Infinity);
  const step = plan.raster.spacing;
  if (!(step > 0) || !Number.isFinite(step)) throw new Error("Spawn view needs the published terrain spacing");
  const columns = Math.ceil(rows * aspect),
    total = columns * rows;
  const tangent = Math.tan((verticalFovDegrees * Math.PI) / 360);
  const { radiusM, heightM } = PLANNING_REFERENCE.actor;
  const grade = PLANNING_REFERENCE.traversal.maxSlope;
  // Same eight radial footprint probes as navigation's water/support checks.
  const directions = Array.from({ length: 8 }, (_, i) => ({
    x: Math.cos((i * Math.PI) / 4),
    z: Math.sin((i * Math.PI) / 4)
  }));
  const collisionBoxes = parts
    .filter((part) => part.layer !== "bridge")
    .flatMap((part) => part.boxes.filter((box) => box.collision));
  const standingHeight = (x: number, z: number): number | undefined => {
    if (x < radiusM || z < radiusM || x > plan.parameters.width - radiusM || z > plan.parameters.depth - radiusM)
      return;
    const y = support({ x, z });
    if (!Number.isFinite(y)) return;
    for (const offset of [{ x: 0, z: 0 }, ...directions]) {
      const px = x + offset.x * radiusM,
        pz = z + offset.z * radiusM;
      const height = support({ x: px, z: pz }),
        water = waterAt(px, pz);
      if (
        !Number.isFinite(height) ||
        Math.abs(height - y) > grade * radiusM ||
        (water.water && height <= water.surfaceElevationMetres!)
      )
        return;
    }
    if (
      collisionBoxes.some(
        (box) =>
          (box.elevation ?? 0) < y + heightM &&
          (box.elevation ?? 0) + box.sizeY > y &&
          distanceToBox(box, x, z) < radiusM
      )
    )
      return;
    return y;
  };
  const standingEye = (x: number, z: number): Point3 | undefined => {
    const y = standingHeight(x, z);
    if (y === undefined) return;
    // A clear body footprint alone can be trapped. Require one body-diameter exit,
    // checked at half-radius intervals against the same support and obstacle geometry.
    const canExit = directions.some((direction) => {
      let previous = y;
      for (let i = 1; i <= 4; i++) {
        const next = standingHeight(x + (direction.x * radiusM * i) / 2, z + (direction.z * radiusM * i) / 2);
        if (next === undefined || Math.abs(next - previous) > (grade * radiusM) / 2) return false;
        previous = next;
      }
      return true;
    });
    return canExit ? { x, y: y + eyeHeight, z } : undefined;
  };
  const empty = (): Record<Category, number> => ({ building: 0, tree: 0, water: 0, vegetation: 0, rock: 0 });
  const plantFields = population.detailDensityFields.filter((field) => field.maximumDensityPerSquareMetre > 0);
  const vegetationAt = (x: number, z: number): number => {
    let density = 0;
    for (const field of plantFields) {
      const u = Math.round((x / plan.parameters.width) * (field.resolution - 1));
      const v = Math.round((z / plan.parameters.depth) * (field.resolution - 1));
      if (u >= 0 && v >= 0 && u < field.resolution && v < field.resolution)
        density = Math.max(density, field.samples[v * field.resolution + u] / 255);
    }
    return density;
  };
  const normalized = (point: Point3): Point3 => {
    const length = Math.hypot(point.x, point.y, point.z);
    return { x: point.x / length, y: point.y / length, z: point.z / length };
  };
  const measure = (eye: Point3, target: Point3, subjectId?: string) => {
    const coverage = empty();
    const foregroundRocks = [0, 0];
    let openNearGround = 0;
    let distantTerrain = 0;
    let projected = 0,
      visible = 0;
    const subject = solids.filter((solid) => solid.ownerId === subjectId);
    const f = normalized({ x: target.x - eye.x, y: target.y - eye.y, z: target.z - eye.z });
    const right = normalized({ x: -f.z, y: 0, z: f.x });
    const up = { x: -right.z * f.y, y: right.z * f.x - right.x * f.z, z: right.x * f.y };
    for (let row = 0; row < rows; row++)
      for (let column = 0; column < columns; column++) {
        const u = ((2 * (column + 0.5)) / columns - 1) * tangent * aspect;
        const v = (1 - (2 * (row + 0.5)) / rows) * tangent;
        const direction = normalized({
          x: f.x + right.x * u + up.x * v,
          y: f.y + up.y * v,
          z: f.z + right.z * u + up.z * v
        });
        if (subject.some((solid) => rayBox(eye, direction, solid.box) < farClip)) projected++;
        let distance = farClip,
          category: Category | undefined,
          ownerId: string | undefined;
        for (const solid of solids) {
          const hit = rayBox(eye, direction, solid.box);
          if (hit < distance) {
            distance = hit;
            category = solid.category;
            ownerId = solid.ownerId;
          }
        }
        let density = 1;
        // One canonical terrain-cell step, including the final interval before a solid.
        const count = Math.ceil(distance / step);
        for (let index = 1; index <= count; index++) {
          const t = Math.min(index * step, distance);
          const x = eye.x + direction.x * t,
            z = eye.z + direction.z * t;
          if (x < 0 || z < 0 || x > plan.parameters.width || z > plan.parameters.depth) break;
          const y = eye.y + direction.y * t,
            terrain = ground(x, z);
          if (terrain === undefined) break;
          const water = waterAt(x, z);
          if (water.water && y <= water.surfaceElevationMetres!) {
            category = "water";
            break;
          }
          if (y <= terrain) {
            density = vegetationAt(x, z);
            category = density > 0 ? "vegetation" : undefined;
            if (desertComposition && t >= 3 && t <= 42) openNearGround++;
            if (desertComposition && t >= 170 && t <= 450 && terrain > eye.y + 8) distantTerrain++;
            break;
          }
        }
        if (desertComposition && category === "rock" && distance <= 85) {
          if (u < -0.23 * tangent * aspect) {
            foregroundRocks[0]++;
          }
          if (u > 0.23 * tangent * aspect) {
            foregroundRocks[1]++;
          }
        }
        if (category) coverage[category] += density / total;
        if (ownerId === subjectId) visible++;
      }
    return {
      coverage,
      visibility: projected ? visible / projected : 0,
      foregroundRocks,
      distantTerrain,
      openNearGround
    };
  };
  let best: PlanningSpawnView | undefined,
    bestRank: number[] = [];
  const framingCandidates = desertComposition
    ? candidates
        .slice()
        .sort(
          (a, b) =>
            Math.hypot(a.center.x - plan.spawn.x, a.center.z - plan.spawn.z) -
            Math.hypot(b.center.x - plan.spawn.x, b.center.z - plan.spawn.z)
        )
        .slice(0, 7)
    : candidates;
  for (const building of framingCandidates) {
    const base = building.baseHeight ?? ground(building.center.x, building.center.z);
    if (base === undefined || !Number.isFinite(base)) continue;
    const target = { ...building.center, y: base + building.height / 2 };
    const radius = Math.hypot(building.width, building.depth, building.height) / 2;
    const distance = subjectViewFitDistance(radius, verticalFovDegrees, aspect);
    if (!(radius > 0) || distance + radius > farClip) continue;
    const consider = (eye: Point3) => {
      const depth = Math.hypot(target.x - eye.x, target.y - eye.y, target.z - eye.z);
      if (depth < distance || depth + radius > farClip || (eye.x === target.x && eye.z === target.z)) return false;
      const { coverage, visibility, foregroundRocks, distantTerrain, openNearGround } = measure(
        eye,
        target,
        building.id
      );
      if (!visibility) return false;
      const rank = [
        ...(desertComposition
          ? [
              (Math.min(...foregroundRocks, total * 0.06) / total) * 3 +
                (Math.min(openNearGround, total * 0.24) / total) * 2 -
                (Math.max(0, Math.max(...foregroundRocks) - total * 0.22) / total) * 2 +
                Math.min(foregroundRocks[0] + foregroundRocks[1], total * 0.2) / total +
                Math.min(distantTerrain, total * 0.08) / total +
                Math.min(coverage.vegetation, 0.17)
            ]
          : []),
        visibility,
        ...CATEGORIES.map((category) => coverage[category]).sort((a, b) => a - b),
        -Math.hypot(eye.x - plan.spawn.x, eye.z - plan.spawn.z)
      ];
      const firstDifference = rank.findIndex((value, index) => value !== bestRank[index]);
      if (!best || (firstDifference >= 0 && rank[firstDifference] > bestRank[firstDifference])) {
        bestRank = rank;
        best = {
          eye,
          target,
          subjectId: building.id,
          framing: "fitted",
          coverage,
          missing: CATEGORIES.filter((category) => coverage[category] === 0)
        };
      }
      return true;
    };
    const anchor = standingEye(plan.spawn.x, plan.spawn.z);
    if (anchor && Math.hypot(anchor.x - target.x, anchor.y - target.y, anchor.z - target.z) >= distance) {
      consider(anchor);
      if (!desertComposition) continue;
    }
    // Angular resolution follows the fitted subject diameter, as in selectSubjectView.
    // The first bearing preserves the entrance-facing direction; no Seed coordinates.
    const bearing = Math.atan2(plan.spawn.x - target.x, plan.spawn.z - target.z);
    const angles = desertComposition ? 6 : Math.ceil(Math.PI / Math.atan(radius / distance));
    for (let index = 0; index < angles; index++) {
      const angle = bearing + (index * 2 * Math.PI) / angles;
      const eye = standingEye(target.x + Math.sin(angle) * distance, target.z + Math.cos(angle) * distance);
      if (eye) consider(eye);
    }
  }
  if (best) return best;
  // A building-free/fully occluded world keeps a deterministic inward direction and reports the gap.
  const center = { x: plan.parameters.width / 2, z: plan.parameters.depth / 2 };
  const target = { x: center.x, y: anchorEye.y, z: center.z };
  if (target.x === anchorEye.x && target.z === anchorEye.z) target.z -= step;
  const { coverage } = measure(anchorEye, target);
  return {
    eye: anchorEye,
    target,
    framing: "fallback",
    coverage,
    missing: CATEGORIES.filter((category) => coverage[category] === 0)
  };
}
