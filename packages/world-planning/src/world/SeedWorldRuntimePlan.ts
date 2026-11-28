import type { SeedWorldPlan, SeedWorldPoint, SeedWorldRoad } from "./SeedWorldPlanner";

/** Read-only semantic facts needed by the rendered world and agent queries.
 * A published external plan need not invent legacy generation stages or hydrology.
 */
export type SeedWorldRuntimePlan = Pick<
  SeedWorldPlan,
  "rootSeed" | "sizeMetres" | "resolution" | "roadDistance" | "pois" | "summits" | "detailBrushOperations"
> & {
  readonly roads: readonly (Pick<SeedWorldRoad, "id" | "fromPoiId" | "toPoiId"> & {
    readonly points: readonly SeedWorldPoint[];
    readonly bridgeIntervals: readonly Readonly<{ startArcMetres: number; endArcMetres: number }>[];
  })[];
  /** Lower X/Z boundary; omitted by existing centered Seed worlds. */
  readonly worldOrigin?: readonly [number, number];
  /** Spawn anchor supplied by the same published planning snapshot. */
  readonly observationAnchor?: Readonly<{ x: number; y: number; z: number }>;
};
