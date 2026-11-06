/** Cellular face deformation extracted from the rock lab's cellularDeformation.ts.
 * The host supplies the authoritative height/gradient and slope activation.
 * Distances below are source units multiplied by the baked network's scale.
 */
export interface CellularCurvatureSettings {
  cellSize: number;
  inset: number;
  depth: number;
  detail: number;
  coverage: number;
}

export function validateCellularCurvature(settings: CellularCurvatureSettings): void {
  for (const [key, min, max] of [
    ["cellSize", 4, 80],
    ["inset", 0, 1],
    ["depth", 0.1, 2],
    ["detail", 0, 2],
    ["coverage", 0, 1]
  ] as const) {
    if (!Number.isFinite(settings[key]) || settings[key] < min || settings[key] > max)
      throw Error(`Invalid cellular curvature ${key}`);
  }
}

const saturate = (x: number) => Math.max(0, Math.min(1, x));
export function smoothstep(a: number, b: number, x: number): number {
  const t = saturate((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
function cellHash32(x: number): number {
  x = (x + (x << 10)) >>> 0;
  x ^= x >>> 6;
  x = (x + (x << 3)) >>> 0;
  x ^= x >>> 11;
  return (x + (x << 15)) >>> 0;
}
function lattice(x: number, z: number): number {
  let h = Math.imul((Math.imul(x, 1664525) + cellHash32(z) + 1013904223) >>> 0, 1664525) >>> 0;
  h ^= h >>> 11;
  h ^= (h << 7) & 2636928640;
  h ^= (h << 15) & 4022730752;
  h ^= h >>> 18;
  return (h & 8388607) / 8388608;
}
function cellularValueNoise(x: number, z: number): number {
  const ix = Math.floor(x),
    iz = Math.floor(z),
    fx = smoothstep(0, 1, x - ix),
    fz = smoothstep(0, 1, z - iz);
  return (
    (1 - fz) * ((1 - fx) * lattice(ix, iz) + fx * lattice(ix + 1, iz)) +
    fz * ((1 - fx) * lattice(ix, iz + 1) + fx * lattice(ix + 1, iz + 1)) -
    0.5
  );
}
export interface RockGuideSample {
  height: number;
  gx: number;
  gz: number;
  r: number;
  g: number;
  b?: number;
  path?: number;
}
export interface RockVertex {
  x: number;
  z: number;
  dx: number;
  dz: number;
  random: number;
  bby: number;
  corner: number;
}
export function rockActivation(r: number, g: number): number {
  return smoothstep(0.1, 0.2, r + g);
}

/** The lab's inset, base relief and detail equations, before continuous coverage. */
export function deformRockVertex(
  v: RockVertex,
  o: { scale: number; inset: number; depth: number; detail: number },
  sample: (x: number, z: number) => RockGuideSample
) {
  const inset = 0.065 * (-3 + 11 * v.random) * o.inset * o.scale;
  const x = v.x + v.dx * inset,
    z = v.z + v.dz * inset,
    s = sample(x, z);
  const activation = rockActivation(s.r, s.g),
    path = smoothstep(0.1, 0.15, s.path ?? 0);
  const denominator = Math.sqrt((1 + s.gx * s.gx) * (1 + s.gz * s.gz));
  // Preserve the recovered, deliberately unnormalized cross-product direction.
  const nx = -s.gx / denominator,
    ny = 1 / denominator,
    nz = -s.gz / denominator;
  let px = x,
    py = s.height + o.scale * (-0.4 + 0.6 * saturate(activation + (s.b ?? 0) - 10 * path)),
    pz = z;
  let baseOffset = 0,
    detailOffset = 0;
  if (activation > 0) {
    baseOffset = ((-0.3 + v.bby * (0.3 + 0.3 * v.random)) * activation * (1 - path) * o.depth - path) * o.scale;
    px += nx * baseOffset;
    py += ny * baseOffset;
    pz += nz * baseOffset;
    if (v.corner === 0 && path === 0) {
      const after = sample(px, pz),
        slopeAfter = Math.hypot(after.gx, after.gz);
      const noise = cellularValueNoise(x / o.scale / 130 + 20 * s.r, z / o.scale / 130 + 20 * s.r);
      const a = -0.2 + (1.2 - smoothstep(4, 7, slopeAfter)) * saturate((noise + 1) * 0.5);
      detailOffset = (a * smoothstep(0, 0.3, s.r) * Math.hypot(s.gx, s.gz) * 0.3 + s.g) * o.scale * o.detail;
      px += nx * detailOffset;
      py += ny * detailOffset;
      pz += nz * detailOffset;
    }
  }
  return { position: [px, py, pz] as [number, number, number], activation, baseOffset, detailOffset };
}
