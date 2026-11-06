import type { SurfaceTriangle } from "@galacean/engine-terrain/geometry/SurfaceTriangles";
/** Host-owned ground facts. No Engine, renderer or storage dependencies. */
export interface PlotGrid {
  readonly originX: number;
  readonly originZ: number;
  readonly cellSize: number;
  readonly maximumSlopeDegrees: number;
}
export const DEFAULT_PLOT_GRID: PlotGrid = Object.freeze({
  originX: 0,
  originZ: 0,
  cellSize: 1.25,
  maximumSlopeDegrees: 15
});
export interface GroundTarget {
  readonly groundId: string;
  readonly cellX: number;
  readonly cellZ: number;
}
export interface GroundBounds {
  readonly minimumX: number;
  readonly minimumZ: number;
  readonly maximumX: number;
  readonly maximumZ: number;
}
export type GroundSurface = "soil" | "grass" | "rock" | "unknown";
export type GroundBlockReason =
  | "GROUND_MISSING"
  | "GROUND_ROCK"
  | "GROUND_TOO_STEEP"
  | "GROUND_BLOCKED"
  | "GROUND_UNDERWATER"
  | "GROUND_UNSUPPORTED";
export interface GroundSample {
  readonly position: readonly [number, number, number];
  readonly normal: readonly [number, number, number];
  readonly surface: GroundSurface;
}
export interface GroundFootprint {
  readonly covered: boolean;
  readonly maximumSlopeDegrees: number;
  readonly surfaces: readonly GroundSurface[];
  readonly blocked: boolean;
  readonly underwater: boolean;
  /** Optional authoritative extrema over the complete footprint; hosts without them retain sampled support checks. */
  readonly minimumHeight?: number;
  readonly maximumHeight?: number;
}
export interface GroundRay {
  readonly origin: readonly [number, number, number];
  readonly direction: readonly [number, number, number];
}
export interface GroundHit extends GroundSample {
  readonly groundId: string;
  readonly distance: number;
}
/** One immutable published ground version; sampling must agree with its rendered surface. */
export interface FarmingGroundView {
  readonly revision: number;
  /** Original rendered triangles intersecting the bounds. Required by the soil renderer; gameplay-only hosts may omit it. */
  surfaceTriangles?(groundId: string, bounds: GroundBounds): readonly SurfaceTriangle[];
  sample(groundId: string, x: number, z: number): GroundSample | null;
  inspectBounds(groundId: string, bounds: GroundBounds): GroundFootprint;
  raycast(ray: GroundRay, maximumDistance: number): GroundHit | null;
}
export interface FarmingGroundChange {
  readonly revision: number;
  readonly groundId?: string;
  /**
   * Complete support of changed sampling/inspection facts, including native cells,
   * triangles and any interpolation or normal dependencies. This is not a brush
   * footprint. Omit when a complete range is unknown to invalidate the whole ground.
   */
  readonly bounds?: GroundBounds;
}
export interface FarmingGroundProvider {
  capture(): FarmingGroundView;
  subscribe(listener: (change: FarmingGroundChange) => void): () => void;
}
export interface PlotGroundState {
  /** Last confirmed E/W/+Z/-Z connectivity, persisted only to bound offline credit. */
  readonly waterMask?: number;
  readonly waterSinceMs?: readonly number[];
  readonly waterCheckedRevision?: number;
  readonly availability: "available" | "blocked" | "unloaded";
  readonly reason: GroundBlockReason | null;
  readonly checkedAtSystemTimeMs: number;
  readonly groundRevision: number;
  /** Present after recovery, so the next simulation step cannot credit part of a paused interval. */
  readonly resumedAtSystemTimeMs?: number;
}
export interface CultivationInspection extends GroundTarget {
  readonly plotId: string;
  readonly bounds: GroundBounds;
  readonly position: readonly [number, number, number] | null;
  readonly normal: readonly [number, number, number] | null;
  readonly maximumSlopeDegrees: number;
  readonly surfaces: readonly GroundSurface[];
  readonly groundRevision: number;
  readonly canCultivate: boolean;
  readonly reason: GroundBlockReason | null;
}
export const GROUND_REASON_MESSAGES: Readonly<Record<GroundBlockReason, string>> = Object.freeze({
  GROUND_MISSING: "地形未加载或范围不完整",
  GROUND_ROCK: "岩石地面不能开垦",
  GROUND_TOO_STEEP: "坡度过大，不能开垦",
  GROUND_BLOCKED: "范围内有建筑或其他阻挡",
  GROUND_UNDERWATER: "水下地面不能开垦",
  GROUND_UNSUPPORTED: "地表类型尚未支持种植"
});
export function validatePlotGrid(grid: PlotGrid): void {
  if (
    ![grid.originX, grid.originZ, grid.cellSize, grid.maximumSlopeDegrees].every(Number.isFinite) ||
    grid.cellSize <= 0 ||
    grid.maximumSlopeDegrees <= 0 ||
    grid.maximumSlopeDegrees >= 90
  )
    throw new Error("Invalid farming plot grid");
}
export function isGroundTarget(value: unknown): value is GroundTarget {
  const v = value as GroundTarget | null;
  return Boolean(
    v &&
      typeof v.groundId === "string" &&
      /^[a-z0-9][a-z0-9/_-]*$/i.test(v.groundId) &&
      Number.isSafeInteger(v.cellX) &&
      Number.isSafeInteger(v.cellZ)
  );
}
export function plotIdForTarget(target: GroundTarget): string {
  return `${target.groundId}/x${target.cellX}z${target.cellZ}`;
}
export function targetAtPoint(grid: PlotGrid, groundId: string, x: number, z: number): GroundTarget {
  return {
    groundId,
    cellX: Math.floor((x - grid.originX) / grid.cellSize),
    cellZ: Math.floor((z - grid.originZ) / grid.cellSize)
  };
}
export function plotBounds(grid: PlotGrid, target: GroundTarget): GroundBounds {
  const x = grid.originX + target.cellX * grid.cellSize,
    z = grid.originZ + target.cellZ * grid.cellSize;
  return {
    minimumX: x,
    minimumZ: z,
    maximumX: x + grid.cellSize,
    maximumZ: z + grid.cellSize
  };
}
export function boundsIntersect(a: GroundBounds, b: GroundBounds): boolean {
  return a.minimumX <= b.maximumX && a.maximumX >= b.minimumX && a.minimumZ <= b.maximumZ && a.maximumZ >= b.minimumZ;
}
export function inspectGround(
  view: FarmingGroundView,
  grid: PlotGrid,
  target: GroundTarget,
  plotId = plotIdForTarget(target)
): CultivationInspection {
  const bounds = plotBounds(grid, target),
    facts = view.inspectBounds(target.groundId, bounds);
  const sample = view.sample(
    target.groundId,
    (bounds.minimumX + bounds.maximumX) / 2,
    (bounds.minimumZ + bounds.maximumZ) / 2
  );
  const reason: GroundBlockReason | null =
    !facts.covered || !sample
      ? "GROUND_MISSING"
      : facts.surfaces.includes("rock")
        ? "GROUND_ROCK"
        : facts.blocked
          ? "GROUND_BLOCKED"
          : facts.underwater
            ? "GROUND_UNDERWATER"
            : !facts.surfaces.length || facts.surfaces.some((surface) => surface !== "soil" && surface !== "grass")
              ? "GROUND_UNSUPPORTED"
              : !Number.isFinite(facts.maximumSlopeDegrees) || facts.maximumSlopeDegrees >= grid.maximumSlopeDegrees
                ? "GROUND_TOO_STEEP"
                : null;
  return Object.freeze({
    ...target,
    plotId,
    bounds: Object.freeze(bounds),
    position: sample?.position ?? null,
    normal: sample?.normal ?? null,
    maximumSlopeDegrees: facts.maximumSlopeDegrees,
    surfaces: Object.freeze([...facts.surfaces]),
    groundRevision: view.revision,
    canCultivate: !reason,
    reason
  });
}
export function groundState(
  inspection: CultivationInspection,
  time: number,
  previous?: PlotGroundState
): PlotGroundState {
  // Refresh terrain facts without resetting transport history. Recovery belongs
  // only to an available interval and must be removed on the next interruption.
  const { resumedAtSystemTimeMs, ...retained } = previous ?? {};
  return {
    ...retained,
    availability: inspection.reason === "GROUND_MISSING" ? "unloaded" : inspection.reason ? "blocked" : "available",
    reason: inspection.reason,
    checkedAtSystemTimeMs: time,
    groundRevision: inspection.groundRevision,
    ...(!inspection.reason && previous
      ? previous.availability !== "available"
        ? { resumedAtSystemTimeMs: time }
        : resumedAtSystemTimeMs === undefined
          ? {}
          : { resumedAtSystemTimeMs }
      : {})
  };
}
export function shapeSeedForId(id: string): number {
  let seed = 2166136261;
  for (let i = 0; i < id.length; i++) seed = Math.imul(seed ^ id.charCodeAt(i), 16777619);
  return seed >>> 0;
}
