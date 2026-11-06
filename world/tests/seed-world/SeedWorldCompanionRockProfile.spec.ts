import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { companionRockJob } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/CompanionRocks";
import { ROCK_GENERATION_DEFAULTS } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/GenerationProfile";
import { seedAscentProfile } from "@galacean/engine-terrain/rock-formation/AscentMask";
import { ascendingBoundary } from "@galacean/engine-terrain/rock-formation/AscendingBoundary";
import { RockFormationClient } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Client";
import { readRockFormationSettings } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Settings";
import { decodeCellularModule } from "@galacean/engine-terrain/rock-formation/CellularModule";
import { generateRockFormation } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Generate";
import { rockSurfaceAttributes } from "@galacean/engine-terrain/rock-formation/SurfaceAttributes";
import type { RockFormationJob, RockFormationMesh } from "@galacean/engine-terrain/rock-formation/types";
import type { PlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningDocument";

const sources = [1, 2, 3, 4].map((i) => {
  const bytes = readFileSync(new URL(`../../../packages/terrain/src/data/seed-world/public/atoms/stone-${i}-lod0.glb`, import.meta.url));
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const { min, max } = gltf.accessors[gltf.meshes[0].primitives[0].attributes.POSITION];
  return { id: `cartoon/rock/stone-${i}/v1`, bounds: { min: min as number[], max: max as number[] } };
});
const area = (ring: number[][]) =>
  Math.abs(
    ring.reduce((sum, a, i) => {
      const b = ring[(i + 1) % ring.length];
      return sum + a[0] * b[2] - b[0] * a[2];
    }, 0)
  ) / 2;
const settings = readRockFormationSettings({ entities: {} } as PlanningDocument);
afterEach(() => vi.unstubAllGlobals());

it("keeps broad level platform caps on the four actual scenic-rock envelopes with zero upper-height variation", () => {
  for (const seed of [1, 7, 42])
    for (const { id, bounds } of sources) {
      const job = companionRockJob(id, bounds, seed, "platform", ROCK_GENERATION_DEFAULTS);
      const { geometry } = ascendingBoundary(seedAscentProfile(job.guides[0], job.seed));
      // Zero jitter keeps the whole cap at full height, contracting it slightly
      // more than the old 5% variation. Its footprint must still be mostly cap.
      expect(area(geometry.upperBoundary!) / area(geometry.bottom)).toBeGreaterThan(0.5);
      expect(job.guides[0].heightVariation).toBe(0);
      for (const vertex of geometry.upperBoundary!) expect(vertex[1]).toBeCloseTo(job.guides[0].size[1], 8);
      expect(job.guides[0].size).toEqual([
        bounds.max[0] - bounds.min[0],
        bounds.max[1] - bounds.min[1],
        bounds.max[2] - bounds.min[2]
      ]);
      expect(job.guides[0].center[1] - job.guides[0].size[1] / 2).toBe(0);
      expect(job.origin).toEqual([
        (bounds.min[0] + bounds.max[0]) / 2,
        bounds.min[1],
        (bounds.min[2] + bounds.max[2]) / 2
      ]);
      const peak = companionRockJob(id, bounds, seed, "peak", ROCK_GENERATION_DEFAULTS);
      expect(peak.guides[0]).toMatchObject({
        heightMode: "perlin-ascent",
        slopeMode: "auto",
        slopeVariation: 0.8,
        heightVariation: 0
      });
      expect(peak.guides[0].size[1]).toBe(bounds.max[1] - bounds.min[1]);
      expect(peak.seed).toBe(job.seed);
      expect(peak.origin).toEqual(job.origin);
    }
});

it("generates finite blunt surfaces at the original small-stone height", () => {
  const bytes = readFileSync(
    new URL("../../../packages/terrain/src/rock-formation/assets/asymmetric.glb", import.meta.url)
  );
  const module = decodeCellularModule(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  for (const { id, bounds } of sources) {
    const generate = (kind: "platform" | "peak") => {
      const mesh = generateRockFormation(
        companionRockJob(id, bounds, 1, kind, ROCK_GENERATION_DEFAULTS),
        settings,
        module
      );
      expect(mesh.mesh.indices.length).toBeGreaterThan(0);
      expect(mesh.mesh.positions.every(Number.isFinite)).toBe(true);
      return Math.max(...mesh.mesh.positions.filter((_, i) => i % 3 === 1));
    };
    // The tessellated cap samples the ascent field; allow at most 1 mm of
    // interpolation loss when the authored upper-height variation is zero.
    expect(generate("platform")).toBeGreaterThanOrEqual(
      (bounds.max[1] - bounds.min[1]) * (1 - ROCK_GENERATION_DEFAULTS.platformHeightVariation) - 0.001
    );
    generate("peak");
  }
});

it.each(["vertex-slabs", "cellular-curvature"] as const)(
  "keeps %s companion geometry and painted detail while removing grass support and substrate",
  (surfaceMode) => {
    const bytes = readFileSync(
      new URL("../../../packages/terrain/src/rock-formation/assets/asymmetric.glb", import.meta.url)
    );
    const module = decodeCellularModule(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    let coveredVertices = 0;
    for (const { id, bounds } of sources) {
      const job = companionRockJob(id, bounds, 1, "platform", ROCK_GENERATION_DEFAULTS);
      expect(job.surfaceGrass).toBe(false);
      const bare = generateRockFormation(job, { ...settings, surfaceMode }, module);
      const covered = generateRockFormation({ ...job, surfaceGrass: true }, { ...settings, surfaceMode }, module);
      expect(bare.grass).toBeUndefined();
      coveredVertices += covered.grass!.coverage.filter((value) => value > 0).length;
      expect(bare.mesh).toEqual(covered.mesh);
      expect(bare.painted).toEqual(covered.painted);
      const attributes = rockSurfaceAttributes(bare);
      expect(attributes.data.filter((_, index) => index % attributes.stride === 9).every((value) => value === 0)).toBe(
        true
      );
    }
    expect(coveredVertices).toBeGreaterThan(0);
  }
);

it("reuses companion worker results on replay and only invalidates the changed profile shape", async () => {
  const requests: RockFormationJob[] = [];
  class WorkerStub {
    onmessage?: (event: { data: { id: number; result: RockFormationMesh } }) => void;
    postMessage({ id, job }: { id: number; job: RockFormationJob }) {
      requests.push(job);
      queueMicrotask(() =>
        this.onmessage?.({
          data: {
            id,
            result: {
              id: job.id,
              origin: job.origin,
              owners: [job.guides[0].ownerId],
              mesh: { positions: new Float32Array(0), indices: new Uint32Array(0) },
              stats: { slabs: 0, deformedVertices: 0, generationMs: 1 }
            }
          }
        })
      );
    }
    terminate() {}
  }
  vi.stubGlobal("Worker", WorkerStub);
  const jobs = (profile = ROCK_GENERATION_DEFAULTS) =>
    sources.flatMap(({ id, bounds }) =>
      (["platform", "peak"] as const).map((kind) => companionRockJob(id, bounds, 1, kind, profile))
    );
  const client = new RockFormationClient(),
    signal = new AbortController().signal;
  try {
    const initial = await client.prepareJobs(jobs(), settings, signal);
    const repeated = await client.prepareJobs(
      jobs({ ...ROCK_GENERATION_DEFAULTS, platformShare: 0 }),
      settings,
      signal
    );
    expect(repeated.every((mesh, i) => mesh === initial[i])).toBe(true);
    expect(client.preparationMetrics).toMatchObject({ cached: 8, generated: 0 });
    const edited = await client.prepareJobs(
      jobs({ ...ROCK_GENERATION_DEFAULTS, platformHeightScale: 0.5 }),
      settings,
      signal
    );
    expect(client.preparationMetrics).toMatchObject({ cached: 4, generated: 4 });
    expect(requests).toHaveLength(12);
    expect(edited.every((mesh, i) => (mesh === initial[i]) === (i % 2 === 1))).toBe(true);
    const reset = await client.prepareJobs(jobs(), settings, signal);
    expect(reset.every((mesh, i) => mesh === initial[i])).toBe(true);
  } finally {
    client.dispose();
  }
});
