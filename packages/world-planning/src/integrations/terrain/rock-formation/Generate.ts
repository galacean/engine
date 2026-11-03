import { assembleCellularModule, type CellularModule } from "@galacean/engine-terrain/rock-formation/CellularModule";
import { cellularCornerShading } from "@galacean/engine-terrain/rock-formation/CellularShading";
import { deformCellularSlabs } from "@galacean/engine-terrain/rock-formation/VertexSlabs";
import { generateHeightmap, validateNoise } from "@galacean/engine-terrain/rock-formation/PerlinNoise";
import { validateSlabSettings } from "@galacean/engine-terrain/rock-formation/SlabSettings";
import {
  deformRockVertex,
  smoothstep,
  validateCellularCurvature
} from "@galacean/engine-terrain/rock-formation/CellularCurvature";
import { ascentMask, sampleRockField } from "@galacean/engine-terrain/rock-formation/AscentMask";
import { ROCK_GROUND_BURIAL, rockGroundHeight, sampleRockGround } from "./Ground.ts";
import { constrainRockGroundContact } from "./GroundContact.ts";
import { transportSurfaceNormals } from "@galacean/engine-terrain/rock-formation/SurfaceNormalTransport";
import { repairMixedSurfaceSeams } from "@galacean/engine-terrain/rock-formation/MixedSurface";
import { constrainCellularDisplacement } from "@galacean/engine-terrain/rock-formation/CellularDisplacementLimits";
import { hashSeed } from "@galacean/engine-terrain/rock-formation/math";
import { buildRockGrassSurface } from "@galacean/engine-terrain/rock-formation/GrassSurface";
import type { RockFormationSettings } from "./Settings.ts";
import { DEFAULT_ROCK_HEIGHT_MODE } from "@galacean/engine-terrain/rock-formation/types";
import type {
  FractureSurface,
  RockFormationJob,
  RockFormationMesh,
  V3
} from "@galacean/engine-terrain/rock-formation/types";

const NETWORK_CELL_SIZE = 8;

/** Keep a complete detail span when the entire rock is smaller than its slabs. */
function formationDetailScale(job: RockFormationJob, settings: RockFormationSettings, mixed = false): number {
  const footprint = Math.max(...job.guides.map((guide) => Math.min(guide.size[0], guide.size[2])));
  const span = mixed
    ? Math.max(NETWORK_CELL_SIZE, settings.slabs.size, settings.curvature.cellSize)
    : settings.surfaceMode === "cellular-curvature"
      ? settings.curvature.cellSize
      : Math.max(NETWORK_CELL_SIZE, settings.slabs.size);
  return Math.min(1, footprint / span);
}

/** Uniform coordinates preserve OBB aspect, yaw, local offsets and terrain slopes. */
function inDetailUnits(job: RockFormationJob, scale: number): RockFormationJob {
  const vector = (value: V3): V3 => value.map((v) => v / scale) as V3;
  const d = job.domain,
    g = job.ground;
  return {
    ...job,
    guides: job.guides.map((guide) => ({ ...guide, center: vector(guide.center), size: vector(guide.size) })),
    domain: { ...d, minX: d.minX / scale, minZ: d.minZ / scale, width: d.width / scale, depth: d.depth / scale },
    ground: {
      ...g,
      minX: g.minX / scale,
      minZ: g.minZ / scale,
      spacingX: g.spacingX / scale,
      spacingZ: g.spacingZ / scale,
      heights: g.heights.map((height) => height / scale)
    }
  };
}

export function formationHeightfield(job: RockFormationJob, settings: RockFormationSettings) {
  const modes = job.guides.map((guide) => guide.heightMode ?? DEFAULT_ROCK_HEIGHT_MODE);
  if (modes.some((mode) => mode !== "random-ascent" && mode !== "perlin-ascent"))
    throw new Error("Unknown rock height mode");
  const d = job.domain,
    n = d.resolution;
  let noise: Float32Array | undefined;
  if (modes.includes("perlin-ascent")) {
    validateNoise(settings.perlin);
    if (!Number.isFinite(settings.perlin.maskPower) || settings.perlin.maskPower < 0.1 || settings.perlin.maskPower > 8)
      throw new Error("Invalid ascent mask power");
    noise = generateHeightmap({
      ...settings.perlin,
      seed: hashSeed(job.seed, `perlin/${settings.perlin.seed}`),
      schema: "perlin-heightmap/v1",
      normalization: "local",
      resolution: n
    }).heights;
  }
  const heights = new Float32Array(n * n),
    owners = new Int32Array(n * n).fill(-1);
  const masks = job.guides.map((guide) => ascentMask(guide, job.seed, d));
  const contributions: Float32Array[] = [];
  const peaks: number[] = [];
  for (let g = 0; g < masks.length; g++) {
    const mask = masks[g],
      peak = Math.max(...mask);
    peaks.push(peak);
    // The same seeded ascent source can be used directly or as the Perlin mask.
    if (modes[g] === "random-ascent") {
      contributions.push(mask);
      for (let i = 0; i < heights.length; i++)
        if (mask[i] > heights[i]) {
          heights[i] = mask[i];
          owners[i] = g;
        }
      continue;
    }
    let composedPeak = 0;
    for (let i = 0; i < mask.length; i++)
      composedPeak = Math.max(composedPeak, noise![i] * (peak ? mask[i] / peak : 0) ** settings.perlin.maskPower);
    const amplitude = composedPeak ? peak / composedPeak : 0;
    const contribution = new Float32Array(n * n);
    contributions.push(contribution);
    for (let i = 0; i < heights.length; i++) {
      const y = noise![i] * (peak ? mask[i] / peak : 0) ** settings.perlin.maskPower * amplitude;
      contribution[i] = y;
      if (y > heights[i]) {
        heights[i] = y;
        owners[i] = g;
      }
    }
  }
  return { heights, owners, masks, contributions, peaks, peak: Math.max(0, ...heights) };
}

/** One guide and baked network, with mutually exclusive slab/curvature deformation. */
export function generateRockFormation(
  job: RockFormationJob,
  settings: RockFormationSettings,
  module: CellularModule
): RockFormationMesh {
  const started = performance.now();
  const modes = job.guides.map((guide) => guide.surfaceMode ?? settings.surfaceMode);
  if ([settings.surfaceMode, ...modes].some((mode) => mode !== "vertex-slabs" && mode !== "cellular-curvature"))
    throw Error("Unknown rock surface mode");
  const mixed = new Set(modes).size > 1;
  if (!mixed && modes.length) settings = { ...settings, surfaceMode: modes[0] };
  const curved = mixed || settings.surfaceMode === "cellular-curvature";
  if (curved) validateCellularCurvature(settings.curvature);
  if (mixed || !curved) validateSlabSettings(settings.slabs);
  if (
    !job.guides.length ||
    ![job.domain.width, job.domain.depth, ...job.guides.flatMap((guide) => guide.size)].every(
      (v) => Number.isFinite(v) && v > 0
    )
  )
    throw new Error("Invalid rock formation extent");
  // The network cell, ascent smoothing and slab depth share one reference unit.
  // Scaling only the cell would leave metre-deep protrusions on centimetre rocks.
  // A uniform similarity transform lets the same pipeline cover both scales;
  // formations already spanning a slab keep their existing coordinates exactly.
  const detailScale = formationDetailScale(job, settings, mixed);
  if (detailScale < 1) job = inDetailUnits(job, detailScale);
  const field = formationHeightfield(job, settings),
    d = job.domain;
  // Very large authored boxes keep a bounded repeating window and worker memory.
  const tileCells = module.period / module.meanCellSize;
  // Curved and mixed surfaces share the editable cellular network scale.
  const cellSize = Math.max(
    curved ? settings.curvature.cellSize : NETWORK_CELL_SIZE,
    Math.max(d.width, d.depth) / (tileCells * 6)
  );
  const phase: [number, number] = [
    (hashSeed(job.seed, "network/x") / 0x100000000) * module.period,
    (hashSeed(job.seed, "network/z") / 0x100000000) * module.period
  ];
  const topology = assembleCellularModule(module, d.width, d.depth, cellSize, phase);
  const count = topology.positions.length / 3;
  const positions = new Float32Array(count * 3),
    normals = new Float32Array(positions.length),
    support = new Uint8Array(count);
  const centerX = d.minX + d.width / 2,
    centerZ = d.minZ + d.depth / 2;
  const body = (x: number, z: number) => sampleRockField(field.heights, d, x, z);
  // Contact burial is a world-space seam tolerance, not a rock detail dimension.
  const height = (x: number, z: number) =>
    rockGroundHeight(
      body(x, z) * detailScale,
      sampleRockGround(job.ground, x, z) * detailScale,
      0,
      field.peak * detailScale
    ) / detailScale;
  // The lab uses a four-corner average gradient for slope activation/relief.
  // Sample the same native-ground guide here; no separate curvature heightfield.
  const sample = (x: number, z: number) => {
    const dx = d.width / (d.resolution - 1),
      dz = d.depth / (d.resolution - 1);
    const i = Math.max(0, Math.min(d.resolution - 2, Math.floor((x - d.minX) / dx)));
    const j = Math.max(0, Math.min(d.resolution - 2, Math.floor((z - d.minZ) / dz)));
    const x0 = d.minX + i * dx,
      z0 = d.minZ + j * dz;
    const a = height(x0, z0),
      b = height(x0 + dx, z0),
      c = height(x0, z0 + dz),
      e = height(x0 + dx, z0 + dz);
    const gx = ((b + e - a - c) * 0.5) / dx,
      gz = ((c + e - a - b) * 0.5) / dz;
    return {
      height: height(x, z),
      gx,
      gz,
      r: smoothstep(0.75, 1.25, Math.hypot(gx, gz)) * settings.curvature.coverage,
      g: 0
    };
  };
  const epsilon = Math.max(0.01, (Math.min(d.width, d.depth) / (d.resolution - 1)) * 0.5);
  for (let v = 0; v < count; v++) {
    const x = topology.positions[v * 3] + centerX,
      z = topology.positions[v * 3 + 2] + centerZ;
    positions.set([x, height(x, z), z], v * 3);
    const guide = curved ? sample(x, z) : undefined;
    const gx = guide?.gx ?? (height(x + epsilon, z) - height(x - epsilon, z)) / (2 * epsilon);
    const gz = guide?.gz ?? (height(x, z + epsilon) - height(x, z - epsilon)) / (2 * epsilon);
    const length = Math.hypot(gx, 1, gz);
    normals.set([-gx / length, 1 / length, -gz / length], v * 3);
    support[v] = Number(body(x, z) > 1e-4);
  }
  const active = new Float32Array(topology.indices.length / 3);
  for (let t = 0; t < active.length; t++)
    active[t] = Number(
      !!(
        support[topology.indices[t * 3]] ||
        support[topology.indices[t * 3 + 1]] ||
        support[topology.indices[t * 3 + 2]]
      )
    );
  // Preserve legacy ownership for all-Perlin jobs, including surface-only edits.
  const ownerFields = job.guides.some((guide) => guide.heightMode === "random-ascent")
    ? field.contributions
    : field.masks;
  const faceOwners = new Uint32Array(active.length),
    faceSurfaces = new Uint8Array(active.length);
  const vertexSurfaces = mixed ? new Uint8Array(count) : undefined;
  for (let t = 0; t < active.length; t++) {
    if (!active[t]) continue;
    let x = 0,
      z = 0,
      owner = 0,
      best = -Infinity;
    for (let j = 0; j < 3; j++) {
      const v = topology.indices[t * 3 + j];
      x += positions[v * 3] / 3;
      z += positions[v * 3 + 2] / 3;
    }
    for (let g = 0; g < job.guides.length; g++) {
      const influence = sampleRockField(ownerFields[g], d, x, z);
      if (influence > best) {
        owner = g;
        best = influence;
      }
    }
    faceOwners[t] = owner;
    faceSurfaces[t] = Number(modes[owner] === "cellular-curvature");
    if (vertexSurfaces) for (let j = 0; j < 3; j++) vertexSurfaces[topology.indices[t * 3 + j]] |= 1 << faceSurfaces[t];
  }
  const surface: FractureSurface = {
    mesh: { positions, indices: topology.indices, normals, guideNormals: normals, restPositions: positions.slice() },
    cellular: {
      cellIds: topology.cellIds,
      cellKeys: topology.cellKeys,
      isTop: topology.isTop,
      triangleNeighbors: topology.neighbors
    }
  };
  let mesh = surface.mesh,
    patches = 0,
    deformedVertices = 0,
    contactVertices = 0;
  const coverage = curved ? new Float32Array(count) : undefined;
  const cavity = curved ? new Float32Array(count) : undefined;
  if (curved) {
    const output = positions.slice(),
      curvedNormals = new Float32Array(normals.length);
    const options = { ...settings.curvature, scale: topology.scale };
    for (let v = 0; v < count; v++) {
      const k = v * 3,
        x = positions[k],
        z = positions[k + 2];
      const deformed = deformRockVertex(
        {
          x,
          z,
          dx: topology.directions[k],
          dz: topology.directions[k + 2],
          random: topology.random[v],
          bby: topology.bby[v],
          corner: topology.corners[v]
        },
        options,
        sample
      );
      // Same continuous-coverage blend as the lab: inactive cell levels meet
      // the guide, and every shared seam keeps one canonical vertex.
      const rock = deformed.activation;
      coverage![v] = rock;
      cavity![v] = (1 - topology.bby[v]) * rock * 0.85;
      for (let axis = 0; axis < 3; axis++) output[k + axis] += (deformed.position[axis] - positions[k + axis]) * rock;
      if ([0, 1, 2].some((axis) => Math.abs(output[k + axis] - positions[k + axis]) > 1e-8)) deformedVertices++;
    }
    // Bound steep-face relief before mixing surfaces or rebuilding normals.
    constrainCellularDisplacement(output, positions, topology.indices, topology.scale);
    if (mixed) {
      const slabNormals = new Float32Array(normals.length);
      for (let v = 0; v < count; v++) {
        const k = v * 3,
          x = positions[k],
          z = positions[k + 2];
        const gx = (height(x + epsilon, z) - height(x - epsilon, z)) / (2 * epsilon);
        const gz = (height(x, z + epsilon) - height(x, z - epsilon)) / (2 * epsilon);
        const length = Math.hypot(gx, 1, gz);
        slabNormals.set([-gx / length, 1 / length, -gz / length], k);
      }
      const slabSource: FractureSurface = {
        ...surface,
        mesh: { ...surface.mesh, normals: slabNormals, guideNormals: slabNormals }
      };
      const slabActive = active.map((value, t) => (value && !faceSurfaces[t] ? 1 : 0));
      cellularCornerShading(
        slabSource.mesh,
        topology.isTop,
        topology.neighbors,
        topology.cellIds,
        topology.random,
        slabActive
      );
      const slabs = deformCellularSlabs(
        slabSource,
        { ...settings.slabs, seed: hashSeed(job.seed, `vertex-slabs/${settings.slabs.seed}`) },
        "guide-transport"
      );
      patches = slabs.stats.patches;
      const curvaturePositions = output.slice();
      for (let v = 0; v < count; v++) {
        const k = v * 3,
          mode = vertexSurfaces![v];
        // A shared boundary remains on the guide: both surfaces use the exact
        // same vertex IDs and positions, so no overlapping shells or open seam.
        const selected = mode === 1 ? slabs.surface.mesh.positions : mode === 2 ? output : positions;
        if (selected !== output) output.set(selected.subarray(k, k + 3), k);
        if (mode !== 2) {
          coverage![v] = 0;
          cavity![v] = 0;
        }
      }
      repairMixedSurfaceSeams(
        positions,
        output,
        topology.indices,
        active,
        faceSurfaces,
        vertexSurfaces!,
        slabs.surface.mesh.positions,
        curvaturePositions
      );
      deformedVertices = 0;
      for (let v = 0; v < count; v++) {
        const k = v * 3;
        if ([0, 1, 2].some((axis) => Math.abs(output[k + axis] - positions[k + axis]) > 1e-8)) deformedVertices++;
      }
    }
    contactVertices = constrainRockGroundContact(
      output,
      topology.indices,
      topology.neighbors,
      active,
      job.ground,
      ROCK_GROUND_BURIAL / detailScale
    );
    for (let t = 0; t < topology.indices.length; t += 3) {
      const a = topology.indices[t] * 3,
        b = topology.indices[t + 1] * 3,
        c = topology.indices[t + 2] * 3;
      const ux = output[b] - output[a],
        uy = output[b + 1] - output[a + 1],
        uz = output[b + 2] - output[a + 2];
      const vx = output[c] - output[a],
        vy = output[c + 1] - output[a + 1],
        vz = output[c + 2] - output[a + 2];
      const nx = uy * vz - uz * vy,
        ny = uz * vx - ux * vz,
        nz = ux * vy - uy * vx;
      for (const k of [a, b, c]) {
        curvedNormals[k] += nx;
        curvedNormals[k + 1] += ny;
        curvedNormals[k + 2] += nz;
      }
    }
    for (let k = 0; k < curvedNormals.length; k += 3) {
      const length = Math.hypot(curvedNormals[k], curvedNormals[k + 1], curvedNormals[k + 2]);
      for (let axis = 0; axis < 3; axis++)
        curvedNormals[k + axis] = length > 1e-12 ? curvedNormals[k + axis] / length : normals[k + axis];
    }
    mesh = { ...mesh, positions: output, normals: curvedNormals };
    // Full canonical neighbors are retained before supported faces are filtered.
    // Source IDs keep texture offsets fixed when a different crop changes dense IDs.
    const shadingIds = Uint32Array.from(topology.cellIds, (id) => Number(topology.cellKeys[id].split(":", 1)[0]));
    cellularCornerShading(mesh, topology.isTop, topology.neighbors, shadingIds, topology.random, active, coverage);
  } else {
    cellularCornerShading(surface.mesh, topology.isTop, topology.neighbors, topology.cellIds, topology.random, active);
    const slabs = deformCellularSlabs(
      surface,
      { ...settings.slabs, seed: hashSeed(job.seed, `vertex-slabs/${settings.slabs.seed}`) },
      "guide-transport"
    );
    mesh = slabs.surface.mesh;
    patches = slabs.stats.patches;
    deformedVertices = slabs.stats.deformedVertices;
    // A disabled slab stage may return the projected buffer itself. Preserve
    // that guide/rest surface when closing only the final perimeter.
    const grounded = mesh.positions.slice();
    contactVertices = constrainRockGroundContact(
      grounded,
      topology.indices,
      topology.neighbors,
      active,
      job.ground,
      ROCK_GROUND_BURIAL / detailScale
    );
    if (contactVertices)
      mesh = {
        ...mesh,
        positions: grounded,
        normals: transportSurfaceNormals({ positions, indices: topology.indices, guideNormals: normals }, grounded)
      };
  }
  if (contactVertices) {
    deformedVertices = 0;
    for (let k = 0; k < positions.length; k += 3)
      if ([0, 1, 2].some((axis) => Math.abs(mesh.positions[k + axis] - positions[k + axis]) > 1e-8)) deformedVertices++;
  }
  const indices: number[] = [],
    owners: string[] = [],
    retained: number[] = [];
  for (let t = 0; t < active.length; t++) {
    if (!active[t]) continue;
    const corners = Array.from(topology.indices.subarray(t * 3, t * 3 + 3));
    indices.push(...corners);
    owners.push(job.guides[faceOwners[t]].ownerId);
    retained.push(t);
  }
  const shading = curved ? mesh.cellularShading! : undefined;
  const selectFaces = (source: Float32Array, stride: number) => {
    const output = new Float32Array(retained.length * stride);
    retained.forEach((t, i) => output.set(source.subarray(t * stride, (t + 1) * stride), i * stride));
    return output;
  };
  const result: RockFormationMesh = {
    id: job.id,
    origin: job.origin,
    owners,
    ...(mixed ? { triangleSurfaces: Uint8Array.from(retained, (t) => faceSurfaces[t]) } : {}),
    mesh: {
      positions: detailScale < 1 ? mesh.positions.map((value) => value * detailScale) : mesh.positions,
      indices: new Uint32Array(indices),
      normals: mesh.normals,
      restPositions: detailScale < 1 ? positions.map((value) => value * detailScale) : positions
    },
    ...(shading
      ? {
          painted: {
            coverage: coverage!,
            cavity: cavity!,
            guideNormals: normals,
            faceNormals: selectFaces(shading.faceNormals, 3),
            neighborNormals: selectFaces(shading.neighborNormals, 9),
            smoothNormals: selectFaces(shading.smoothNormals!, 9),
            edgeAltitudes: selectFaces(shading.edgeAltitudes!, 3).map((value) => value * detailScale),
            cells: Float32Array.from(retained.flatMap((t) => [shading.cells[t * 3], shading.cells[t * 3 + 1]])),
            cellScale: topology.scale * detailScale
          }
        }
      : {}),
    stats: { slabs: patches, deformedVertices, generationMs: performance.now() - started }
  };
  if (job.surfaceGrass !== false) result.grass = buildRockGrassSurface(result, normals);
  result.stats.generationMs = performance.now() - started;
  return result;
}
