import { f32ToHalf } from "./UnitPacking.js";
import type { WallBakeEdge } from "./BuildingWallBakeInput";

type Point = readonly [number, number, number];
export interface WallBakeLamp {
  readonly position: Point;
  readonly range: number;
}

/** Canonical receiver plane and segment. Only illuminated areas occupy atlas texels. */
export interface WallAtlasChart {
  nx: number;
  nz: number;
  plane: number;
  start: number;
  end: number;
  /** Adjacent facets on a cylindrical receiver share the full continuous light patch. */
  curved?: true;
  tile?: {
    /** Affine projection, u = (nz*x - nx*z)*du + offsetU, v = y*dv + offsetV. */
    du: number;
    dv: number;
    offsetU: number;
    offsetV: number;
    bounds: [number, number, number, number];
    darkUV: [number, number];
  };
}
interface LightmapTile {
  /** World metres from the emitter to this receiving plane. */
  distance: number;
  /** Angle between the transformed horizontal and vertical wall axes. */
  cosine: number;
  sine: number;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  left: number;
  bottom: number;
  width: number;
  height: number;
  /** For a curved receiver, the squared distance and normal projection at lamp height. */
  cylinderColumn?: (u: number) => { perpendicularD2: number; slope: number; normalDistance: number };
}

interface Receiver {
  chart: WallAtlasChart;
  tile: LightmapTile;
  /** Origin in wall-plane world metres. The same texels can have a different origin on each wall. */
  originU: number;
  originV: number;
  metresPerU: number;
}

const GUTTER = 2;
const LIMIT = 1024;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function pack(tiles: LightmapTile[]) {
  for (let density = 20; density > 0.01; density *= 0.7) {
    let area = 0,
      widest = 0;
    for (const t of tiles) {
      t.width = Math.ceil((t.u1 - t.u0) * density) + 1 + 2 * GUTTER;
      t.height = Math.ceil((t.v1 - t.v0) * density) + 1 + 2 * GUTTER;
      area += t.width * t.height;
      widest = Math.max(widest, t.width);
    }
    const target = Math.max(widest, Math.ceil(Math.sqrt(area)));
    // Reserve row zero for the always-black texel (back faces and unlit walls).
    let x = 0,
      y = 1,
      rowHeight = 0,
      width = 1;
    for (const t of tiles.sort((a, b) => b.height - a.height)) {
      if (x + t.width > target) {
        x = 0;
        y += rowHeight;
        rowHeight = 0;
      }
      t.left = x;
      t.bottom = y;
      x += t.width;
      rowHeight = Math.max(rowHeight, t.height);
      width = Math.max(width, x);
    }
    const height = y + rowHeight;
    if (width <= LIMIT && height <= LIMIT) return { width, height, density };
  }
  throw Error("Wall lighting charts exceed the atlas capacity");
}

/** Largest stretch of two axes from their squared lengths and mutual dot product. */
const maximumStretch = (xx: number, zz: number, xz: number) => Math.sqrt((xx + zz + Math.hypot(xx - zz, 2 * xz)) * 0.5);

/** Unwrap only the lamp-facing arc. Each real chord maps its endpoints to the same
 * arc-length texels as its neighbours, including the angular wrap at +/-pi. */
function cylinderPatch(
  radius: number,
  lamp: WallBakeLamp,
  matrix: ArrayLike<number>,
  inverse: ArrayLike<number>,
  metresPerV: number
) {
  const [lx, , lz] = lamp.position;
  const radial = Math.hypot(lx, lz);
  if (radial <= radius) return;
  const angle = Math.atan2(lx, lz);
  // Largest horizontal stretch keeps the arc's texel density under affine transforms.
  const xx = matrix[0] ** 2 + matrix[1] ** 2 + matrix[2] ** 2;
  const zz = matrix[8] ** 2 + matrix[9] ** 2 + matrix[10] ** 2;
  const xz = matrix[0] * matrix[8] + matrix[1] * matrix[9] + matrix[2] * matrix[10];
  const metresPerArc = maximumStretch(xx, zz, xz);
  const gap = radial - radius;
  // All receivers lie behind the exterior tangent plane facing the lamp. Its
  // world-space separation also rejects an unreachable wall stretched along its normal.
  const nx = lx / radial,
    nz = lz / radial;
  const normalLength = Math.hypot(
    nx * inverse[0] + nz * inverse[2],
    nx * inverse[4] + nz * inverse[6],
    nx * inverse[8] + nz * inverse[10]
  );
  if (gap >= lamp.range * normalLength) return;
  // The inverse transform projects the world-space light sphere into local XZ.
  // Bound its ellipse by a disk, then intersect that disk with the receiving circle.
  const invXX = inverse[0] ** 2 + inverse[4] ** 2 + inverse[8] ** 2;
  const invZZ = inverse[2] ** 2 + inverse[6] ** 2 + inverse[10] ** 2;
  const invXZ = inverse[0] * inverse[2] + inverse[4] * inverse[6] + inverse[8] * inverse[10];
  const reach = lamp.range * maximumStretch(invXX, invZZ, invXZ);
  const sinHalf = Math.sqrt(Math.max(0, (reach - gap) * (reach + gap)) / (4 * radius * radial));
  const halfAngle = Math.min(Math.acos(radius / radial), 2 * Math.asin(Math.min(1, sinHalf)));
  const extent = radius * halfAngle * metresPerArc;
  // A point inside the world-space light sphere cannot be farther than this much up its local Y axis.
  const height = lamp.range * Math.hypot(inverse[1], inverse[5], inverse[9]) * metresPerV;
  const tile: LightmapTile = {
    distance: 0,
    cosine: 0,
    sine: 1,
    u0: -extent,
    u1: extent,
    v0: -height,
    v1: height,
    left: 0,
    bottom: 0,
    width: 0,
    height: 0,
    cylinderColumn(u) {
      const theta = angle + u / (metresPerArc * radius);
      const nx = Math.sin(theta),
        nz = Math.cos(theta);
      const dx = lx - radius * nx,
        dz = lz - radius * nz;
      const wx = matrix[0] * dx + matrix[8] * dz;
      const wy = matrix[1] * dx + matrix[9] * dz;
      const wz = matrix[2] * dx + matrix[10] * dz;
      const normalLength = Math.hypot(
        inverse[0] * nx + inverse[2] * nz,
        inverse[4] * nx + inverse[6] * nz,
        inverse[8] * nx + inverse[10] * nz
      );
      const perpX = (wy * matrix[6] - wz * matrix[5]) / metresPerV;
      const perpY = (wz * matrix[4] - wx * matrix[6]) / metresPerV;
      const perpZ = (wx * matrix[5] - wy * matrix[4]) / metresPerV;
      return {
        perpendicularD2: perpX * perpX + perpY * perpY + perpZ * perpZ,
        slope: -(wx * matrix[4] + wy * matrix[5] + wz * matrix[6]) / metresPerV,
        normalDistance: Math.max(0, (nx * dx + nz * dz) / normalLength)
      };
    }
  };
  return { tile, angle, metresPerArc, halfAngle };
}

const signedAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** Bake the unit-intensity response of one emitter. Per-light RGB and brightness
 * are draw inputs, so every result consists of one half-float per texel. */
export function bakeWallAtlas(
  edges: readonly WallBakeEdge[],
  lamp: WallBakeLamp,
  matrix: ArrayLike<number>,
  inverse: ArrayLike<number>,
  planar: boolean,
  circleRadius?: number
) {
  const started = performance.now();
  const charts: WallAtlasChart[] = [];
  const receivers: Receiver[] = [];
  const tiles: LightmapTile[] = [];
  const tilesByProjection = new Map<string, LightmapTile>();
  const metresPerV = Math.hypot(matrix[4], matrix[5], matrix[6]);
  const up = [matrix[4] / metresPerV, matrix[5] / metresPerV, matrix[6] / metresPerV];
  const curved = circleRadius ? cylinderPatch(circleRadius, lamp, matrix, inverse, metresPerV) : undefined;
  if (curved) tiles.push(curved.tile);
  for (const [ax, az, bx, bz] of edges) {
    const extent = Math.hypot(bx - ax, bz - az);
    if (extent < 1e-6) continue;
    const nx = -(bz - az) / extent,
      nz = (bx - ax) / extent;
    const start = ax * nz - az * nx;
    const chart: WallAtlasChart = { nx, nz, plane: ax * nx + az * nz, start, end: start + extent };
    charts.push(chart);

    if (circleRadius) {
      if (!curved) continue;
      const a = Math.atan2(ax, az),
        b = Math.atan2(bx, bz);
      const span = signedAngle(b - a);
      const mid = signedAngle(a + span * 0.5 - curved.angle);
      // Include an adjoining facet beyond the light patch for offset plaster and unit
      // centres. Its UV still reaches the black border of this same image.
      if (Math.abs(mid) > curved.halfAngle + Math.abs(span) * 1.5) continue;
      const worldArc = circleRadius * curved.metresPerArc;
      const metresPerU = (worldArc * span) / extent;
      const originU = start * metresPerU - (mid - span * 0.5) * worldArc;
      chart.curved = true;
      receivers.push({ chart, tile: curved.tile, metresPerU, originU, originV: lamp.position[1] * metresPerV });
      continue;
    }

    const tangent = [0, 1, 2].map((i) => matrix[i] * nz - matrix[8 + i] * nx);
    const metresPerU = Math.hypot(...tangent);
    const [tx, ty, tz] = tangent.map((v) => v / metresPerU);
    const dot = tx * up[0] + ty * up[1] + tz * up[2];
    const cosine = Math.abs(dot) <= 1e-12 ? 0 : dot;
    const sine =
      cosine === 0 ? 1 : Math.hypot(ty * up[2] - tz * up[1], tz * up[0] - tx * up[2], tx * up[1] - ty * up[0]);

    // Project the emitter orthogonally onto the actual world plane. Transform that
    // foot back to wall coordinates; it need not lie directly below the local lamp.
    const normal = [0, 4, 8].map((i) => nx * inverse[i] + nz * inverse[i + 2]);
    const normalLength = Math.hypot(...normal);
    const n = normal.map((v) => v / normalLength);
    let normalU = 0,
      normalV = 0;
    for (let i = 0; i < 3; i++) {
      normalU += (nz * inverse[4 * i] - nx * inverse[4 * i + 2]) * n[i];
      normalV += inverse[4 * i + 1] * n[i];
    }
    const [x, y, z] = lamp.position;
    const distance = (nx * x + nz * z - chart.plane) / normalLength;
    if (distance <= 0 || distance >= lamp.range) continue;
    const radius = Math.sqrt(lamp.range * lamp.range - distance * distance) / sine;
    const originU = (nz * x - nx * z - distance * normalU) * metresPerU;
    const originV = (y - distance * normalV) * metresPerV;
    const u0 = Math.max(start * metresPerU - originU, -radius);
    const u1 = Math.min(chart.end * metresPerU - originU, radius);
    if (u1 <= u0) continue;
    const v0 = -radius,
      v1 = radius;
    // Equivalent receiving planes can project into the same physical texels.
    const key = JSON.stringify([Math.fround(distance) || distance, cosine, sine]);
    let tile = tilesByProjection.get(key);
    if (tile) {
      // Each wall's mesh clips the light at its own corners and openings. Pack the
      // union of required lamp-relative coordinates so even off-centre lamps share.
      tile.u0 = Math.min(tile.u0, u0);
      tile.u1 = Math.max(tile.u1, u1);
      tile.v0 = Math.min(tile.v0, v0);
      tile.v1 = Math.max(tile.v1, v1);
    } else {
      tile = { distance, cosine, sine, u0, u1, v0, v1, left: 0, bottom: 0, width: 0, height: 0 };
      tiles.push(tile);
      tilesByProjection.set(key, tile);
    }
    receivers.push({ chart, tile, originU, originV, metresPerU });
  }

  const { width, height, density } = pack(tiles);
  for (const { chart, tile, originU, originV, metresPerU } of receivers) {
    const minU = (tile.left + GUTTER + 0.5) / width;
    const minV = (tile.bottom + GUTTER + 0.5) / height;
    chart.tile = {
      du: (metresPerU * density) / width,
      dv: (metresPerV * density) / height,
      offsetU: minU - ((originU + tile.u0) * density) / width,
      offsetV: minV - ((originV + tile.v0) * density) / height,
      bounds: [
        minU,
        minV,
        minU + ((tile.u1 - tile.u0) * density) / width,
        minV + ((tile.v1 - tile.v0) * density) / height
      ],
      darkUV: [(tile.left + 0.5) / width, (tile.bottom + 0.5) / height]
    };
  }
  const pixels = new Uint16Array(width * height);
  for (const tile of tiles) {
    for (let col = 1; col < tile.width - 1; col++) {
      // One bilinearly dilated gutter, then a solid-black outer gutter.
      const u = clamp(tile.u0 + (col - GUTTER) / density, tile.u0, tile.u1);
      const column = tile.cylinderColumn?.(u);
      const perpendicularD2 = column?.perpendicularD2 ?? (u * tile.sine) ** 2 + tile.distance * tile.distance;
      const slope = column?.slope ?? u * tile.cosine;
      const normalDistance = column?.normalDistance ?? tile.distance;
      for (let row = 1; row < tile.height - 1; row++) {
        const v = clamp(tile.v0 + (row - GUTTER) / density, tile.v0, tile.v1);
        const d2 = perpendicularD2 + (v + slope) ** 2;
        const q = d2 / (lamp.range * lamp.range);
        if (q >= 1) continue;
        const cosine = normalDistance / Math.sqrt(Math.max(d2, 1e-12));
        const fade = (1 - q * q) ** 2 / Math.max(d2, 1e-4);
        const strength = cosine * (0.96 * fade + (1 - q) ** 2 / (1 + d2));
        pixels[(tile.bottom + row) * width + tile.left + col] = f32ToHalf(Math.min(65504, strength));
      }
    }
  }
  return {
    width,
    height,
    format: "r16f" as const,
    pixels,
    charts,
    planar,
    bakeMs: performance.now() - started
  };
}
