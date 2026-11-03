import { gridSurfaceTriangles } from "@galacean/engine-terrain/geometry/SurfaceTriangles";
import type { GroundBounds, GroundSample, GroundSurface } from "@galacean/engine-farming/farming/api/index";
import { decodeSeedWorldHeight, seedWorldOriginX, seedWorldOriginZ } from "@galacean/engine-world-planning/runtime/SeedWorldFields";
import type { PlanningFarmingTerrain } from "./PlanningPublishedFarmingGround.ts";
import { float32GridCell, interpolateGridTriangle, type Float32Grid } from "@galacean/engine-terrain/geometry/GridInterpolation";

export interface PlanningTerrainFootprint {
  readonly covered: boolean;
  readonly maximumSlopeDegrees: number;
  readonly minimumHeight: number;
  readonly maximumHeight: number;
  readonly surfaces: readonly GroundSurface[];
}

/** Inspect published geometry cell by cell. Canonical fixed terrain uses Float32 triangles;
 * legacy clipmap fields retain their R16 bilinear contract. Slopes are never averaged across cells.
 */
export function createPlanningFarmingTerrainQuery(fields: PlanningFarmingTerrain) {
  fields = {
    ...fields,
    worldOrigin: fields.worldOrigin && [...fields.worldOrigin],
    heightDecode: fields.heightDecode && { ...fields.heightDecode },
    heightSamples: fields.heightSamples.slice(),
    surfaceHeights: fields.surfaceHeights?.slice(),
    rockySlopeWeight: fields.rockySlopeWeight.slice(),
    materialWeights: fields.materialWeights.slice()
  };
  const size = fields.sizeMetres,
    n = fields.heightResolution;
  const pitch = size / (n - 1),
    ox = seedWorldOriginX(fields),
    oz = seedWorldOriginZ(fields);
  if (
    !Number.isFinite(pitch) ||
    !Number.isFinite(ox) ||
    !Number.isFinite(oz) ||
    (fields.heightDecode &&
      (!Number.isFinite(fields.heightDecode.offset) || !Number.isFinite(fields.heightDecode.scale))) ||
    pitch <= 0 ||
    !Number.isInteger(n) ||
    n < 2 ||
    fields.heightSamples.length !== n * n ||
    (fields.surfaceHeights !== undefined && fields.surfaceHeights.length !== n * n) ||
    !Number.isInteger(fields.surfaceResolution) ||
    fields.surfaceResolution < 2 ||
    fields.rockySlopeWeight.length !== fields.surfaceResolution ** 2 ||
    fields.materialWeights.length !== fields.surfaceResolution ** 2 * 4
  )
    throw new Error("Invalid published farming terrain grid");
  const encoded = fields.heightSamples;
  const height = (x: number, z: number) => decodeSeedWorldHeight(fields, encoded[z * n + x]);
  const canonical = fields.surfaceHeights !== undefined;
  type Grid = Float32Grid & { vertex: (x: number, z: number) => number };
  const background: Grid = { origin: [ox, oz], spacing: pitch, spacingZ: pitch, columns: n, rows: n,
    vertex: (x, z) => fields.surfaceHeights?.[z * n + x] ?? Math.fround(height(x, z)) };
  const triangles = (grid: Grid, ix: number, iz: number) => {
    const x0 = Math.fround(grid.origin[0] + ix * grid.spacing), x1 = Math.fround(grid.origin[0] + (ix + 1) * grid.spacing),
      z0 = Math.fround(grid.origin[1] + iz * grid.spacingZ), z1 = Math.fround(grid.origin[1] + (iz + 1) * grid.spacingZ),
      a = grid.vertex(ix, iz), b = grid.vertex(ix + 1, iz), c = grid.vertex(ix, iz + 1), d = grid.vertex(ix + 1, iz + 1);
    return { x0, x1, z0, z1, a, b, c, d };
  };
  const canonicalSample = (x: number, z: number) => {
    const grid = background;
    const { ix, iz, u, v } = float32GridCell(grid, x, z), cell = triangles(grid, ix, iz);
    const dx = (u <= v ? cell.d - cell.c : cell.b - cell.a) / (cell.x1 - cell.x0),
      dz = (u <= v ? cell.c - cell.a : cell.d - cell.b) / (cell.z1 - cell.z0), length = Math.hypot(dx, 1, dz);
    return { y: interpolateGridTriangle(cell.a, cell.b, cell.c, cell.d, u, v),
      normal: [-dx / length, 1 / length, -dz / length] as const, slope: Math.atan(Math.hypot(dx, dz)) * 180 / Math.PI };
  };
  const cellSample = (cx: number, cz: number, x: number, z: number) => {
    const tx = Math.max(0, Math.min(1, (x - ox) / pitch - cx)),
      tz = Math.max(0, Math.min(1, (z - oz) / pitch - cz));
    const a = height(cx, cz),
      b = height(cx + 1, cz),
      c = height(cx, cz + 1),
      d = height(cx + 1, cz + 1);
    const dx = ((b - a) * (1 - tz) + (d - c) * tz) / pitch;
    const dz = ((c - a) * (1 - tx) + (d - b) * tx) / pitch;
    const length = Math.hypot(dx, 1, dz);
    return {
      y: (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz,
      normal: [-dx / length, 1 / length, -dz / length] as const,
      slope: (Math.atan(Math.hypot(dx, dz)) * 180) / Math.PI
    };
  };
  const surfaceAt = (ix: number, iz: number): GroundSurface => {
    const i = iz * fields.surfaceResolution + ix;
    return fields.rockySlopeWeight[i] > 127
      ? "rock"
      : fields.materialWeights[i * 4] > fields.materialWeights[i * 4 + 2]
        ? "grass"
        : "soil";
  };
  const surface = (x: number, z: number) =>
    surfaceAt(
      Math.max(
        0,
        Math.min(fields.surfaceResolution - 1, Math.round(((x - ox) / size) * (fields.surfaceResolution - 1)))
      ),
      Math.max(
        0,
        Math.min(fields.surfaceResolution - 1, Math.round(((z - oz) / size) * (fields.surfaceResolution - 1)))
      )
    );
  const covered = (b: GroundBounds) =>
    [b.minimumX, b.minimumZ, b.maximumX, b.maximumZ].every(Number.isFinite) &&
    b.minimumX <= b.maximumX &&
    b.minimumZ <= b.maximumZ &&
    b.minimumX >= ox &&
    b.maximumX <= ox + size &&
    b.minimumZ >= oz &&
    b.maximumZ <= oz + size;
  const sample = (x: number, z: number): GroundSample | null => {
    if (!covered({ minimumX: x, maximumX: x, minimumZ: z, maximumZ: z })) return null;
    const ix = Math.min(n - 2, Math.floor((x - ox) / pitch)),
      iz = Math.min(n - 2, Math.floor((z - oz) / pitch));
    const result = canonical ? canonicalSample(x, z) : cellSample(ix, iz, x, z);
    return { position: [x, result.y, z], normal: result.normal, surface: surface(x, z) };
  };
  const inspectBounds = (b: GroundBounds): PlanningTerrainFootprint => {
    if (!covered(b))
      return { covered: false, minimumHeight: NaN, maximumHeight: NaN, maximumSlopeDegrees: NaN, surfaces: [] };
    let minimumHeight = Infinity,
      maximumHeight = -Infinity,
      maximumSlopeDegrees = 0;
    const surfaces = new Set<GroundSurface>();
    const x0 = Math.min(n - 2, Math.floor((b.minimumX - ox) / pitch));
    const x1 = Math.min(n - 2, Math.max(x0, Math.ceil((b.maximumX - ox) / pitch) - 1));
    const z0 = Math.min(n - 2, Math.floor((b.minimumZ - oz) / pitch));
    const z1 = Math.min(n - 2, Math.max(z0, Math.ceil((b.maximumZ - oz) / pitch) - 1));
    if (canonical) for (const grid of [background]) {
      const x0 = Math.max(b.minimumX, Math.fround(grid.origin[0])), z0 = Math.max(b.minimumZ, Math.fround(grid.origin[1])),
        x1 = Math.min(b.maximumX, Math.fround(grid.origin[0] + (grid.columns - 1) * grid.spacing)),
        z1 = Math.min(b.maximumZ, Math.fround(grid.origin[1] + (grid.rows - 1) * grid.spacingZ));
      if (x0 > x1 || z0 > z1) continue;
      if ((b.minimumX < b.maximumX && x0 === x1) || (b.minimumZ < b.maximumZ && z0 === z1)) continue;
      const first = float32GridCell(grid, x0, z0), last = float32GridCell(grid, x1, z1);
      for (let iz = first.iz; iz <= last.iz; iz++) for (let ix = first.ix; ix <= last.ix; ix++) {
        const cell = triangles(grid, ix, iz),
          u0 = Math.max(0, (x0 - cell.x0) / (cell.x1 - cell.x0)), u1 = Math.min(1, (x1 - cell.x0) / (cell.x1 - cell.x0)),
          v0 = Math.max(0, (z0 - cell.z0) / (cell.z1 - cell.z0)), v1 = Math.min(1, (z1 - cell.z0) / (cell.z1 - cell.z0));
        if ((x0 < x1 && u0 === u1) || (z0 < z1 && v0 === v1)) continue;
        // A triangle clipped by an axis-aligned rectangle has extrema at rectangle
        // corners and a--d intersections. These include peaks between support probes.
        const points: [number, number][] = [[u0, v0], [u1, v0], [u0, v1], [u1, v1]];
        const diagonal0 = Math.max(u0, v0), diagonal1 = Math.min(u1, v1);
        if (diagonal0 <= diagonal1) points.push([diagonal0, diagonal0], [diagonal1, diagonal1]);
        for (const [u, v] of points) {
          const y = interpolateGridTriangle(cell.a, cell.b, cell.c, cell.d, u, v);
          minimumHeight = Math.min(minimumHeight, y); maximumHeight = Math.max(maximumHeight, y);
        }
        for (const lower of [true, false]) {
          if (lower ? u0 > v1 : u1 < v0) continue;
          const dx = (lower ? cell.d - cell.c : cell.b - cell.a) / (cell.x1 - cell.x0),
            dz = (lower ? cell.c - cell.a : cell.d - cell.b) / (cell.z1 - cell.z0);
          maximumSlopeDegrees = Math.max(maximumSlopeDegrees, Math.atan(Math.hypot(dx, dz)) * 180 / Math.PI);
        }
      }
    }
    else for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++) {
        const xs = [Math.max(b.minimumX, ox + ix * pitch), Math.min(b.maximumX, ox + (ix + 1) * pitch)];
        const zs = [Math.max(b.minimumZ, oz + iz * pitch), Math.min(b.maximumZ, oz + (iz + 1) * pitch)];
        // Bilinear height and the norm of its affine gradient reach extrema at the clipped cell corners.
        for (const x of xs)
          for (const z of zs) {
            const s = cellSample(ix, iz, x, z);
            minimumHeight = Math.min(minimumHeight, s.y);
            maximumHeight = Math.max(maximumHeight, s.y);
            maximumSlopeDegrees = Math.max(maximumSlopeDegrees, s.slope);
          }
      }
    const m = fields.surfaceResolution,
      surfacePitch = size / (m - 1);
    const sx0 = Math.max(0, Math.floor((b.minimumX - ox) / surfacePitch + 0.5));
    const sx1 = Math.min(m - 1, Math.floor((b.maximumX - ox) / surfacePitch + 0.5));
    const sz0 = Math.max(0, Math.floor((b.minimumZ - oz) / surfacePitch + 0.5));
    const sz1 = Math.min(m - 1, Math.floor((b.maximumZ - oz) / surfacePitch + 0.5));
    for (let z = sz0; z <= sz1; z++) for (let x = sx0; x <= sx1; x++) surfaces.add(surfaceAt(x, z));
    return {
      covered: covered(b) && Number.isFinite(minimumHeight),
      minimumHeight,
      maximumHeight,
      maximumSlopeDegrees,
      surfaces: [...surfaces]
    };
  };
  // Accepted plots keep their positions if the world extent changes. Match sample's clamp-to-edge policy.
  const clampedSurfaceTriangles = (bounds: GroundBounds) => {
    const x0 = Math.floor((bounds.minimumX - ox) / pitch), z0 = Math.floor((bounds.minimumZ - oz) / pitch);
    const x1 = Math.ceil((bounds.maximumX - ox) / pitch), z1 = Math.ceil((bounds.maximumZ - oz) / pitch);
    const extended: Float32Grid = { origin: [ox + x0 * pitch, oz + z0 * pitch], spacing: pitch, spacingZ: pitch,
      columns: x1 - x0 + 1, rows: z1 - z0 + 1 };
    return gridSurfaceTriangles(extended, bounds, (x, z) => background.vertex(
      Math.max(0, Math.min(n - 1, x + x0)), Math.max(0, Math.min(n - 1, z + z0))));
  };
  return Object.freeze({ sample, inspectBounds, clampedSurfaceTriangles,
    surfaceTriangles: (bounds: GroundBounds) => gridSurfaceTriangles(background, bounds, background.vertex) });
}
