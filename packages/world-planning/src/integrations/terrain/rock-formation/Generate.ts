import { buildRock, DEFAULT_ROCK } from "@galacean/engine-terrain/rock-formation/generator/rock-body.js";
import { simplifyRock } from "@galacean/engine-terrain/rock-formation/generator/simplify-rock.js";
import { buildGrassCoverage } from "@galacean/engine-terrain/rock-formation/GrassCoverage";
import type { RockSurface } from "@galacean/engine-terrain/rock-formation/types";
import { buildRockGrassSurface } from "@galacean/engine-terrain/rock-formation/GrassSurface";
import { hashSeed, random, clamp } from "@galacean/engine-terrain/rock-formation/math";
import type { RockFormationSettings } from "./Settings.ts";
import type { RockFormationJob, RockFormationMesh, RockObb } from "@galacean/engine-terrain/rock-formation/types";
import { generateMountainSurface } from "./MountainSurface.ts";
import { allocateMountainTriangles } from "./MountainBudget.ts";

/** Stable, correlated variations of one parameter family; never changes a published OBB. */
export function rockParameters(obb: RockObb, seed: number, settings: RockFormationSettings) {
  const r = random(hashSeed(seed, obb.id)),
    shape = settings.shape;
  const variation = settings.variation;
  const broad = clamp(Math.max(obb.size[0], obb.size[2]) / obb.size[1] - 1, 0, 1);
  const relief = (r() - 0.5) * variation;
  const vary = (value: number, amount: number, low = 0, high = 1) =>
    clamp(value + (r() - 0.5) * variation * amount, low, high);
  return {
    ...DEFAULT_ROCK,
    ...shape,
    seed: hashSeed(seed, obb.id),
    obbWidth: obb.size[0],
    obbHeight: obb.size[1],
    obbDepth: obb.size[2],
    topScale: vary(shape.topScale, 0.1, 0.08),
    bottomScale: shape.bottomScale === 0 ? 0 : vary(shape.bottomScale, 0.3, 0.08),
    shoulderScale: vary(shape.shoulderScale, 0.25, 0.08),
    shoulderHeight: vary(shape.shoulderHeight, 0.6, 0.15, 0.9),
    topRoughness: clamp(shape.topRoughness + relief, 0, 1),
    topSlope: vary(shape.topSlope, 35, 0, 75),
    topDirection: shape.topDirection ?? r() * 360,
    wallCount: Math.round(clamp(shape.wallCount * (1 + relief), 4, 28)),
    wallLength: clamp(shape.wallLength * (1 - broad * 0.2) + relief, 0.5, 3),
    wallOverlap: vary(shape.wallOverlap, 0.3),
    wallStrength: clamp(shape.wallStrength + relief * 0.2, 0, 1),
    wallTilt: shape.wallTilt * (r() < 0.5 ? -1 : 1),
    resolution: 32
  };
}

/** Rotate an already metre-sized mesh into its OBB. No fitting to relief bounds or rescaling. */
export function placeRockInObb(source: RockSurface & { cornerNormals?: Float32Array }, obb: RockObb) {
  const positions = new Float32Array(source.positions.length),
    normals = new Float32Array(source.normals.length);
  for (let i = 0; i < positions.length; i += 3) {
    for (let world = 0; world < 3; world++) {
      let position = obb.center[world],
        normal = 0;
      for (let axis = 0; axis < 3; axis++) {
        position += source.positions[i + axis] * obb.axes[axis][world];
        normal += source.normals[i + axis] * obb.axes[axis][world];
      }
      positions[i + world] = position;
      normals[i + world] = normal;
    }
  }
  let cornerNormals: Float32Array | undefined;
  if (source.cornerNormals) {
    cornerNormals = new Float32Array(source.cornerNormals.length);
    for (let i = 0; i < cornerNormals.length; i += 3)
      for (let world = 0; world < 3; world++)
        for (let axis = 0; axis < 3; axis++)
          cornerNormals[i + world] += source.cornerNormals[i + axis] * obb.axes[axis][world];
  }
  return { positions, normals, indices: source.indices, ...(cornerNormals ? { cornerNormals } : {}) };
}

/** One generator and reduction path for both planned formations and streamed ground stones. */
export function generateRockFormation(job: RockFormationJob, settings: RockFormationSettings): RockFormationMesh {
  const started = performance.now();
  let bodies = 0,
    fractureMs = 0,
    carvedTriangles = 0,
    arrangementMs = 0,
    ridgePeaks = 0,
    ridgeBranches = 0;
  let rawTriangles = 0,
    overBudgetBodies = 0,
    buildMs = 0,
    simplifyMs = 0,
    simplifyAttempts = 0;
  if (job.triangleBudget !== undefined && job.kind !== "mountain")
    throw new RangeError("Formation triangle budgets apply to mountain jobs");
  const budgets =
    job.triangleBudget === undefined
      ? undefined
      : allocateMountainTriangles(
          job.guides.map(({ size: [x, y, z] }) => x * y + x * z + y * z),
          job.triangleBudget
        );
  const surfaces = job.guides.map((guide, index) => {
    const mountain = generateMountainSurface(
      budgets ? { ...job, triangleBudget: budgets[index] } : job,
      guide,
      settings
    );
    const source =
      mountain ??
      simplifyRock(buildRock(rockParameters(guide, job.seed, settings)), {
        targetTriangles: settings.targetTriangles
      });
    bodies += mountain?.stats.bodies ?? 1;
    fractureMs += mountain?.stats.fractureMs ?? 0;
    carvedTriangles += mountain?.stats.carvedTriangles ?? 0;
    arrangementMs += mountain?.stats.arrangementMs ?? 0;
    ridgePeaks += mountain?.stats.ridgePeaks ?? 0;
    ridgeBranches += mountain?.stats.ridgeBranches ?? 0;
    rawTriangles += source.stats.rawTriangles ?? source.indices.length / 3;
    buildMs += mountain?.stats.buildMs ?? (source.stats as any).bakeMs ?? 0;
    simplifyMs += source.stats.simplifyMs ?? 0;
    simplifyAttempts += (source.stats as any).attempts ?? 0;
    if (!mountain && !(source.stats as any).budgetMet) overBudgetBodies++;
    overBudgetBodies += mountain?.stats.overBudgetBodies ?? 0;
    const mesh = placeRockInObb(source, guide);
    return {
      guide,
      mesh,
      coverage:
        job.surfaceGrass === false
          ? undefined
          : buildGrassCoverage({ ...source, ...mesh }, (source as any).surfaceRoles)
    };
  });
  const positions = new Float32Array(surfaces.reduce((sum, { mesh }) => sum + mesh.positions.length, 0));
  const normals = new Float32Array(positions.length),
    coverage = new Float32Array(positions.length / 3);
  const indices = new Uint32Array(surfaces.reduce((sum, { mesh }) => sum + mesh.indices.length, 0));
  const cornerNormals = surfaces.some(({ mesh }) => mesh.cornerNormals)
    ? new Float32Array(indices.length * 3)
    : undefined;
  const owners: string[] = [];
  let vertexOffset = 0,
    indexOffset = 0;
  for (const surface of surfaces) {
    const { guide, mesh } = surface;
    positions.set(mesh.positions, vertexOffset);
    normals.set(mesh.normals, vertexOffset);
    if (surface.coverage) coverage.set(surface.coverage, vertexOffset / 3);
    for (let i = 0; i < mesh.indices.length; i++) indices[indexOffset + i] = mesh.indices[i] + vertexOffset / 3;
    if (cornerNormals)
      for (let i = 0; i < mesh.indices.length; i++) {
        const source = mesh.cornerNormals ?? mesh.normals,
          offset = mesh.cornerNormals ? i * 3 : mesh.indices[i] * 3;
        cornerNormals.set(source.subarray(offset, offset + 3), (indexOffset + i) * 3);
      }
    for (let i = 0; i < mesh.indices.length / 3; i++) owners.push(guide.ownerId);
    vertexOffset += mesh.positions.length;
    indexOffset += mesh.indices.length;
  }
  const result: RockFormationMesh = {
    id: job.id,
    origin: [...job.origin],
    owners,
    mesh: { positions, normals, indices, ...(cornerNormals ? { cornerNormals } : {}) },
    textureScale: Math.max(...job.guides.flatMap((guide) => guide.size)) / 2,
    stats: {
      bodies,
      vertices: positions.length / 3,
      rawTriangles,
      targetTriangles: job.triangleBudget ?? settings.targetTriangles,
      overBudgetBodies,
      buildMs,
      simplifyMs,
      simplifyAttempts,
      fractureMs,
      carvedTriangles,
      arrangementMs,
      ridgePeaks,
      ridgeBranches,
      generationMs: 0
    }
  };
  if (job.triangleBudget !== undefined && indices.length / 3 > job.triangleBudget)
    throw new Error(`Mountain ${job.id} exceeds its complete formation triangle budget`);
  if (job.surfaceGrass !== false) result.grass = buildRockGrassSurface(result, normals, coverage);
  result.stats.generationMs = performance.now() - started;
  return result;
}
