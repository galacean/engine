import type { LakeBoundaryV1 } from "@galacean/engine-water/water/index";
import {
  sampleLakeBoundary,
  sampleLakeSignedShoreDistance,
  hashStableValue
} from "@galacean/engine-water/water/compiler/index";

import type { GrasslandsTerrainRecipe, GrasslandsVector3 } from "../GrasslandsPcgTypes.ts";
import { sampleGrasslandsTerrainModelHeight } from "../GrasslandsTerrainModel.ts";
import { LAKE_MODELS } from "./LakeLandscapeAssetCatalog.ts";

export type LakeLandscapeZone = "tree" | "fern" | "shore-rock" | "shallow-rock" | "deep-rock";
export interface LakeLandscapePlacement {
  readonly id: string;
  readonly model: (typeof LAKE_MODELS)[number]["id"];
  readonly position: GrasslandsVector3;
  readonly scale: number;
  readonly yaw: number;
  readonly pitch: number;
}
export interface LakeLandscapeSample extends LakeLandscapePlacement {
  readonly zone: LakeLandscapeZone;
  /** Horizontal clearance, not canopy radius. Canopies may overhang the water. */
  readonly radius: number;
  readonly shoreDistance: number;
  readonly depth: number;
  readonly slope: number;
}
export interface LakeLandscapeLayout {
  readonly sourceHash: string;
  readonly seed: number;
  readonly hash: string;
  readonly placements: readonly LakeLandscapeSample[];
}
export interface LakeLandscapeExclusion {
  readonly position: GrasslandsVector3;
  readonly radius: number;
}

export function lakeLandscapeSourceHash(terrain: GrasslandsTerrainRecipe, boundary: LakeBoundaryV1): string {
  return hashStableValue({ terrain: terrain.heightfield?.hash ?? terrain, boundary });
}

/** Water -> scenery: consumes published shore/bed facts and never changes them. */
export function createLakeLandscapeLayout(
  terrain: GrasslandsTerrainRecipe,
  boundary: LakeBoundaryV1,
  seed: number,
  exclusions: readonly LakeLandscapeExclusion[] = []
): LakeLandscapeLayout {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError("Landscape seed must be uint32.");
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rings = sampleLakeBoundary(boundary).rings;
  let perimeter = 0;
  const segments = rings.flatMap((ring) =>
    ring.map((a, i) => {
      const b = ring[(i + 1) % ring.length];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const start = perimeter;
      perimeter += length;
      return { a, b, start, length };
    })
  );
  const shorePoint = (arc: number) => {
    const segment = segments.find((s) => arc < s.start + s.length) ?? segments[segments.length - 1];
    const t = (arc - segment.start) / segment.length;
    return [segment.a[0] + (segment.b[0] - segment.a[0]) * t, segment.a[1] + (segment.b[1] - segment.a[1]) * t];
  };
  const phase = random();
  const clusters = Array.from({ length: 6 }, (_, i) =>
    shorePoint((((i + phase + random() * 0.45) / 6) % 1) * perimeter)
  );
  const points = rings.flat();
  const minZ = Math.min(...points.map((p) => p[1])),
    maxZ = Math.max(...points.map((p) => p[1]));
  const sampleHeight = (x: number, z: number) => sampleGrasslandsTerrainModelHeight(terrain, x, z);
  const placements: LakeLandscapeSample[] = [];
  const groups: { zone: LakeLandscapeZone; count: number; models: LakeLandscapePlacement["model"][] }[] = [
    { zone: "tree", count: 7, models: ["china-pine", "greeting-pine", "maple"] },
    { zone: "shore-rock", count: 16, models: ["shore-boulder", "bed-clump", "bed-rock"] },
    { zone: "fern", count: 32, models: ["fern"] },
    { zone: "shallow-rock", count: 12, models: ["bed-rock", "bed-clump", "bed-pebble"] },
    { zone: "deep-rock", count: 4, models: ["bed-rock", "bed-pebble"] }
  ];
  for (const { zone, count, models } of groups) {
    let accepted = 0;
    for (let attempt = 0; attempt < count * 100 && accepted < count; attempt++) {
      const center = clusters[Math.floor(random() * clusters.length)];
      const angle = random() * Math.PI * 2;
      const spread = zone === "deep-rock" ? 18 : zone === "tree" ? 11 : 6;
      const offset = Math.sqrt(random()) * spread;
      const x = center[0] + Math.cos(angle) * offset,
        z = center[1] + Math.sin(angle) * offset;
      const bed = sampleHeight(x, z);
      const slope =
        Math.hypot(
          sampleHeight(x + 0.35, z) - sampleHeight(x - 0.35, z),
          sampleHeight(x, z + 0.35) - sampleHeight(x, z - 0.35)
        ) / 0.7;
      const depth = boundary.waterLevel - bed;
      if (!Number.isFinite(bed + slope)) continue;
      const distance = sampleLakeSignedShoreDistance(rings, x, z);
      const model = models[Math.floor(random() * models.length)];
      const radius =
        zone === "tree"
          ? 2.8 + random()
          : zone === "fern"
            ? 0.45 + random() * 0.25
            : 0.35 + random() * (zone === "shore-rock" ? 1 : 0.4);
      if (zone === "tree" && !(distance < -2.5 && distance > -9 && depth < -0.25 && slope < 0.65)) continue;
      // Keep a sparse foreground so the default view still exposes the lake and refraction probes.
      if (zone === "tree" && z > minZ + (maxZ - minZ) * 0.65 && random() > 0.15) continue;
      if (zone === "fern" && !(distance < -0.4 && distance > -4.5 && depth < -0.08 && slope < 0.8)) continue;
      if (zone === "shore-rock" && !(distance > -3.5 && distance < 1.3 && depth < 0.65 && slope < 1.2)) continue;
      if (zone === "shallow-rock" && !(distance > 0.5 && depth > 0.3 && depth < 1.4 && slope < 1)) continue;
      if (zone === "deep-rock" && !(depth > 1.6 && distance > 3 && slope < 0.8)) continue;
      if (
        [...exclusions, ...placements].some((p) => Math.hypot(p.position[0] - x, p.position[2] - z) < p.radius + radius)
      )
        continue;
      const spec = LAKE_MODELS.find((s) => s.id === model)!;
      const size = Math.max(
        spec.bounds.maximum[0] - spec.bounds.minimum[0],
        spec.bounds.maximum[2] - spec.bounds.minimum[2]
      );
      let scale = zone === "tree" ? 0.48 + random() * 0.22 : (radius * 2) / size;
      if (zone === "shallow-rock" || zone === "deep-rock")
        scale = Math.min(scale, (depth * 0.72) / (spec.bounds.maximum[1] - spec.bounds.minimum[1]));
      const burial = zone === "tree" ? 0.06 : zone === "fern" ? 0.015 : radius * 0.25;
      placements.push({
        id: `lake-${zone}-${accepted++}`,
        model,
        zone,
        position: [x, bed - burial, z],
        scale,
        yaw: random() * 360,
        pitch: 0,
        radius,
        shoreDistance: distance,
        depth,
        slope
      });
    }
  }
  const sourceHash = lakeLandscapeSourceHash(terrain, boundary);
  return { sourceHash, seed, hash: hashStableValue({ sourceHash, seed, placements }), placements };
}
