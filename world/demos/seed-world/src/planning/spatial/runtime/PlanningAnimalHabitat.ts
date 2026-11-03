import type { AnimalRoutePoint, AnimalRouteQuery, AnimalRouteObstacle } from "@galacean/engine-animals/gameplay/animal/AnimalStaticRoute";
import type { AnimalTaskProfile } from "@galacean/engine-animals/gameplay/animal/AnimalTaskController";
import { PlanningAnimalSurface, type PlanningAnimalSurfaceData } from "./PlanningAnimalSurface.ts";
import type { AnimalPopulationPosition, AnimalPopulationDistribution } from "@galacean/engine-animals/gameplay/animal/AnimalPopulation";
import type { IslandPlan, PlanPoint } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import { planningWhiteboxes } from "@galacean/engine-world-planning/semantic-study/PlanningWhiteboxes";

export type PlanningAnimalMedium = "ground" | "air" | "water";

/** Existing navigation support, including bridge decks and water contacts. */
export interface PlanningAnimalNavigation {
  /** Exact-coordinate reuse is scoped to one synchronous simulation update, never across world publications. */
  beginAnimalUpdate?(): void;
  endAnimalUpdate?(): void;
  sampleHeightInterpolated(x: number, z: number): number | undefined;
  sampleContactIsWater(x: number, z: number): boolean;
  sampleWaterHeight?(x: number, z: number): number | undefined;
  /** Optional combined sample avoids querying the same real water/support twice per footprint point. */
  sampleAnimalSupport?(x: number, z: number, out: { height: number | undefined; waterHeight: number | undefined }): void;
}

/** An occupied ground footprint during deterministic population placement. */
export interface PlanningAnimalOccupant {
  x: number;
  z: number;
  radius: number;
}

/** Axis-aligned broad-phase bounds in world metres. */
export interface PlanningAnimalBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface Solid extends PlanningAnimalBounds {
  id: number;
  x: number;
  z: number;
  cos: number;
  sin: number;
  halfX: number;
  halfZ: number;
  bottom: number;
  top: number;
  seen: number;
}

/** Fixed horizontal range in world metres, centered on the published player spawn. */
export interface PlanningAnimalRange {
  distribution?: AnimalPopulationDistribution;
  spawnRadius: number;
  roamRadius: number;
}

/**
 * Whole-map (or legacy circular) habitat with authoritative navigation and compiled solid geometry.
 * Player movement only affects presentation admission; it never moves this habitat.
 */
export class PlanningAnimalHabitat {
  readonly origin: Readonly<PlanPoint>;
  readonly surface: PlanningAnimalSurface;
  private readonly solids = new SpatialBins<Solid>();
  private solidCount = 0;
  private readonly range: Readonly<PlanningAnimalRange>;
  private waterCandidates?: PlanPoint[];
  private shoreCandidates?: PlanPoint[];
  private readonly waterRegions: { area: number; bounds?: PlanningAnimalBounds;
    a?: PlanPoint; b?: PlanPoint; halfWidth?: number; nx?: number; nz?: number }[] = [];
  private waterArea = 0;
  private readonly banks: { a: PlanPoint; b: PlanPoint; end: number }[] = [];
  private bankLength = 0;
  private readonly support = { height: undefined as number | undefined, waterHeight: undefined as number | undefined };

  /** Compile collision geometry once; circular range checks require no spatial ownership lookup. */
  constructor(
    plan: IslandPlan,
    private readonly navigation: PlanningAnimalNavigation,
    range: PlanningAnimalRange,
    surface?: PlanningAnimalSurfaceData
  ) {
    this.origin = { x: plan.spawn.x, z: plan.spawn.z };
    this.surface = new PlanningAnimalSurface(plan.parameters.width, surface);
    this.range = { ...range, ...(range.distribution ? { distribution: { ...range.distribution } } : {}) };
    // Small published water outlines guide proposals; the live water contact query remains authoritative.
    // No full-map raster scan, navmesh build or per-frame indexing is needed.
    for (const water of plan.waters) {
      if (!water.outline.length) continue;
      const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
      water.outline.forEach((a, i) => {
        bounds.minX = Math.min(bounds.minX, a.x); bounds.maxX = Math.max(bounds.maxX, a.x);
        bounds.minZ = Math.min(bounds.minZ, a.z); bounds.maxZ = Math.max(bounds.maxZ, a.z);
        const b = water.outline[(i + 1) % water.outline.length];
        this.bankLength += Math.hypot(b.x - a.x, b.z - a.z);
        this.banks.push({ a, b, end: this.bankLength });
      });
      if (water.centerline && water.widths?.length === water.centerline.length) {
        for (let i = 1; i < water.centerline.length; i++) {
          const a = water.centerline[i - 1], b = water.centerline[i];
          const length = Math.hypot(b.x - a.x, b.z - a.z);
          const halfWidth = Math.min(water.widths[i - 1], water.widths[i]) / 2;
          if (!(length > 0 && halfWidth > 0)) continue;
          const area = length * halfWidth * 2;
          this.waterArea += area;
          this.waterRegions.push({ a, b, halfWidth, nx: -(b.z - a.z) / length, nz: (b.x - a.x) / length, area });
        }
      } else {
        const area = (bounds.maxX - bounds.minX) * (bounds.maxZ - bounds.minZ);
        if (area > 0) { this.waterArea += area; this.waterRegions.push({ bounds, area }); }
      }
    }
    const ground = (p: PlanPoint) => navigation.sampleHeightInterpolated(p.x, p.z) ?? 0;
    for (const part of planningWhiteboxes(plan, ground)) {
      // Decks and approaches are navigation support; treating their thickness as an obstacle blocks sloped decks.
      if (part.layer === "bridge") continue;
      for (const box of part.boxes) {
        if (!box.collision) continue;
        const cos = Math.cos(box.yaw),
          sin = Math.sin(box.yaw);
        const halfX = box.sizeX / 2,
          halfZ = box.sizeZ / 2;
        const extentX = Math.abs(cos) * halfX + Math.abs(sin) * halfZ;
        const extentZ = Math.abs(sin) * halfX + Math.abs(cos) * halfZ;
        const bottom = box.elevation ?? ground(box.center);
        const solid: Solid = {
          id: this.solidCount++,
          x: box.center.x,
          z: box.center.z,
          cos,
          sin,
          halfX,
          halfZ,
          bottom,
          top: bottom + box.sizeY,
          seen: 0,
          minX: box.center.x - extentX,
          maxX: box.center.x + extentX,
          minZ: box.center.z - extentZ,
          maxZ: box.center.z + extentZ
        };
        this.solids.add(solid);
      }
    }
  }

  /** Published convex map extent; independent of terrain samples and observer position. */
  get flightBounds() {
    return this.range.distribution ?? { x: this.origin.x, z: this.origin.z, radius: this.range.roamRadius };
  }

  /**
   * Ground one deterministic candidate inside the fixed spawn circle.
   * The entire footprint must fit; existing occupants are never moved to make room.
   */
  samplePosition(
    point: PlanPoint,
    radius: number,
    occupied: readonly PlanningAnimalOccupant[],
    bodyHeightM = radius * 2,
    medium: PlanningAnimalMedium = "ground"
  ): AnimalPopulationPosition | undefined {
    if (!validShape(radius, bodyHeightM)) return;
    for (const other of occupied)
      if ((other.x - point.x) ** 2 + (other.z - point.z) ** 2 < (other.radius + radius) ** 2) return;
    if (!this.traverse(point, point, radius, bodyHeightM, this.range.spawnRadius, medium)) return;
    return { x: point.x, y: this.heightAt(point.x, point.z, medium, bodyHeightM)!, z: point.z };
  }

  /**
   * Check a complete movement segment against the fixed habitat and finite support.
   * Air uses cruise support elevation; actual ascending/descending steps use canTraverseAir.
   * @param from Current world position.
   * @param to Candidate world position.
   * @param radius Ground collision radius in metres.
   * @param bodyHeightM Actual model height in metres; defaults to a diameter when unavailable.
   * @returns Whether the movement satisfies the requested medium support and collision rules.
   */
  canTraverse(from: PlanPoint, to: PlanPoint, radius: number, bodyHeightM = radius * 2, medium: PlanningAnimalMedium = "ground"): boolean {
    return this.traverse(from, to, radius, bodyHeightM, this.range.roamRadius, medium);
  }

  /** Existing contact test keeps authored water and bridge decks authoritative for feeding. */
  navigationWater(x: number, z: number): boolean {
    if (this.navigation.sampleAnimalSupport) {
      this.navigation.sampleAnimalSupport(x, z, this.support);
      return this.support.waterHeight !== undefined;
    }
    return this.navigation.sampleContactIsWater(x, z);
  }

  /** Published navigation includes real water heights; flight clearance is measured above that surface. */
  heightAt(x: number, z: number, medium: PlanningAnimalMedium = "ground", height = 1): number | undefined {
    if (medium === "ground") return this.navigation.sampleHeightInterpolated(x, z);
    if (this.navigation.sampleAnimalSupport) {
      this.navigation.sampleAnimalSupport(x, z, this.support);
      const { height: y, waterHeight } = this.support;
      if (medium === "water") return waterHeight;
      return y === undefined ? undefined : medium === "air" ? Math.max(y, waterHeight ?? y) + Math.max(4, height * 2) : y;
    }
    if (medium === "water") return this.navigation.sampleWaterHeight?.(x, z);
    const y = this.navigation.sampleHeightInterpolated(x, z);
    return y === undefined ? undefined : medium === "air"
      ? Math.max(y, this.navigation.sampleWaterHeight?.(x, z) ?? y) + Math.max(4, height * 2) : y;
  }

  /**
   * Capture static route queries for one body and medium.
   * @param radius Horizontal body footprint in metres.
   * @param height Body height in metres.
   * @param medium Movement support domain.
   * @param bottom Lowest flight elevation; omitted considers solids at all elevations.
   * @param top Highest flight body top; omitted considers solids at all elevations.
   * @returns Bounded line queries and stable obstacle bypass candidates.
   */
  staticRouteQuery(radius: number, height: number, medium: PlanningAnimalMedium,
    bottom = -Infinity, top = Infinity): AnimalRouteQuery {
    const valid = (a: AnimalRoutePoint, b: AnimalRoutePoint, clearance = 0) => medium === "air"
      ? this.containsFlight(a, radius) && this.containsFlight(b, radius) && !this.firstSolid(a, b, radius + clearance, bottom, top)
      : this.canTraverse({ x: a[0], z: a[1] }, { x: b[0], z: b[1] }, radius, height, medium) &&
        (!clearance || !this.firstSolid(a, b, radius + clearance, -Infinity, Infinity));
    return {
      canTraverse: valid,
      obstruction: (a, b, clearance): AnimalRouteObstacle | undefined => {
        // Ground routes follow varying terrain. A conservative solid set only
        // proposes candidates; every connection still checks actual support.
        const box = this.firstSolid(a, b, radius + clearance, medium === "air" ? bottom : -Infinity, medium === "air" ? top : Infinity);
        if (!box) return;
        const x = box.halfX + radius + clearance + 0.05, z = box.halfZ + radius + clearance + 0.05;
        return { key: box.id, corners: [[-x, -z], [x, -z], [x, z], [-x, z]].map(([lx, lz]) =>
          [box.x + lx * box.cos - lz * box.sin, box.z + lx * box.sin + lz * box.cos] as const) };
      }
    };
  }

  /**
   * Check an actual three-dimensional flight step, including descent and terrain.
   * @param from Root position at the beginning of the step.
   * @param to Proposed root position at the end of the step.
   * @param radius Horizontal body footprint in metres.
   * @param height Body height in metres.
   * @returns Whether the swept body stays inside the map and outside terrain and static solids.
   */
  canTraverseAir(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number },
    radius: number, height: number): boolean {
    if (!validShape(radius, height) || ![from.x, from.y, from.z, to.x, to.y, to.z].every(Number.isFinite)) return false;
    const a: AnimalRoutePoint = [from.x, from.z], b: AnimalRoutePoint = [to.x, to.z];
    if (!this.containsFlight(a, radius) || !this.containsFlight(b, radius) ||
        this.firstSolid(a, b, radius, Math.min(from.y, to.y), Math.max(from.y, to.y) + height)) return false;
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.5));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, x = from.x + (to.x - from.x) * t, z = from.z + (to.z - from.z) * t;
      const ground = this.navigation.sampleHeightInterpolated(x, z);
      if (ground === undefined || !Number.isFinite(ground) || ground > from.y + (to.y - from.y) * t + 1e-4) return false;
    }
    return true;
  }

  private containsFlight(point: AnimalRoutePoint, radius: number): boolean {
    const area = this.range.distribution;
    return area ? point[0] - radius >= area.minX && point[0] + radius <= area.maxX &&
      point[1] - radius >= area.minZ && point[1] + radius <= area.maxZ :
      Math.hypot(point[0] - this.origin.x, point[1] - this.origin.z) + radius <= this.range.roamRadius;
  }

  private firstSolid(a: AnimalRoutePoint, b: AnimalRoutePoint, radius: number, bottom: number, top: number): Solid | undefined {
    const bounds = { minX: Math.min(a[0], b[0]) - radius, maxX: Math.max(a[0], b[0]) + radius,
      minZ: Math.min(a[1], b[1]) - radius, maxZ: Math.max(a[1], b[1]) + radius };
    let nearest: Solid | undefined, fraction = Infinity;
    this.solids.some(bounds, box => {
      if (box.top <= bottom + 1e-4 || box.bottom >= top - 1e-4) return false;
      const ax = (a[0] - box.x) * box.cos + (a[1] - box.z) * box.sin;
      const az = -(a[0] - box.x) * box.sin + (a[1] - box.z) * box.cos;
      const bx = (b[0] - box.x) * box.cos + (b[1] - box.z) * box.sin;
      const bz = -(b[0] - box.x) * box.sin + (b[1] - box.z) * box.cos;
      const entry = segmentBoxEntry(ax, az, bx, bz, box.halfX + radius, box.halfZ + radius);
      if (entry < fraction) { fraction = entry; nearest = box; }
      return false;
    });
    return nearest;
  }

  /** World-space flight proposal, independent of player spawn. Final landing support is checked by the caller. */
  flightCandidate(medium: "ground" | "water", random: () => number): PlanPoint | undefined {
    const area = this.range.distribution;
    const point = area
      ? { x: area.minX + random() * (area.maxX - area.minX), z: area.minZ + random() * (area.maxZ - area.minZ) }
      : (() => {
          const angle = random() * Math.PI * 2, distance = Math.sqrt(random()) * this.range.roamRadius;
          return { x: this.origin.x + Math.sin(angle) * distance, z: this.origin.z + Math.cos(angle) * distance };
        })();
    return medium === "water" ? this.spawnCandidate(point, "water", false, random) : point;
  }

  /** Birth-only proximity proposal. Water/bank candidates retain their geometry and are rejected
   * outside the preferred disk; ground/air sample the disk uniformly. Final support/collision
   * validation is shared with whole-map births. Caller bounds attempts before global fallback.
   */
  spawnPointCandidate(point: PlanPoint, medium: PlanningAnimalMedium, shore: boolean, radius: number, random: () => number): PlanPoint | undefined {
    if (medium === "water" || shore) {
      const candidate = this.spawnCandidate(point, medium, shore, random);
      return candidate && (candidate.x - this.origin.x) ** 2 + (candidate.z - this.origin.z) ** 2 <= radius * radius ? candidate : undefined;
    }
    const angle = random() * Math.PI * 2, distance = radius * Math.sqrt(random());
    return { x: this.origin.x + Math.cos(angle) * distance, z: this.origin.z + Math.sin(angle) * distance };
  }

  /** Lazily index water/banks once per publication, never in the simulation loop. */
  spawnCandidate(point: PlanPoint, medium: PlanningAnimalMedium, shore: boolean, random: () => number): PlanPoint | undefined {
    if (this.range.distribution) {
      if (medium === "water" && this.waterArea) {
        let pick = random() * this.waterArea;
        const region = this.waterRegions.find(r => (pick -= r.area) < 0) ?? this.waterRegions[this.waterRegions.length - 1];
        const b = region.bounds;
        if (b) return { x: b.minX + random() * (b.maxX - b.minX), z: b.minZ + random() * (b.maxZ - b.minZ) };
        const t = random(), offset = (random() * 2 - 1) * region.halfWidth!;
        return { x: region.a!.x + (region.b!.x - region.a!.x) * t + region.nx! * offset,
          z: region.a!.z + (region.b!.z - region.a!.z) * t + region.nz! * offset };
      }
      if (shore && this.bankLength) {
        const pick = random() * this.bankLength;
        const edge = this.banks.find(e => pick < e.end)!;
        const t = random(), angle = random() * Math.PI * 2, offset = 2 + random() * 6;
        return { x: edge.a.x + (edge.b.x - edge.a.x) * t + Math.cos(angle) * offset,
          z: edge.a.z + (edge.b.z - edge.a.z) * t + Math.sin(angle) * offset };
      }
      return point;
    }
    if (medium !== "water" && !shore) return point;
    if (!this.waterCandidates) {
      this.waterCandidates = [];
      this.shoreCandidates = [];
      const r = this.range.spawnRadius;
      for (let dz = -r; dz <= r; dz += 4) for (let dx = -r; dx <= r; dx += 4) {
        if (dx * dx + dz * dz > r * r) continue;
        const x = this.origin.x + dx, z = this.origin.z + dz;
        if (!Number.isFinite(this.navigation.sampleHeightInterpolated(x, z))) continue;
        if (this.navigationWater(x, z)) this.waterCandidates.push({ x, z });
        else if ([[4, 0], [-4, 0], [0, 4], [0, -4]].some(([ox, oz]) => this.navigationWater(x + ox, z + oz)))
          this.shoreCandidates.push({ x, z });
      }
    }
    const candidates = medium === "water" ? this.waterCandidates : this.shoreCandidates!;
    return candidates.length ? candidates[Math.floor(random() * candidates.length)] : medium === "water" ? undefined : point;
  }

  private traverse(from: PlanPoint, to: PlanPoint, radius: number, height: number, rangeRadius: number, medium: PlanningAnimalMedium): boolean {
    if (!validShape(radius, height) || ![from.x, from.z, to.x, to.z].every(Number.isFinite)) return false;
    // A disk is convex: keeping both swept-disk endpoints inside its reduced radius
    // guarantees the complete movement footprint remains inside the fixed roaming circle.
    const area = this.range.distribution;
    if (area && [from, to].some(p => p.x - radius < area.minX || p.x + radius > area.maxX ||
      p.z - radius < area.minZ || p.z + radius > area.maxZ)) return false;
    const availableRadius = rangeRadius - radius;
    if (!area && availableRadius < 0) return false;
    const availableSquared = availableRadius * availableRadius;
    if (!area && (
      (from.x - this.origin.x) ** 2 + (from.z - this.origin.z) ** 2 > availableSquared + 1e-10 ||
      (to.x - this.origin.x) ** 2 + (to.z - this.origin.z) ** 2 > availableSquared + 1e-10
    ))
      return false;
    const range = {
      minX: Math.min(from.x, to.x) - radius,
      maxX: Math.max(from.x, to.x) + radius,
      minZ: Math.min(from.z, to.z) - radius,
      maxZ: Math.max(from.z, to.z) + radius
    };
    const radiusSquared = radius * radius;
    // Contact sampling follows the published navigation surface, so a bridge deck remains dry above its river.
    // The half-metre interval is query resolution, not an authored slope or habitat restriction.
    const steps = Math.max(0, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.5));
    let minimumGround = Infinity,
      maximumGround = -Infinity;
    for (let step = 0; step <= steps; step++) {
      const t = steps ? step / steps : 0,
        x = from.x + (to.x - from.x) * t,
        z = from.z + (to.z - from.z) * t;
      let y: number | undefined, wet: boolean;
      if (this.navigation.sampleAnimalSupport) {
        this.navigation.sampleAnimalSupport(x, z, this.support);
        wet = this.support.waterHeight !== undefined;
        y = medium === "water" ? this.support.waterHeight : this.support.height;
        if (medium === "air" && y !== undefined) y = Math.max(y, this.support.waterHeight ?? y) + Math.max(4, height * 2);
      } else {
        y = this.heightAt(x, z, medium, height);
        wet = medium !== "air" && this.navigationWater(x, z);
      }
      if (y === undefined || !Number.isFinite(y) || (medium !== "air" && wet !== (medium === "water"))) return false;
      minimumGround = Math.min(minimumGround, y);
      maximumGround = Math.max(maximumGround, y);
      // Air can cross ground/water boundaries; static solids still constrain its volume.
      if (medium === "air") continue;
      for (let side = 0; side < 8; side++) {
        const angle = (side * Math.PI) / 4;
        const px = x + Math.cos(angle) * radius,
          pz = z + Math.sin(angle) * radius;
        let support: number | undefined, wet: boolean;
        if (this.navigation.sampleAnimalSupport) {
          this.navigation.sampleAnimalSupport(px, pz, this.support);
          support = this.support.height; wet = this.support.waterHeight !== undefined;
        } else {
          support = this.navigation.sampleHeightInterpolated(px, pz);
          wet = this.navigationWater(px, pz);
        }
        if (support === undefined || !Number.isFinite(support) || wet !== (medium === "water")) return false;
      }
    }
    return !this.solids.some(range, (box) => {
      if (box.top <= minimumGround + 1e-4 || box.bottom >= maximumGround + height - 1e-4) return false;
      const ax = (from.x - box.x) * box.cos + (from.z - box.z) * box.sin;
      const az = -(from.x - box.x) * box.sin + (from.z - box.z) * box.cos;
      const bx = (to.x - box.x) * box.cos + (to.z - box.z) * box.sin;
      const bz = -(to.x - box.x) * box.sin + (to.z - box.z) * box.cos;
      if (insideBox(ax, az, box) || insideBox(bx, bz, box)) return true;
      return (
        Math.min(
          segmentDistanceSquared(ax, az, bx, bz, -box.halfX, -box.halfZ, box.halfX, -box.halfZ),
          segmentDistanceSquared(ax, az, bx, bz, box.halfX, -box.halfZ, box.halfX, box.halfZ),
          segmentDistanceSquared(ax, az, bx, bz, box.halfX, box.halfZ, -box.halfX, box.halfZ),
          segmentDistanceSquared(ax, az, bx, bz, -box.halfX, box.halfZ, -box.halfX, -box.halfZ)
        ) <
        radiusSquared + 1e-10
      );
    });
  }
}

class SpatialBins<T extends PlanningAnimalBounds & { seen: number }> {
  private readonly bins = new Map<string, T[]>();
  private stamp = 0;
  private readonly cellM = 32;

  add(item: T): void {
    for (let x = Math.floor(item.minX / this.cellM); x <= Math.floor(item.maxX / this.cellM); x++) {
      for (let z = Math.floor(item.minZ / this.cellM); z <= Math.floor(item.maxZ / this.cellM); z++) {
        const key = `${x}:${z}`,
          bin = this.bins.get(key);
        if (bin) bin.push(item);
        else this.bins.set(key, [item]);
      }
    }
  }

  some(bounds: PlanningAnimalBounds, predicate: (item: T) => boolean): boolean {
    const stamp = ++this.stamp;
    for (let x = Math.floor(bounds.minX / this.cellM); x <= Math.floor(bounds.maxX / this.cellM); x++) {
      for (let z = Math.floor(bounds.minZ / this.cellM); z <= Math.floor(bounds.maxZ / this.cellM); z++) {
        for (const item of this.bins.get(`${x}:${z}`) ?? []) {
          if (item.seen === stamp) continue;
          item.seen = stamp;
          if (item.minX > bounds.maxX || item.maxX < bounds.minX || item.minZ > bounds.maxZ || item.maxZ < bounds.minZ)
            continue;
          if (predicate(item)) return true;
        }
      }
    }
    return false;
  }
}

function segmentBoxEntry(ax: number, az: number, bx: number, bz: number, halfX: number, halfZ: number): number {
  let entry = 0, exit = 1;
  const dx = bx - ax, dz = bz - az;
  if (Math.abs(dx) < 1e-12) {
    if (Math.abs(ax) > halfX) return Infinity;
  } else {
    const u = (-halfX - ax) / dx, v = (halfX - ax) / dx;
    entry = Math.max(entry, Math.min(u, v));
    exit = Math.min(exit, Math.max(u, v));
    if (entry > exit) return Infinity;
  }
  if (Math.abs(dz) < 1e-12) {
    if (Math.abs(az) > halfZ) return Infinity;
  } else {
    const u = (-halfZ - az) / dz, v = (halfZ - az) / dz;
    entry = Math.max(entry, Math.min(u, v));
    exit = Math.min(exit, Math.max(u, v));
    if (entry > exit) return Infinity;
  }
  return entry;
}

function validShape(radius: number, height: number): boolean {
  return Number.isFinite(radius) && radius > 0 && Number.isFinite(height) && height > 0;
}

function insideBox(x: number, z: number, box: Solid): boolean {
  return Math.abs(x) <= box.halfX && Math.abs(z) <= box.halfZ;
}

function pointSegmentDistanceSquared(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax,
    dz = bz - az,
    lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lengthSquared)) : 0;
  return (px - ax - dx * t) ** 2 + (pz - az - dz * t) ** 2;
}

function segmentDistanceSquared(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  dx: number,
  dz: number
): number {
  const ux = bx - ax,
    uz = bz - az,
    vx = dx - cx,
    vz = dz - cz;
  const cross = ux * vz - uz * vx;
  if (Math.abs(cross) > 1e-12) {
    const t = ((cx - ax) * vz - (cz - az) * vx) / cross;
    const u = ((cx - ax) * uz - (cz - az) * ux) / cross;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(
    pointSegmentDistanceSquared(ax, az, cx, cz, dx, dz),
    pointSegmentDistanceSquared(bx, bz, cx, cz, dx, dz),
    pointSegmentDistanceSquared(cx, cz, ax, az, bx, bz),
    pointSegmentDistanceSquared(dx, dz, ax, az, bx, bz)
  );
}

/** Resolve habitat and spawn-locality once per individual, never rerolling on placement retries.
 * Spawn weight competes with the sum of eligible habitat weights (fallback 1). Selecting it
 * retains the same medium preferences; proximity cannot grant walking/swimming capabilities.
 */
export function chooseAnimalBirthHabitat(profile: AnimalTaskProfile, random: () => number, spawnPointWeight = 0): {
  medium: PlanningAnimalMedium; shore: boolean; nearSpawn: boolean;
} {
  const preferred = profile.preferredMedium ?? "ground";
  const canWalk = ["walk", "run"].some(slot => profile.animationSlots[slot]?.some(c => (c.medium ?? "ground") === "ground"));
  const canSwim = profile.animationSlots.swim?.some(c => c.medium === "water");
  const candidates = (profile.habitatPreferences ?? []).flatMap(p => {
    const medium = p.habitat === "river" ? "water" as const : "ground" as const;
    return p.weight > 0 && (preferred === "air" || (medium === "water" ? canSwim : canWalk))
      ? [{ medium: preferred === "air" ? "air" as const : medium, shore: p.habitat === "waterside", weight: p.weight }] : [];
  });
  const total = candidates.reduce((sum, c) => sum + c.weight, 0);
  const nearSpawn = spawnPointWeight > 0 && random() < spawnPointWeight / (spawnPointWeight + (total || 1));
  // Keep legacy zero-weight sampling, including the no-draw airborne path.
  if (preferred === "air") return { medium: "air", shore: false, nearSpawn };
  let pick = random() * total;
  const choice = candidates.find(c => (pick -= c.weight) < 0) ?? { medium: preferred, shore: false };
  return { medium: choice.medium, shore: choice.shore, nearSpawn };
}
