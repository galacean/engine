import type { AnimalRoutePoint, AnimalRouteQuery, AnimalRouteObstacle } from "@galacean/engine-animals/gameplay/animal/AnimalStaticRoute";
import type { AnimalTaskProfile } from "@galacean/engine-animals/gameplay/animal/AnimalTaskController";
import { PlanningAnimalSurface, type PlanningAnimalSurfaceData } from "./PlanningAnimalSurface.ts";
import type { AnimalPopulationPosition, AnimalPopulationDistribution } from "@galacean/engine-animals/gameplay/animal/AnimalPopulation";
import type { IslandPlan, PlanPoint } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import { planningWhiteboxes } from "@galacean/engine-world-planning/semantic-study/PlanningWhiteboxes";
import { rockFormationFittedHeights } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Variants";

export type PlanningAnimalMedium = "ground" | "air" | "water";

/** Horizontal range of a template resident, fixed at its individual birth position. */
export interface AnimalHome extends PlanPoint { radius: number }

export function insideAnimalHome(home: AnimalHome | undefined, x: number, z: number): boolean {
  return !home || (x - home.x) ** 2 + (z - home.z) ** 2 <= home.radius ** 2;
}

/** Uniform area sampling around an authored site; the caller validates the complete body on the actual land or water. */
export function sampleAnimalSpawnDisk(origin: PlanPoint, radius: number, random: () => number): PlanPoint {
  const angle = random() * Math.PI * 2, distance = radius * Math.sqrt(random());
  return { x: origin.x + Math.cos(angle) * distance, z: origin.z + Math.sin(angle) * distance };
}

/** Existing navigation support, including bridge decks and water contacts. */
export interface PlanningAnimalNavigation {
  /** The provider refreshes dynamic water each update and retains snapshot heights until publication invalidates them. */
  beginAnimalUpdate?(): void;
  endAnimalUpdate?(): void;
  sampleHeightInterpolated(x: number, z: number): number | undefined;
  sampleContactIsWater(x: number, z: number): boolean;
  sampleWaterHeight?(x: number, z: number): number | undefined;
  /** Optional combined sample avoids querying the same real water/support twice per footprint point. */
  sampleAnimalSupport?(x: number, z: number, out: { height: number | undefined; waterHeight: number | undefined }): void;
  /** Strictly conservative broad-phase: returns true only when every point in bounds is provably dry land with finite terrain. */
  isBoundsDefinitelyDry?(minX: number, minZ: number, maxX: number, maxZ: number): boolean;
}

const OCTAGON_COS = new Float64Array([1, Math.SQRT1_2, 0, -Math.SQRT1_2, -1, -Math.SQRT1_2, 0, Math.SQRT1_2]);
const OCTAGON_SIN = new Float64Array([0, Math.SQRT1_2, 1, Math.SQRT1_2, 0, -Math.SQRT1_2, -1, -Math.SQRT1_2]);

/** Keep future queries of an unaffected suspended route on the current published habitat. */
export function liveAnimalRouteQuery(
  read: () => Pick<PlanningAnimalHabitat, "staticRouteQuery">,
  radius: number, height: number, medium: PlanningAnimalMedium, home?: AnimalHome
): AnimalRouteQuery {
  let habitat = read(), query = habitat.staticRouteQuery(radius, height, medium);
  const current = () => {
    const next = read();
    if (habitat !== next) { habitat = next; query = habitat.staticRouteQuery(radius, height, medium); }
    return query;
  };
  return {
    canTraverse: (a, b, clearance) => insideAnimalHome(home, a[0], a[1]) &&
      insideAnimalHome(home, b[0], b[1]) && current().canTraverse(a, b, clearance),
    canTraverseXY: (ax, az, bx, bz, clearance) => {
      if (!insideAnimalHome(home, ax, az) || !insideAnimalHome(home, bx, bz)) return false;
      const q = current();
      return q.canTraverseXY ? q.canTraverseXY(ax, az, bx, bz, clearance) : q.canTraverse([ax, az], [bx, bz], clearance);
    },
    obstruction: (a, b, clearance) => current().obstruction(a, b, clearance)
  };
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
  id: string;
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
  private readonly queryRange: PlanningAnimalBounds = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  private readonly solidHits: Solid[] = [];
  private solidHitCount = 0;
  private _tFromX = 0;
  private _tFromZ = 0;
  private _tToX = 0;
  private _tToZ = 0;
  private _tRadiusSq = 0;
  private readonly _collectTraverseSolid = (box: Solid): boolean => {
    const fx = this._tFromX - box.x;
    const fz = this._tFromZ - box.z;
    const tx = this._tToX - box.x;
    const tz = this._tToZ - box.z;
    const ax = fx * box.cos + fz * box.sin;
    const az = -fx * box.sin + fz * box.cos;
    const bx = tx * box.cos + tz * box.sin;
    const bz = -tx * box.sin + tz * box.cos;
    if (
      insideBox(ax, az, box) ||
      insideBox(bx, bz, box) ||
      Math.min(
        segmentDistanceSquared(ax, az, bx, bz, -box.halfX, -box.halfZ, box.halfX, -box.halfZ),
        segmentDistanceSquared(ax, az, bx, bz, box.halfX, -box.halfZ, box.halfX, box.halfZ),
        segmentDistanceSquared(ax, az, bx, bz, box.halfX, box.halfZ, -box.halfX, box.halfZ),
        segmentDistanceSquared(ax, az, bx, bz, -box.halfX, box.halfZ, -box.halfX, -box.halfZ)
      ) <
        this._tRadiusSq + 1e-10
    ) {
      this.solidHits[this.solidHitCount++] = box;
    }
    return false;
  };
  private readonly _firstSolidBounds: PlanningAnimalBounds = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  private _fsAx = 0;
  private _fsAz = 0;
  private _fsBx = 0;
  private _fsBz = 0;
  private _fsRadius = 0;
  private _fsBottom = 0;
  private _fsTop = 0;
  private _fsFraction = Infinity;
  private _fsNearest: Solid | undefined = undefined;
  private readonly _visitFirstSolid = (box: Solid): boolean => {
    if (box.top <= this._fsBottom + 1e-4 || box.bottom >= this._fsTop - 1e-4) return false;
    const fax = this._fsAx - box.x;
    const faz = this._fsAz - box.z;
    const fbx = this._fsBx - box.x;
    const fbz = this._fsBz - box.z;
    const ax = fax * box.cos + faz * box.sin;
    const az = -fax * box.sin + faz * box.cos;
    const bx = fbx * box.cos + fbz * box.sin;
    const bz = -fbx * box.sin + fbz * box.cos;
    const entry = segmentBoxEntry(ax, az, bx, bz, box.halfX + this._fsRadius, box.halfZ + this._fsRadius);
    if (entry < this._fsFraction) {
      this._fsFraction = entry;
      this._fsNearest = box;
    }
    return false;
  };

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
    const fittedRockHeights = rockFormationFittedHeights(plan);
    for (const part of planningWhiteboxes(plan, ground)) {
      // Decks and approaches are navigation support; treating their thickness as an obstacle blocks sloped decks.
      if (part.layer === "bridge") continue;
      for (const [index, box] of part.boxes.entries()) {
        if (!box.collision) continue;
        const cos = Math.cos(box.yaw),
          sin = Math.sin(box.yaw);
        const halfX = box.sizeX / 2,
          halfZ = box.sizeZ / 2;
        const extentX = Math.abs(cos) * halfX + Math.abs(sin) * halfZ;
        const extentZ = Math.abs(sin) * halfX + Math.abs(cos) * halfZ;
        const bottom = box.elevation ?? ground(box.center);
        const fittedHeight =
          part.layer === "rock"
            ? fittedRockHeights?.rockBoxes.get(box.id)
            : part.layer === "landscape-rock"
              ? fittedRockHeights?.landscapes.get(box.id)
              : undefined;
        const heightM = fittedHeight ?? box.sizeY;
        const solid: Solid = {
          // Match publication dependency identities. Unrelated part edits must not
          // renumber obstacles already visited by a suspended search.
          id: `${part.layer}:${part.id}:${index}`,
          x: box.center.x,
          z: box.center.z,
          cos,
          sin,
          halfX,
          halfZ,
          bottom,
          top: bottom + heightM,
          seen: 0,
          minX: box.center.x - extentX,
          maxX: box.center.x + extentX,
          minZ: box.center.z - extentZ,
          maxZ: box.center.z + extentZ
        };
        this.solidCount++;
        this.solids.add(solid);
      }
    }
  }

  /** Published convex map extent; independent of terrain samples and observer position. */
  get flightBounds() {
    return this.range.distribution ?? { x: this.origin.x, z: this.origin.z, radius: this.range.roamRadius };
  }

  /** Dependencies of placement include the whole allowed footprint, not just a suspended actor's old position. */
  placementIntersects(bounds: PlanningAnimalBounds): boolean {
    const area = this.range.distribution;
    if (area) return bounds.maxX >= area.minX && bounds.minX <= area.maxX &&
      bounds.maxZ >= area.minZ && bounds.minZ <= area.maxZ;
    const dx = Math.max(bounds.minX - this.origin.x, 0, this.origin.x - bounds.maxX);
    const dz = Math.max(bounds.minZ - this.origin.z, 0, this.origin.z - bounds.maxZ);
    return dx * dx + dz * dz <= this.range.spawnRadius ** 2 + 1e-10;
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
    if (!this.traverseXY(point.x, point.z, point.x, point.z, radius, bodyHeightM, this.range.spawnRadius, medium)) return;
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
    return this.traverseXY(from.x, from.z, to.x, to.z, radius, bodyHeightM, this.range.roamRadius, medium);
  }

  canTraverseXY(
    fx: number,
    fz: number,
    tx: number,
    tz: number,
    radius: number,
    bodyHeightM = radius * 2,
    medium: PlanningAnimalMedium = "ground"
  ): boolean {
    return this.traverseXY(fx, fz, tx, tz, radius, bodyHeightM, this.range.roamRadius, medium);
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
    const validXY = (ax: number, az: number, bx: number, bz: number, clearance = 0) => medium === "air"
      ? this.containsFlightXY(ax, az, radius) && this.containsFlightXY(bx, bz, radius) &&
        !this.firstSolidXY(ax, az, bx, bz, radius + clearance, bottom, top)
      : this.canTraverseXY(ax, az, bx, bz, radius, height, medium) &&
        (!clearance || !this.firstSolidXY(ax, az, bx, bz, radius + clearance, -Infinity, Infinity));
    return {
      canTraverse: (a: AnimalRoutePoint, b: AnimalRoutePoint, clearance = 0) => validXY(a[0], a[1], b[0], b[1], clearance),
      canTraverseXY: validXY,
      obstruction: (a, b, clearance): AnimalRouteObstacle | undefined => {
        // Ground routes follow varying terrain. A conservative solid set only
        // proposes candidates; every connection still checks actual support.
        const box = this.firstSolidXY(a[0], a[1], b[0], b[1], radius + clearance, medium === "air" ? bottom : -Infinity, medium === "air" ? top : Infinity);
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
    if (
      !validShape(radius, height) ||
      !Number.isFinite(from.x) ||
      !Number.isFinite(from.y) ||
      !Number.isFinite(from.z) ||
      !Number.isFinite(to.x) ||
      !Number.isFinite(to.y) ||
      !Number.isFinite(to.z)
    ) return false;
    if (!this.containsFlightXY(from.x, from.z, radius) || !this.containsFlightXY(to.x, to.z, radius) ||
        this.firstSolidXY(from.x, from.z, to.x, to.z, radius, Math.min(from.y, to.y), Math.max(from.y, to.y) + height)) return false;
    const dx = to.x - from.x, dz = to.z - from.z;
    const steps = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dz * dz) / 0.5));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, x = from.x + (to.x - from.x) * t, z = from.z + (to.z - from.z) * t;
      const ground = this.navigation.sampleHeightInterpolated(x, z);
      if (ground === undefined || !Number.isFinite(ground) || ground > from.y + (to.y - from.y) * t + 1e-4) return false;
    }
    return true;
  }

  private containsFlightXY(x: number, z: number, radius: number): boolean {
    const area = this.range.distribution;
    if (area) {
      return x - radius >= area.minX && x + radius <= area.maxX &&
        z - radius >= area.minZ && z + radius <= area.maxZ;
    }
    const ox = x - this.origin.x, oz = z - this.origin.z;
    const limit = this.range.roamRadius - radius;
    return limit >= 0 && ox * ox + oz * oz <= limit * limit;
  }

  private firstSolid(a: AnimalRoutePoint, b: AnimalRoutePoint, radius: number, bottom: number, top: number): Solid | undefined {
    return this.firstSolidXY(a[0], a[1], b[0], b[1], radius, bottom, top);
  }

  private firstSolidXY(ax: number, az: number, bx: number, bz: number, radius: number, bottom: number, top: number): Solid | undefined {
    const bounds = this._firstSolidBounds;
    bounds.minX = (ax < bx ? ax : bx) - radius;
    bounds.maxX = (ax > bx ? ax : bx) + radius;
    bounds.minZ = (az < bz ? az : bz) - radius;
    bounds.maxZ = (az > bz ? az : bz) + radius;
    this._fsAx = ax;
    this._fsAz = az;
    this._fsBx = bx;
    this._fsBz = bz;
    this._fsRadius = radius;
    this._fsBottom = bottom;
    this._fsTop = top;
    this._fsFraction = Infinity;
    this._fsNearest = undefined;
    this.solids.some(bounds, this._visitFirstSolid);
    const nearest = this._fsNearest;
    this._fsNearest = undefined;
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
  spawnPointCandidate(point: PlanPoint, medium: PlanningAnimalMedium, shore: boolean, radius: number, random: () => number, origin: PlanPoint = this.origin): PlanPoint | undefined {
    if (medium === "water" || shore) {
      const candidate = this.spawnCandidate(point, medium, shore, random);
      return candidate && (candidate.x - origin.x) ** 2 + (candidate.z - origin.z) ** 2 <= radius * radius ? candidate : undefined;
    }
    return sampleAnimalSpawnDisk(origin, radius, random);
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

  private traverseXY(
    fx: number,
    fz: number,
    tx: number,
    tz: number,
    radius: number,
    height: number,
    rangeRadius: number,
    medium: PlanningAnimalMedium
  ): boolean {
    if (
      !validShape(radius, height) ||
      !Number.isFinite(fx) ||
      !Number.isFinite(fz) ||
      !Number.isFinite(tx) ||
      !Number.isFinite(tz)
    )
      return false;
    // A disk is convex: keeping both swept-disk endpoints inside its reduced radius
    // guarantees the complete movement footprint remains inside the fixed roaming circle.
    const area = this.range.distribution;
    if (
      area &&
      (fx - radius < area.minX ||
        fx + radius > area.maxX ||
        fz - radius < area.minZ ||
        fz + radius > area.maxZ ||
        tx - radius < area.minX ||
        tx + radius > area.maxX ||
        tz - radius < area.minZ ||
        tz + radius > area.maxZ)
    )
      return false;
    const availableRadius = rangeRadius - radius;
    if (!area && availableRadius < 0) return false;
    const availableSquared = availableRadius * availableRadius;
    if (!area) {
      const fdx = fx - this.origin.x,
        fdz = fz - this.origin.z;
      const tdx = tx - this.origin.x,
        tdz = tz - this.origin.z;
      if (fdx * fdx + fdz * fdz > availableSquared + 1e-10 || tdx * tdx + tdz * tdz > availableSquared + 1e-10)
        return false;
    }
    const range = this.queryRange;
    range.minX = (fx < tx ? fx : tx) - radius;
    range.maxX = (fx > tx ? fx : tx) + radius;
    range.minZ = (fz < tz ? fz : tz) - radius;
    range.maxZ = (fz > tz ? fz : tz) + radius;
    const radiusSquared = radius * radius;
    const steps = Math.max(0, Math.ceil(Math.hypot(tx - fx, tz - fz) / 0.5));

    // Pre-collect 2D horizontal solid overlaps (zero water queries). Most corridors have 0 hits.
    const solidHits = this.solidHits;
    this.solidHitCount = 0;
    if (this.solidCount > 0) {
      this._tFromX = fx;
      this._tFromZ = fz;
      this._tToX = tx;
      this._tToZ = tz;
      this._tRadiusSq = radiusSquared;
      this.solids.some(range, this._collectTraverseSolid);
    }

    // For ground movement with 2D solid hits, compute exact centerline terrain height bounds first
    // and reject vertically overlapping solids immediately before any water/perimeter queries.
    if (medium === "ground" && this.solidHitCount > 0) {
      let minG = Infinity,
        maxG = -Infinity;
      for (let step = 0; step <= steps; step++) {
        const t = steps ? step / steps : 0;
        const y = this.navigation.sampleHeightInterpolated(
          fx + (tx - fx) * t,
          fz + (tz - fz) * t
        );
        if (y === undefined || !Number.isFinite(y)) {
          this.solidHitCount = 0;
          return false;
        }
        if (y < minG) minG = y;
        if (y > maxG) maxG = y;
      }
      for (let i = 0, n = this.solidHitCount; i < n; i++) {
        const box = solidHits[i];
        if (box.top > minG + 1e-4 && box.bottom < maxG + height - 1e-4) {
          this.solidHitCount = 0;
          return false;
        }
      }
      // All 2D hits cleared vertically; no further solid check needed for this corridor.
      this.solidHitCount = 0;
    }

    // Strictly conservative dry-tile fast path: when every 4m tile intersecting the swept disk
    // is provably dry land with finite terrain, skip per-step water and 8-point perimeter sampling.
    if (
      medium === "ground" &&
      this.navigation.isBoundsDefinitelyDry?.(range.minX, range.minZ, range.maxX, range.maxZ)
    ) {
      for (let step = 0; step <= steps; step++) {
        const t = steps ? step / steps : 0;
        const y = this.navigation.sampleHeightInterpolated(
          fx + (tx - fx) * t,
          fz + (tz - fz) * t
        );
        if (y === undefined || !Number.isFinite(y)) return false;
      }
      return true;
    }

    // Contact sampling follows the published navigation surface, so a bridge deck remains dry above its river.
    // The half-metre interval is query resolution, not an authored slope or habitat restriction.
    let minimumGround = Infinity,
      maximumGround = -Infinity;
    const expectWet = medium === "water";
    const sampleSupport = this.navigation.sampleAnimalSupport;
    for (let step = 0; step <= steps; step++) {
      const t = steps ? step / steps : 0,
        x = fx + (tx - fx) * t,
        z = fz + (tz - fz) * t;
      let y: number | undefined, wet: boolean;
      if (sampleSupport) {
        this.navigation.sampleAnimalSupport!(x, z, this.support);
        wet = this.support.waterHeight !== undefined;
        y = expectWet ? this.support.waterHeight : this.support.height;
        if (medium === "air" && y !== undefined) y = Math.max(y, this.support.waterHeight ?? y) + Math.max(4, height * 2);
      } else {
        y = this.heightAt(x, z, medium, height);
        wet = medium !== "air" && this.navigationWater(x, z);
      }
      if (y === undefined || !Number.isFinite(y) || (medium !== "air" && wet !== expectWet)) {
        this.solidHitCount = 0;
        return false;
      }
      if (y < minimumGround) minimumGround = y;
      if (y > maximumGround) maximumGround = y;
      // Air can cross ground/water boundaries; static solids still constrain its volume.
      if (medium === "air") continue;
      for (let side = 0; side < 8; side++) {
        const px = x + OCTAGON_COS[side] * radius,
          pz = z + OCTAGON_SIN[side] * radius;
        let support: number | undefined, sideWet: boolean;
        if (sampleSupport) {
          this.navigation.sampleAnimalSupport!(px, pz, this.support);
          support = this.support.height;
          sideWet = this.support.waterHeight !== undefined;
        } else {
          support = this.navigation.sampleHeightInterpolated(px, pz);
          sideWet = this.navigationWater(px, pz);
        }
        if (support === undefined || !Number.isFinite(support) || sideWet !== expectWet) {
          this.solidHitCount = 0;
          return false;
        }
      }
    }
    for (let i = 0, n = this.solidHitCount; i < n; i++) {
      const box = solidHits[i];
      if (box.top > minimumGround + 1e-4 && box.bottom < maximumGround + height - 1e-4) {
        this.solidHitCount = 0;
        return false;
      }
    }
    this.solidHitCount = 0;
    return true;
  }
}

class SpatialBins<T extends PlanningAnimalBounds & { seen: number }> {
  private readonly bins = new Map<string, T[]>();
  // Sorted occupied cells are shared by all animals and belong to this immutable habitat.
  private rows?: { x: number; cells: { z: number; items: T[] }[] }[];
  private stamp = 0;
  private readonly cellM = 32;

  add(item: T): void {
    this.rows = undefined;
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
    const minX = Math.floor(bounds.minX / this.cellM),
      maxX = Math.floor(bounds.maxX / this.cellM),
      minZ = Math.floor(bounds.minZ / this.cellM),
      maxZ = Math.floor(bounds.maxZ / this.cellM);
    const rows = (this.rows ??= this.occupiedRows());
    const stamp = ++this.stamp;
    // Keep the old x-then-z discovery order, including ties, while skipping empty cells.
    for (let i = firstRowX(rows, minX), rlen = rows.length; i < rlen && rows[i].x <= maxX; i++) {
      const cells = rows[i].cells;
      for (let j = firstCellZ(cells, minZ), clen = cells.length; j < clen && cells[j].z <= maxZ; j++) {
        const items = cells[j].items;
        for (let k = 0, klen = items.length; k < klen; k++) {
          const item = items[k];
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

  private occupiedRows(): { x: number; cells: { z: number; items: T[] }[] }[] {
    const rows = new Map<number, { z: number; items: T[] }[]>();
    for (const [key, items] of this.bins) {
      const [x, z] = key.split(":").map(Number);
      let cells = rows.get(x);
      if (!cells) rows.set(x, (cells = []));
      cells.push({ z, items });
    }
    return [...rows].sort(([a], [b]) => a - b).map(([x, cells]) => ({ x, cells: cells.sort((a, b) => a.z - b.z) }));
  }
}

function firstRowX<T>(values: readonly { x: number; cells: T }[], minimum: number): number {
  let low = 0,
    high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle].x < minimum) low = middle + 1;
    else high = middle;
  }
  return low;
}

function firstCellZ<T>(values: readonly { z: number; items: T }[], minimum: number): number {
  let low = 0,
    high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle].z < minimum) low = middle + 1;
    else high = middle;
  }
  return low;
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
