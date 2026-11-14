import type { SurfaceTriangle } from "@galacean/engine-terrain/geometry/SurfaceTriangles";
import type {
  FarmingGroundProvider,
  FarmingGroundView,
  GroundBounds,
  GroundSample,
  GroundSurface,
  FarmingGroundChange
} from "@galacean/engine-farming/farming/api/index";
import type { PlanPoint } from "../../semantic-study/IslandPlanModel";
import { createPlanningRingQuery } from "../../semantic-study/WorldPlanningTerrain";
import { overlap, polygonBounds } from "../../semantic-study/WorldPlanningGeometry";

export interface PlanningFarmingGroundOptions {
  readonly revision: number;
  readonly groundId: string;
  readonly domains: readonly PlanPoint[][];
  readonly allowedArea?: readonly PlanPoint[];
  /** Raw terrain only: bridge navigation floors are never agricultural ground. */
  readonly height: (x: number, z: number) => number | null;
  readonly surface?: (x: number, z: number) => GroundSurface;
  readonly underwater: (x: number, z: number, height: number) => boolean;
  /** Published Water bounds certificates supersede probe-only wetness checks. */
  readonly underwaterBounds?: (bounds: GroundBounds) => boolean;
  readonly blocked: (bounds: GroundBounds) => boolean;
  readonly sampleStepM?: number;
  /** Published terrain may supply exact native-cell facts instead of finite-difference probes. */
  readonly terrain?: {
    surfaceTriangles?(bounds: GroundBounds): readonly SurfaceTriangle[];
    sample(x: number, z: number): GroundSample | null;
    inspectBounds(bounds: GroundBounds): {
      readonly covered: boolean;
      readonly maximumSlopeDegrees: number;
      readonly surfaces: readonly GroundSurface[];
      readonly minimumHeight: number;
      readonly maximumHeight: number;
    };
  };
}
export function farmingBoundsOutline(b: GroundBounds): PlanPoint[] {
  return [
    { x: b.minimumX, z: b.minimumZ },
    { x: b.maximumX, z: b.minimumZ },
    { x: b.maximumX, z: b.maximumZ },
    { x: b.minimumX, z: b.maximumZ }
  ];
}

/** The host reserves public roads and operation space for access. Terrain/water facts stay unchanged. */
export function restrictPlanningFarmingCultivation(
  view: FarmingGroundView,
  reserved: readonly (readonly PlanPoint[])[]
): FarmingGroundView {
  const regions = reserved.map((points) => {
    const outline = points.map((point) => ({ ...point }));
    return { outline, bounds: polygonBounds(outline) };
  });
  return Object.freeze({
    ...view,
    inspectBounds: (id: string, bounds: GroundBounds) => {
      const facts = view.inspectBounds(id, bounds);
      return {
        ...facts,
        blocked:
          facts.blocked ||
          regions.some(
            ({ outline, bounds: region }) =>
              // Adjacent full cells may share an edge with the operation corridor, but not its area.
              Math.min(bounds.maximumX, region.maxX) - Math.max(bounds.minimumX, region.minX) > 1e-7 &&
              Math.min(bounds.maximumZ, region.maxZ) - Math.max(bounds.minimumZ, region.minZ) > 1e-7 &&
              overlap(outline, farmingBoundsOutline(bounds))
          )
      };
    }
  });
}

/** Keep lazy runtime views complete: rendering and gameplay must use the same accepted revision. */
export function lazyPlanningFarmingGroundView(revision: number, read: () => FarmingGroundView): FarmingGroundView {
  return Object.freeze({
    revision,
    sample: (...args: Parameters<FarmingGroundView["sample"]>) => read().sample(...args),
    inspectBounds: (...args: Parameters<FarmingGroundView["inspectBounds"]>) => read().inspectBounds(...args),
    raycast: (...args: Parameters<FarmingGroundView["raycast"]>) => read().raycast(...args),
    surfaceTriangles: (...args: Parameters<NonNullable<FarmingGroundView["surfaceTriangles"]>>) => {
      const view = read();
      if (!view.surfaceTriangles) throw new Error("Farming ground does not provide surface triangles");
      return view.surfaceTriangles(...args);
    }
  });
}

/** Immutable agricultural view of host facts. No Engine or Water runtime ownership. */
export function createPlanningFarmingGroundView(options: PlanningFarmingGroundOptions): FarmingGroundView {
  const domains = options.domains.map((outline) => createPlanningRingQuery(outline.map((p) => ({ ...p }))));
  const area = options.allowedArea && createPlanningRingQuery(options.allowedArea.map((p) => ({ ...p })));
  const step = options.sampleStepM ?? 0.5;
  if (!Number.isFinite(step) || step <= 0) throw new Error("Invalid farming ground sample step");
  const sample = (groundId: string, x: number, z: number): GroundSample | null => {
    const point = { x, z };
    if (groundId !== options.groundId || !domains.some((d) => d.inside(point)) || (area && !area.inside(point)))
      return null;
    if (options.terrain) return options.terrain.sample(x, z);
    const y = options.height(x, z);
    const delta = Math.min(0.25, step / 2);
    const heights = [
      options.height(x - delta, z),
      options.height(x + delta, z),
      options.height(x, z - delta),
      options.height(x, z + delta)
    ];
    if (y === null || !Number.isFinite(y) || heights.some((h) => h === null || !Number.isFinite(h))) return null;
    const dx = (heights[1]! - heights[0]!) / (delta * 2),
      dz = (heights[3]! - heights[2]!) / (delta * 2);
    const length = Math.hypot(dx, 1, dz);
    return {
      position: [x, y, z],
      normal: [-dx / length, 1 / length, -dz / length],
      surface: options.surface?.(x, z) ?? "soil"
    };
  };
  const view: FarmingGroundView = {
    revision: options.revision,
    surfaceTriangles:
      options.terrain?.surfaceTriangles &&
      ((id, bounds) => (id === options.groundId ? options.terrain!.surfaceTriangles!(bounds) : [])),
    sample,
    inspectBounds(groundId, b) {
      const outline = farmingBoundsOutline(b);
      let covered =
        groundId === options.groundId &&
        domains.some((d) => d.containsPolygon(outline)) &&
        (!area || area.containsPolygon(outline));
      let maximumSlopeDegrees = 0,
        underwater = false;
      const surfaces = new Set<GroundSurface>();
      const nx = Math.max(1, Math.ceil((b.maximumX - b.minimumX) / step)),
        nz = Math.max(1, Math.ceil((b.maximumZ - b.minimumZ) / step));
      for (let iz = 0; iz <= nz; iz++)
        for (let ix = 0; ix <= nx; ix++) {
          const x = b.minimumX + ((b.maximumX - b.minimumX) * ix) / nx,
            z = b.minimumZ + ((b.maximumZ - b.minimumZ) * iz) / nz;
          const s = sample(groundId, x, z);
          if (!s) {
            covered = false;
            continue;
          }
          maximumSlopeDegrees = Math.max(
            maximumSlopeDegrees,
            (Math.acos(Math.min(1, Math.max(-1, s.normal[1]))) * 180) / Math.PI
          );
          surfaces.add(s.surface);
          underwater ||= options.underwater(x, z, s.position[1]);
        }
      const terrain = options.terrain?.inspectBounds(b);
      if (covered && (terrain?.covered ?? true) && options.underwaterBounds) underwater = options.underwaterBounds(b);
      return {
        covered: covered && (terrain?.covered ?? true),
        maximumSlopeDegrees:
          terrain && Number.isFinite(terrain.maximumSlopeDegrees) ? terrain.maximumSlopeDegrees : maximumSlopeDegrees,
        surfaces: terrain?.surfaces ?? [...surfaces],
        underwater,
        blocked: options.blocked(b),
        ...(terrain &&
          Number.isFinite(terrain.minimumHeight) &&
          Number.isFinite(terrain.maximumHeight) && {
            minimumHeight: terrain.minimumHeight,
            maximumHeight: terrain.maximumHeight
          })
      };
    },
    raycast(ray, maximumDistance) {
      const length = Math.hypot(...ray.direction);
      if (!Number.isFinite(maximumDistance) || maximumDistance <= 0 || !Number.isFinite(length) || length === 0)
        return null;
      const direction = ray.direction.map((v) => v / length);
      const at = (distance: number) => ray.origin.map((v, i) => v + direction[i] * distance);
      let previousDistance = 0;
      let previousAbove = false;
      const samples = Math.max(1, Math.ceil(maximumDistance / step));
      for (let i = 0; i <= samples; i++) {
        const distance = (i * maximumDistance) / samples,
          p = at(distance),
          s = sample(options.groundId, p[0], p[2]);
        if (s && p[1] <= s.position[1] && previousAbove) {
          let low = previousDistance,
            high = distance;
          for (let j = 0; j < 16; j++) {
            const middle = (low + high) / 2,
              p = at(middle),
              s = sample(options.groundId, p[0], p[2]);
            if (s && p[1] <= s.position[1]) high = middle;
            else low = middle;
          }
          const hit = at(high),
            ground = sample(options.groundId, hit[0], hit[2]);
          return ground && { ...ground, groundId: options.groundId, distance: high };
        }
        previousAbove = Boolean(s && p[1] > s.position[1]);
        previousDistance = distance;
      }
      return null;
    }
  };
  return Object.freeze(view);
}

/** Publication swaps one immutable view. Query-only water facts can skip geometry notifications. */
export class PlanningFarmingGroundProvider implements FarmingGroundProvider {
  private readonly listeners = new Set<(change: FarmingGroundChange) => void>();
  constructor(private view: FarmingGroundView) {}
  capture(): FarmingGroundView {
    return this.view;
  }
  subscribe(listener: (change: FarmingGroundChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  publish(view: FarmingGroundView, notify = true): void {
    if (view.revision < this.view.revision) throw new Error("Stale farming ground publication");
    this.view = view;
    // Water-only facts do not move rendered ground. Consumers capture the new revision on their next request.
    if (!notify) return;
    for (const listener of this.listeners) listener({ revision: view.revision });
  }
  dispose(): void {
    this.listeners.clear();
  }
}
