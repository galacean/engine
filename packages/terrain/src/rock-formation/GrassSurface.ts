import { smoothstep } from "./math";
import { hashSeed } from "./math";
import { buildGrassCoverage } from "./GrassCoverage";
import type { RockFormationMesh, V3 } from "./types";

/** Smaller than terrain residency cells: one edit/upload never compiles a whole mountain. */
export const ROCK_GRASS_PATCH_METRES = 8;
export const ROCK_GRASS_UPLOAD_INSTANCES = 512;
const ROOT_LIFT = 0.015;
const SUPPORT_RADIUS = 0.06;
const SUPPORT_HEIGHT_TOLERANCE = 0.08;
const EMPTY = new Float32Array(0);

export interface RockGrassPatch {
  x: number;
  z: number;
  minimumY: number;
  maximumY: number;
  /** Includes a root-sized halo so support probes can cross patch boundaries. */
  triangles: Uint32Array;
}

export interface RockGrassSurface {
  /** Continuous vertex coverage expanded to canonical triangle corners; independent of rock relief. */
  coverage: Float32Array;
  /** Geometric face normals and areas, computed after every positional deformation. */
  normals: Float32Array;
  areas: Float32Array;
  seeds: Uint32Array;
  patches: RockGrassPatch[];
}

/** Topology preparation; no asset, renderer, DOM or terrain sampling dependencies. */
export function buildRockGrassSurface(
  formation: RockFormationMesh,
  vertexNormals: Float32Array,
  authoredCoverage?: Float32Array
): RockGrassSurface {
  const { positions: p, indices } = formation.mesh;
  const triangles = indices.length / 3;
  const coverage = new Float32Array(indices.length),
    normals = new Float32Array(indices.length);
  const areas = new Float32Array(triangles),
    seeds = new Uint32Array(triangles);
  const vertexCoverage =
    authoredCoverage ??
    buildGrassCoverage({
      positions: p,
      indices,
      normals: vertexNormals,
      bounds: [
        [0, 0, 0],
        [0, 0, 0]
      ]
    });
  const patches = new Map<string, Omit<RockGrassPatch, "triangles"> & { triangles: number[] }>();
  for (let t = 0; t < triangles; t++) {
    const a = indices[t * 3] * 3,
      b = indices[t * 3 + 1] * 3,
      c = indices[t * 3 + 2] * 3;
    const ux = p[b] - p[a],
      uy = p[b + 1] - p[a + 1],
      uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a],
      vy = p[c + 1] - p[a + 1],
      vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    if (length < 1e-10) continue;
    normals.set([nx / length, ny / length, nz / length], t * 3);
    // Physical blade support remains face-specific, including on faces whose
    // material receives a soft fringe from an adjacent meadow.
    const support = Math.max(0, ny / length - 0.1);
    if (support === 0) continue;
    areas[t] = length * 0.5;
    // Position identities survive index reordering and render-only corner expansion.
    const identity = [a, b, c]
      .map((k) => [p[k], p[k + 1], p[k + 2]].map((v) => Math.round(v * 10000)).join(","))
      .sort()
      .join("/");
    seeds[t] = hashSeed(0, `${formation.id}/${formation.owners[t]}/${identity}`);
    const minX = Math.floor((Math.min(p[a], p[b], p[c]) - SUPPORT_RADIUS) / ROCK_GRASS_PATCH_METRES);
    const maxX = Math.floor((Math.max(p[a], p[b], p[c]) + SUPPORT_RADIUS) / ROCK_GRASS_PATCH_METRES);
    const minZ = Math.floor((Math.min(p[a + 2], p[b + 2], p[c + 2]) - SUPPORT_RADIUS) / ROCK_GRASS_PATCH_METRES);
    const maxZ = Math.floor((Math.max(p[a + 2], p[b + 2], p[c + 2]) + SUPPORT_RADIUS) / ROCK_GRASS_PATCH_METRES);
    for (let x = minX; x <= maxX; x++)
      for (let z = minZ; z <= maxZ; z++) {
        const key = `${x}/${z}`;
        let patch = patches.get(key);
        if (!patch) patches.set(key, (patch = { x, z, minimumY: Infinity, maximumY: -Infinity, triangles: [] }));
        patch.triangles.push(t);
        patch.minimumY = Math.min(patch.minimumY, p[a + 1], p[b + 1], p[c + 1]);
        patch.maximumY = Math.max(patch.maximumY, p[a + 1], p[b + 1], p[c + 1]);
      }
  }
  for (let corner = 0; corner < indices.length; corner++) coverage[corner] = vertexCoverage[indices[corner]];
  return {
    coverage,
    normals,
    areas,
    seeds,
    patches: [...patches.values()].map((patch) => ({ ...patch, triangles: Uint32Array.from(patch.triangles) }))
  };
}

export interface RockGrassSampling {
  density: number;
  minimumScale: number;
  maximumScale: number;
  /** Radius measured from the native grass asset's root band, before instance scale. */
  rootRadius?: number;
  /** Height-aware exclusions; a numeric result is Seed World's authored ecology abundance [0,1].
   * Never use the ground terrain's 2D mask, which removes the rock's entire footprint. */
  allowed: (x: number, y: number, z: number) => boolean | number;
}

export interface RockGrassCompilationMetrics {
  candidates: number;
  accepted: number;
  unsupported: number;
  excluded: number;
}

/** Interruptible CPU work; yields at most eight candidates or one bounded GPU upload at a time.
 * Barycentric roots and geometric normals use the same final mesh and placement as collision. */
export function* compileRockGrassPatch(
  formation: RockFormationMesh,
  patch: RockGrassPatch,
  origin: V3,
  sampling: RockGrassSampling,
  metrics: RockGrassCompilationMetrics
): Generator<Float32Array | undefined, void> {
  if (sampling.density === 0) return;
  if (
    ![sampling.density, sampling.minimumScale, sampling.maximumScale].every(Number.isFinite) ||
    sampling.density < 0 ||
    sampling.minimumScale <= 0 ||
    sampling.maximumScale < sampling.minimumScale ||
    (sampling.rootRadius !== undefined && (!Number.isFinite(sampling.rootRadius) || sampling.rootRadius < 0))
  )
    throw Error("Invalid rock grass density or scale");
  const grass = formation.grass!,
    { positions: p, indices } = formation.mesh;
  let buffer = EMPTY,
    count = 0,
    work = 0;
  const minX = patch.x * ROCK_GRASS_PATCH_METRES,
    minZ = patch.z * ROCK_GRASS_PATCH_METRES;
  for (const t of patch.triangles) {
    if (!(grass.coverage[t * 3] || grass.coverage[t * 3 + 1] || grass.coverage[t * 3 + 2])) {
      yield;
      continue;
    }
    const seed = grass.seeds[t],
      expected = grass.areas[t] * sampling.density;
    const candidates = Math.floor(expected) + Number(random(seed, 1) < expected % 1);
    const a = indices[t * 3] * 3,
      b = indices[t * 3 + 1] * 3,
      c = indices[t * 3 + 2] * 3;
    for (let ordinal = 0; ordinal < candidates; ordinal++) {
      if (++work % 8 === 0) yield;
      const key = hashSeed(seed, String(ordinal));
      const root = Math.sqrt(random(key, 2)),
        wa = 1 - root,
        wb = root * (1 - random(key, 3)),
        wc = 1 - wa - wb;
      const x = wa * p[a] + wb * p[b] + wc * p[c],
        z = wa * p[a + 2] + wb * p[b + 2] + wc * p[c + 2];
      if (x < minX || x >= minX + ROCK_GRASS_PATCH_METRES || z < minZ || z >= minZ + ROCK_GRASS_PATCH_METRES) continue;
      metrics.candidates++;
      const cover = wa * grass.coverage[t * 3] + wb * grass.coverage[t * 3 + 1] + wc * grass.coverage[t * 3 + 2];
      const substrateCoverage = cover;
      // Finish blades inside the meadow transition, before bare stone. Sparse
      // coverage must not leave isolated clumps with a 55% minimum height.
      const edgeScale = smoothstep(0.25, 0.7, Math.min(cover, substrateCoverage));
      if (edgeScale === 0) continue;
      if (random(key, 4) >= cover) continue;
      const y = wa * p[a + 1] + wb * p[b + 1] + wc * p[c + 1];
      const nx = grass.normals[t * 3],
        ny = grass.normals[t * 3 + 1],
        nz = grass.normals[t * 3 + 2];
      const scale = sampling.minimumScale + random(key, 5) * (sampling.maximumScale - sampling.minimumScale);
      const radius = sampling.rootRadius === undefined ? SUPPORT_RADIUS : sampling.rootRadius * scale;
      let supported = true;
      for (const [dx, dz] of [
        [radius, 0],
        [-radius, 0],
        [0, radius],
        [0, -radius]
      ]) {
        if (!hasSupport(formation, patch, x + dx, y - (nx * dx + nz * dz) / ny, z + dz)) {
          supported = false;
          break;
        }
      }
      if (!supported) {
        metrics.unsupported++;
        continue;
      }
      const allowance = sampling.allowed(x + origin[0], y + origin[1], z + origin[2]);
      if (!allowance || (typeof allowance === "number" && random(key, 8) >= allowance)) {
        metrics.excluded++;
        continue;
      }
      if (!buffer.length) buffer = new Float32Array(ROCK_GRASS_UPLOAD_INSTANCES * 13);
      const height = scale * (0.55 + 0.45 * Math.sqrt(cover)) * edgeScale;
      const shadingNormals = formation.mesh.normals!;
      const normalA = a;
      const normalB = b;
      const normalC = c;
      const sx = wa * shadingNormals[normalA] + wb * shadingNormals[normalB] + wc * shadingNormals[normalC];
      const sy = wa * shadingNormals[normalA + 1] + wb * shadingNormals[normalB + 1] + wc * shadingNormals[normalC + 1];
      const sz = wa * shadingNormals[normalA + 2] + wb * shadingNormals[normalB + 2] + wc * shadingNormals[normalC + 2];
      const normalLength = Math.hypot(sx, sy, sz) || 1;
      buffer.set(
        [
          x + origin[0] + nx * ROOT_LIFT,
          y + origin[1] + ny * ROOT_LIFT,
          z + origin[2] + nz * ROOT_LIFT,
          random(key, 6) * Math.PI * 2,
          scale * edgeScale,
          height,
          scale * edgeScale,
          substrateCoverage,
          0,
          0,
          sx / normalLength,
          sy / normalLength,
          sz / normalLength
        ],
        count * 13
      );
      count++;
      metrics.accepted++;
      if (count === ROCK_GRASS_UPLOAD_INSTANCES) {
        yield buffer;
        buffer = EMPTY;
        count = 0;
      }
    }
    yield;
  }
  if (count) yield buffer.slice(0, count * 13);
}

function hasSupport(formation: RockFormationMesh, patch: RockGrassPatch, x: number, y: number, z: number): boolean {
  const px = Math.floor(x / ROCK_GRASS_PATCH_METRES),
    pz = Math.floor(z / ROCK_GRASS_PATCH_METRES);
  if (px !== patch.x || pz !== patch.z) {
    const neighbor = formation.grass!.patches.find((patch) => patch.x === px && patch.z === pz);
    if (!neighbor) return false;
    patch = neighbor;
  }
  const { positions: p, indices } = formation.mesh;
  for (const t of patch.triangles) {
    const a = indices[t * 3] * 3,
      b = indices[t * 3 + 1] * 3,
      c = indices[t * 3 + 2] * 3;
    const ax = p[a] - x,
      az = p[a + 2] - z,
      bx = p[b] - x,
      bz = p[b + 2] - z;
    const cx = p[c] - x,
      cz = p[c + 2] - z;
    const denominator = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(denominator) < 1e-10) continue;
    const wa = ((bz - cz) * -cx + (cx - bx) * -cz) / denominator;
    const wb = ((cz - az) * -cx + (ax - cx) * -cz) / denominator;
    if (wa < -1e-5 || wb < -1e-5 || wa + wb > 1 + 1e-5) continue;
    if (Math.abs(wa * p[a + 1] + wb * p[b + 1] + (1 - wa - wb) * p[c + 1] - y) < SUPPORT_HEIGHT_TOLERANCE) return true;
  }
  return false;
}

function random(seed: number, channel: number): number {
  let n = seed ^ Math.imul(channel, 0x9e3779b9);
  n = Math.imul(n ^ (n >>> 16), 0x21f0aaad);
  n = Math.imul(n ^ (n >>> 15), 0x735a2d97);
  return ((n ^ (n >>> 15)) >>> 0) / 0x100000000;
}

export function rockGrassBuffers(grass?: RockGrassSurface): ArrayBuffer[] {
  return grass
    ? ([
        grass.coverage.buffer,
        grass.normals.buffer,
        grass.areas.buffer,
        grass.seeds.buffer,
        ...grass.patches.map((patch) => patch.triangles.buffer)
      ] as ArrayBuffer[])
    : [];
}
