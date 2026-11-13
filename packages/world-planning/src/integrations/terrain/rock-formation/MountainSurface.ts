import { buildRock } from "@galacean/engine-terrain/rock-formation/generator/rock-body.js";
import { simplifyRock } from "@galacean/engine-terrain/rock-formation/generator/simplify-rock.js";
import { MeshoptSimplifier } from "@galacean/engine-terrain/rock-formation/generator/vendor/meshopt_simplifier.js";
import {
  createRuntimeMountainBuilder,
  createShapingFeature,
  createArrangementFeature
} from "@galacean/engine-terrain/rock-ridge/runtime-rocks.mjs";
import { fracturedRockLibrary } from "@galacean/engine-terrain/rock-ridge/features/shaping/rock-surface.mjs";
import { transformedVertices } from "@galacean/engine-terrain/rock-ridge/ridge-utils.mjs";
import type {
  RockFormationJob,
  RockFormationMesh,
  RockObb,
  RockSurface
} from "@galacean/engine-terrain/rock-formation/types";
import type { RockFormationSettings } from "./Settings.ts";

// This is a dimensionless authoring domain, not a stored mountain recipe. Each
// topology is grown from its job seed, then mapped into the published OBB.
const source = {
  id: "peaks",
  extent: [-56, 56, -41, 42],
  rocks: [],
  guides: [],
  labels: [],
  terrain: { positions: [-56, 0, -41, 56, 0, -41, 56, 0, 42, -56, 0, 42], indices: [0, 2, 1, 0, 3, 2] },
  camera: { target: [0, 15, 0] }
};

/** BSP fragments are reduced without moving vertices. A 0.05% relative error
 * ceiling protects the vertical cuts; render normals are kept per face below.
 * This production stage is injected; the study keeps its full carving output. */
function reduceCarvedLibrary(geometries: Record<string, any>, fractures: unknown, budget: number) {
  return Object.fromEntries(
    Object.entries(fracturedRockLibrary(geometries, fractures)).map(([id, value]) => {
      const geometry = value as any;
      const [reduced] = MeshoptSimplifier.simplify(
        new Uint32Array(geometry.indices),
        new Float32Array(geometry.positions),
        3,
        budget * 3,
        0.0005,
        ["LockBorder"]
      );
      const remap = new Map<number, number>(),
        positions: number[] = [],
        normals: number[] = [];
      const indices = Array.from(reduced, (old) => {
        if (!remap.has(old)) {
          remap.set(old, remap.size);
          positions.push(...geometry.positions.slice(old * 3, old * 3 + 3));
          normals.push(...geometry.normals.slice(old * 3, old * 3 + 3));
        }
        return remap.get(old)!;
      });
      return [
        id,
        {
          ...geometry,
          positions,
          normals,
          indices,
          faceTags: undefined,
          stats: { ...geometry.stats, rawTriangles: geometry.indices.length / 3, triangles: indices.length / 3 }
        }
      ];
    })
  );
}

function createMountainPipeline(budget: number) {
  const build = createRuntimeMountainBuilder({
    stages: [
      createShapingFeature({
        carve: (geometries: Record<string, any>, fractures: unknown) =>
          reduceCarvedLibrary(geometries, fractures, budget)
      }),
      createArrangementFeature({
        inspect: (input: any, geometries: any) => ({
          ...input,
          rocks: [{ id: "summit", mesh: "peak", x: 0, y: -geometries.peak.bounds[0][1], z: 0, yaw: 0, scale: 1 }]
        })
      })
    ]
  });
  return {
    budget,
    build,
    cache: {},
    kernel: {
      buildRock,
      simplifyRock: (raw: ReturnType<typeof buildRock>) => simplifyRock(raw, { targetTriangles: budget })
    }
  };
}
// One world library + bounded stage caches. This lives in the existing worker,
// never the render loop. Changing counts does not rebuild/carve the atoms.
let pipeline: ReturnType<typeof createMountainPipeline> | undefined;

export interface MountainSurface extends RockSurface {
  cornerNormals: Float32Array;
  stats: RockFormationMesh["stats"];
}

/** Native placement adapter. Decorative and streamed stones retain their own path. */
export function generateMountainSurface(
  job: RockFormationJob,
  guide: RockObb,
  settings: RockFormationSettings
): MountainSurface | undefined {
  const controls = settings.mountain;
  if (job.kind !== "mountain" || !controls || (!controls.ridgeArrangement && !controls.rockShaping)) return;
  if (!pipeline || pipeline.budget !== settings.targetTriangles)
    pipeline = createMountainPipeline(settings.targetTriangles);
  const result = pipeline.build(
    pipeline.kernel,
    {
      source,
      seed: job.seed,
      atomSeed: job.worldSeed ?? job.seed,
      mode: controls.ridgePerlin ? "perlin" : "direct",
      topology: { seeded: controls.ridgeSeededCounts, peaks: controls.ridgePeaks, branches: controls.ridgeBranches },
      noise: {
        frequency: controls.ridgeFrequency,
        octaves: controls.ridgeOctaves,
        lacunarity: controls.ridgeLacunarity,
        persistence: controls.ridgePersistence
      },
      fractures: {
        depth: controls.fractureDepth,
        width: controls.fractureWidth,
        irregularity: controls.fractureIrregularity
      },
      features: { arrangement: controls.ridgeArrangement, shaping: controls.rockShaping }
    },
    pipeline.cache
  );
  const bodies = result.scene.rocks.map((rock: any) => ({
    geometry: result.geometries[rock.mesh],
    vertices: transformedVertices(rock, result.geometries[rock.mesh])
  }));
  const low = [Infinity, Infinity, Infinity],
    high = [-Infinity, -Infinity, -Infinity];
  for (const body of bodies)
    for (const point of body.vertices)
      for (let d = 0; d < 3; d++) {
        low[d] = Math.min(low[d], point[d]);
        high[d] = Math.max(high[d], point[d]);
      }
  const scale = guide.size.map((size, d) => size / Math.max(1e-6, high[d] - low[d]));
  const positions = new Float32Array(bodies.reduce((sum: number, b: any) => sum + b.vertices.length * 3, 0));
  const normals = new Float32Array(positions.length);
  const indices = new Uint32Array(bodies.reduce((sum: number, b: any) => sum + b.geometry.indices.length, 0));
  let vertex = 0,
    index = 0;
  for (const body of bodies) {
    for (let i = 0; i < body.vertices.length; i++)
      for (let d = 0; d < 3; d++)
        positions[(vertex + i) * 3 + d] = (body.vertices[i][d] - low[d]) * scale[d] - guide.size[d] / 2;
    for (const old of body.geometry.indices) indices[index++] = vertex + old;
    vertex += body.vertices.length;
  }
  // Canonical indexed surface for fitting/collision; hard corner normals for
  // rendering, including under nonuniform OBB scaling. No smoothing across cuts.
  const cornerNormals = new Float32Array(indices.length * 3);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3,
      b = indices[t + 1] * 3,
      c = indices[t + 2] * 3;
    const ux = positions[b] - positions[a],
      uy = positions[b + 1] - positions[a + 1],
      uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a],
      vy = positions[c + 1] - positions[a + 1],
      vz = positions[c + 2] - positions[a + 2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx],
      length = Math.hypot(...n) || 1;
    for (let corner = 0; corner < 3; corner++)
      for (let d = 0; d < 3; d++) {
        normals[indices[t + corner] * 3 + d] += n[d];
        cornerNormals[(t + corner) * 3 + d] = n[d] / length;
      }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    for (let d = 0; d < 3; d++) normals[i + d] /= length;
  }
  const plan = result.scene.ridge?.plan;
  return {
    positions,
    normals,
    cornerNormals,
    indices,
    bounds: [guide.size.map((v) => -v / 2), guide.size.map((v) => v / 2)],
    stats: {
      bodies: bodies.length,
      vertices: vertex,
      generationMs: result.timings.totalMs,
      rawTriangles: bodies.reduce(
        (sum: number, body: any) => sum + (body.geometry.stats.rawTriangles ?? body.geometry.indices.length / 3),
        0
      ),
      overBudgetBodies: bodies.filter((body: any) => body.geometry.indices.length / 3 > settings.targetTriangles)
        .length,
      buildMs: result.timings.baseMs,
      fractureMs: result.timings.fractureMs,
      arrangementMs: result.timings.fitMs,
      ridgePeaks: plan?.nodes.filter((n: any) => n.role === "peak").length ?? 0,
      ridgeBranches: plan?.curves.filter((c: any) => c.kind === "branch").length ?? 0
    }
  };
}
