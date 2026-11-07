import { simplifierReady } from "../../../packages/terrain/src/rock-formation/generator/simplify-rock.js";
import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { companionRockJob } from "../../../packages/world-planning/src/integrations/terrain/rock-formation/CompanionRocks.ts";
import { ROCK_GENERATION_DEFAULTS } from "../../../packages/world-planning/src/integrations/terrain/rock-formation/GenerationProfile.ts";
import { RockFormationClient } from "../../../packages/world-planning/src/integrations/terrain/rock-formation/Client.ts";
import { readRockFormationSettings } from "../../../packages/world-planning/src/integrations/terrain/rock-formation/Settings.ts";
import { generateRockFormation } from "../../../packages/world-planning/src/integrations/terrain/rock-formation/Generate.ts";
import { rockSurfaceAttributes } from "../../../packages/terrain/src/rock-formation/SurfaceAttributes.ts";
import type { RockFormationJob, RockFormationMesh } from "../../../packages/terrain/src/rock-formation/types.ts";
import type { PlanningDocument } from "../../../packages/world-planning/src/spatial/PlanningDocument.ts";

const sources = [1, 2, 3, 4].map((i) => {
  const bytes = readFileSync(
    new URL(`../../../packages/terrain/src/data/seed-world/public/atoms/stone-${i}-lod0.glb`, import.meta.url)
  );
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const { min, max } = gltf.accessors[gltf.meshes[0].primitives[0].attributes.POSITION];
  return { id: `cartoon/rock/stone-${i}/v1`, bounds: { min: min as number[], max: max as number[] } };
});
await simplifierReady;
const settings = readRockFormationSettings({ entities: {} } as PlanningDocument);
afterEach(() => vi.unstubAllGlobals());

it("preserves the four ground-stone placement envelopes without loading their geometry", () => {
  for (const seed of [1, 7, 42])
    for (const { id, bounds } of sources) {
      const job = companionRockJob(id, bounds, seed, "platform", ROCK_GENERATION_DEFAULTS);
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
      expect(peak.guides[0].size[1]).toBe(bounds.max[1] - bounds.min[1]);
      expect(peak.seed).not.toBe(job.seed);
      expect(peak.origin).toEqual(job.origin);
    }
});

it("generates finite reduced surfaces inside the original small-stone OBBs", () => {
  for (const { id, bounds } of sources) {
    const job = companionRockJob(id, bounds, 1, "platform", ROCK_GENERATION_DEFAULTS);
    const mesh = generateRockFormation(job, settings),
      guide = job.guides[0];
    expect(mesh.mesh.indices.length).toBeGreaterThan(0);
    expect(mesh.mesh.positions.every(Number.isFinite)).toBe(true);
    expect(mesh.mesh.indices.length / 3).toBeLessThanOrEqual(1000);
    expect(mesh.stats).toMatchObject({ targetTriangles: 1000, overBudgetBodies: 0 });
    for (let i = 0; i < mesh.mesh.positions.length; i++) {
      const axis = i % 3;
      expect(Math.abs(mesh.mesh.positions[i] - guide.center[axis])).toBeLessThanOrEqual(guide.size[axis] / 2 + 1e-5);
    }
    expect(Math.max(...mesh.mesh.positions.filter((_, i) => i % 3 === 1))).toBeGreaterThan(guide.size[1] * 0.85);
  }
}, 30000);

it("uses the same rock geometry while disabling grass support on companion stones", () => {
  const { id, bounds } = sources[0];
  const job = companionRockJob(id, bounds, 1, "platform", ROCK_GENERATION_DEFAULTS);
  expect(job.surfaceGrass).toBe(false);
  const bare = generateRockFormation(job, settings);
  const covered = generateRockFormation({ ...job, surfaceGrass: true }, settings);
  expect(bare.grass).toBeUndefined();
  expect(covered.grass!.coverage.some((value) => value > 0)).toBe(true);
  expect(bare.mesh).toEqual(covered.mesh);
  const attributes = rockSurfaceAttributes(bare);
  expect(attributes.data.filter((_, index) => index % attributes.stride === 9).every((value) => value === 0)).toBe(
    true
  );
}, 30000);

it("records exactly the original GLB bounds as metadata for resource-free placement", () => {
  for (const path of [
    "../../../packages/terrain/src/data/seed-world/public/production-catalog.json",
    "../../../packages/vegetation/src/asset-assembly/generated/procedural-trees/plant-project-production-catalog.json"
  ]) {
    const manifest = JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
    for (const source of sources)
      expect(manifest.stoneVariants.find((entry: { id: string }) => entry.id === source.id).geometryBounds).toEqual(
        source.bounds
      );
  }
});

it("reuses companion worker results on replay and only invalidates the changed profile shape", async () => {
  const requests: RockFormationJob[] = [];
  class WorkerStub {
    onmessage?: (event: { data: { id?: number; result?: RockFormationMesh; ready?: boolean } }) => void;
    constructor() {
      queueMicrotask(() => this.onmessage?.({ data: { ready: true } }));
    }
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
              stats: { bodies: 0, vertices: 0, generationMs: 1 }
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
    await client.prepareJobs(jobs(), { ...settings, targetTriangles: 2000 }, signal);
    expect(client.preparationMetrics).toMatchObject({ cached: 0, generated: 8 });
  } finally {
    client.dispose();
  }
});

it("different placement identities produce different deterministic geometry within the same OBB", () => {
  const bounds = sources[0].bounds;
  const jobs = ["stone-a", "stone-b", "stone-c"].map((id) =>
    companionRockJob(id, bounds, 1, "platform", ROCK_GENERATION_DEFAULTS)
  );
  const meshes = jobs.map((job) => generateRockFormation(job, settings));
  expect(generateRockFormation(jobs[0], settings).mesh).toEqual(meshes[0].mesh);
  expect(meshes[1].mesh.positions).not.toEqual(meshes[0].mesh.positions);
  expect(meshes[2].mesh.positions).not.toEqual(meshes[1].mesh.positions);
  for (const mesh of meshes) expect(mesh.textureScale).toBe(Math.max(...jobs[0].guides[0].size) / 2);
}, 30000);
