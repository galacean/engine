import { connectTerrainRiverMouths, type TerrainRiverMouth } from "./TerrainRiverMouth";
import type { IslandPlan, PlanPoint } from "../../semantic-study/IslandPlanModel";
import { createPlanningData } from "../../semantic-study/WorldPlanningContract";
import { createPlanningGroundSampler, createPlanningRingQuery } from "../../semantic-study/WorldPlanningTerrain";
import { generateRiverRegions, RIVER_DEFAULTS } from "../../spatial/hydrology/RiverRegions";
import { generateLakeRegions, LAKE_DEFAULTS } from "../../spatial/hydrology/LakeRegions";
import { planningCandidateCount } from "../../spatial/PlanningCountRange";

export interface TerrainHydrologyCount {
  countMin: number;
  countMax: number;
}
export interface TerrainHydrologyInput {
  seed: number;
  width: number;
  depth: number;
  landPolygons: readonly (readonly PlanPoint[])[];
  heightAt: (x: number, z: number) => number;
  ocean?: boolean;
  rivers?: TerrainHydrologyCount;
  lakes?: TerrainHydrologyCount & { allowCarving?: boolean };
}

/** Pure initial hydrology generation on the caller's metre-space terrain. No scene or assets are created.
 * The returned float bed must be quantized by its owner before native Water depth reconciliation.
 */
export function generateTerrainHydrology(input: TerrainHydrologyInput) {
  if (!Number.isSafeInteger(input.seed) || ![input.width, input.depth].every((v) => Number.isFinite(v) && v > 0))
    throw new Error("INVALID_ARGUMENT: finite positive bounds and an integer seed are required.");
  if (input.width > 16384 || input.depth > 16384)
    throw new Error("RESOURCE_LIMIT: Hydrology bounds exceed 16384 metres.");
  if (input.ocean !== undefined && typeof input.ocean !== "boolean")
    throw new Error("INVALID_ARGUMENT: ocean must be boolean.");
  const target = (values: TerrainHydrologyCount | undefined, stream: string) => {
    if (!values) return 0;
    if (values.countMin === undefined || values.countMax === undefined)
      throw new Error("INVALID_ARGUMENT: Both countMin and countMax are required.");
    const count = planningCandidateCount(input.seed, stream, values, 0);
    if (values.countMax > 64) throw new Error("RESOURCE_LIMIT: At most 64 water bodies per kind are supported.");
    return count;
  };
  const riverTarget = target(input.rivers, "rivers:count"),
    lakeTarget = target(input.lakes, "lakes:count");
  if (input.lakes?.allowCarving !== undefined && typeof input.lakes.allowCarving !== "boolean")
    throw new Error("INVALID_ARGUMENT: allowCarving must be boolean.");
  const polygons = input.landPolygons.map((ring) => {
    if (
      ring.length < 3 ||
      ring.some(
        (p) =>
          !Number.isFinite(p.x) || !Number.isFinite(p.z) || p.x < 0 || p.z < 0 || p.x > input.width || p.z > input.depth
      )
    )
      throw new Error("INVALID_ARGUMENT: Land polygons must contain at least three finite in-bounds points.");
    return ring.map((p) => ({ x: p.x, z: p.z }));
  });
  const baseGround = (p: PlanPoint) => {
    const height = input.heightAt(p.x, p.z);
    if (!Number.isFinite(height)) throw new Error("INVALID_ARGUMENT: External terrain returned a nonfinite height.");
    return height;
  };
  const plan: IslandPlan = {
    parameters: {
      seed: input.seed,
      width: input.width,
      depth: input.depth,
      valleyWidth: 0,
      riverWidth: 0,
      mountainHeight: 0
    },
    land: polygons[0] ?? [],
    islands: polygons.slice(1),
    planning: createPlanningData(),
    waters: [],
    rocks: [],
    mountains: [],
    routes: [],
    places: [],
    bridges: [],
    sights: [],
    regions: [],
    buildings: [],
    ridges: [],
    supports: [],
    slopes: [],
    spawn: { x: 0, z: 0 },
    prompt: "",
    raster: { heightSamples: 0, alphaSamples: 0, spacing: 1 }
  };
  const diagnostics = polygons.length
    ? generateRiverRegions(
        plan,
        { ...RIVER_DEFAULTS, countMin: riverTarget, countMax: riverTarget },
        {},
        [],
        baseGround
      )
    : [];
  const mouths = input.ocean ? connectTerrainRiverMouths(plan, baseGround) : new Map<string, TerrainRiverMouth>();
  if (polygons.length)
    diagnostics.push(
      ...generateLakeRegions(
        plan,
        { ...LAKE_DEFAULTS, ...input.lakes, countMin: lakeTarget, countMax: lakeTarget },
        {},
        [],
        baseGround
      )
    );
  for (const [kind, requested] of [
    ["river", riverTarget],
    ["lake", lakeTarget]
  ] as const) {
    if (!polygons.length && requested)
      diagnostics.push({
        id: `${kind}:count`,
        owners: ["world"],
        rule: `${kind}-generation`,
        required: false,
        status: "unknown",
        message: "No land polygons are available.",
        measured: 0,
        limit: requested
      });
  }
  const ground = createPlanningGroundSampler(plan, { baseGround });
  const rivers = plan.waters
    .filter((w) => w.kind === "river")
    .map((w) => {
      const surface = plan.planning!.profiles.find((p) => p.ownerId === w.id && p.kind === "water")!;
      const bed = plan.planning!.profiles.find((p) => p.ownerId === w.id && p.kind === "bed")!;
      return {
        id: w.id,
        mouth: mouths.get(w.id),
        outline: w.outline,
        bankWidthM: w.bankWidthM!,
        speed: w.flowSpeed ?? 0.6,
        points: surface.points.map((p, i) => ({
          id: `${w.id}:${i}`,
          x: p.x,
          z: p.z,
          elevation: p.y,
          width: w.widths?.[i] ?? surface.width,
          depth: p.y - bed.points[i].y
        }))
      };
    });
  const lakes = plan.waters
    .filter((w) => w.kind === "lake")
    .map((w) => ({
      id: w.id,
      shoreline: [w.outline, ...(w.lake!.holes ?? [])].flatMap((ring, r) =>
        ring.map((p, i) => ({ ...p, id: `${w.id}:${r}:${i}`, ring: r ? `hole:${r}` : "shore" }))
      ),
      referenceLevel: w.lake!.referenceLevel,
      levelOffsetM: w.lake!.waterLevel - w.lake!.referenceLevel,
      depthM: w.lake!.depthM,
      bankWidthM: w.bankWidthM!
    }));
  const queries = plan.waters.map((w) => ({
    ring: createPlanningRingQuery(w.outline),
    holes: (w.lake?.holes ?? []).map(createPlanningRingQuery),
    width: w.bankWidthM!
  }));
  return {
    seed: input.seed,
    rivers,
    lakes,
    diagnostics,
    counts: {
      rivers: { target: riverTarget, actual: rivers.length },
      lakes: { target: lakeTarget, actual: lakes.length }
    },
    heightAt: (x: number, z: number) => ground({ x, z }),
    sample: (x: number, z: number) => {
      const point = { x, z };
      let water = false,
        bank = 0;
      for (const q of queries) {
        if (q.holes.some((h) => h.inside(point))) continue;
        if (q.ring.inside(point)) water = true;
        else bank = Math.max(bank, Math.max(0, 1 - q.ring.distance(point, q.width) / q.width));
      }
      return { water, bank };
    }
  };
}
