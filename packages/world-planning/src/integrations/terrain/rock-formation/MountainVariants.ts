import { generateMountainExamples } from "@galacean/engine-terrain/rock-ridge/features/arrangement/mountain-examples.mjs";
import { hashSeed, random } from "@galacean/engine-terrain/rock-formation/math";
import type { RockFormationJob, RockFormationMesh } from "@galacean/engine-terrain/rock-formation/types";

export const MOUNTAIN_VARIANT_COUNT = 10;
export const MOUNTAIN_VARIANT_TRIANGLES = 1000;
const sets = new Map<number, ReturnType<typeof generateMountainExamples>>();

/** Round-robin stable identities so every member appears before the set repeats.
 * Placement size/position edits do not reshuffle the mountain selection. */
export function assignMountainVariants(jobs: RockFormationJob[], enabled: boolean): RockFormationJob[] {
  if (!enabled) return jobs;
  const ids = jobs
    .filter((job) => job.kind === "mountain")
    .map((job) => job.id)
    .sort();
  const variants = new Map(ids.map((id, index) => [id, index % MOUNTAIN_VARIANT_COUNT]));
  return jobs.map((job) => {
    if (job.kind !== "mountain") return job;
    const r = random(hashSeed(job.worldSeed ?? job.seed, `${job.id}:mountain-placement`));
    return {
      ...job,
      mountainVariant: variants.get(job.id)!,
      mountainTransform: { zoom: 0.8 + r() * 0.2, skew: [(r() - 0.5) * 0.4, (r() - 0.5) * 0.4] as [number, number] },
      triangleBudget: MOUNTAIN_VARIANT_TRIANGLES
    };
  });
}

/** Called in the geometry worker. Grow one shared set per world seed; no baked
 * profiles or per-placement selection work on the render thread. */
export function resolveMountainVariant(job: RockFormationJob): RockFormationJob {
  if (job.kind !== "mountain" || job.mountainVariant === undefined) return job;
  if (
    !Number.isInteger(job.mountainVariant) ||
    job.mountainVariant < 0 ||
    job.mountainVariant >= MOUNTAIN_VARIANT_COUNT
  )
    throw new RangeError("Mountain variant must be an index in the ten-member set");
  const seed = (job.worldSeed ?? job.seed) >>> 0;
  let set = sets.get(seed);
  if (!set) {
    set = generateMountainExamples(seed, MOUNTAIN_VARIANT_COUNT);
    sets.set(seed, set);
    if (sets.size > 2) sets.delete(sets.keys().next().value!);
  }
  const example = set.examples[job.mountainVariant];
  return { ...job, seed: example.seed, atomicSeed: example.atomicSeed };
}

export function mountainVariantSummary(meshes: readonly RockFormationMesh[]) {
  const mountains = meshes.filter((mesh) => mesh.stats.mountainVariant !== undefined);
  return {
    variants: [...new Set(mountains.map((mesh) => mesh.stats.mountainVariant!))].sort((a, b) => a - b),
    instances: mountains.length,
    maximumTriangles: Math.max(0, ...mountains.map((mesh) => mesh.mesh.indices.length / 3)),
    carvedTriangles: mountains.reduce((sum, mesh) => sum + (mesh.stats.carvedTriangles ?? 0), 0)
  };
}
