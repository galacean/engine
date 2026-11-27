/** Deterministic vector and transform helpers.
 *
 * Only IEEE-754 basic arithmetic, `Math.sqrt` and `Math.round` are used. ECMAScript
 * leaves `Math.sin`/`Math.cos` implementation-approximated, so trigonometry here is a
 * fixed polynomial: the same input gives the same bits on every engine and thread. */
export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];
/** Column-major 4×4 matrix, the same layout as Galacean `Matrix.elements`. */
export type Mat4 = readonly number[];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
export const length = (a: Vec3): number => Math.sqrt(dot(a, a));

export function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw Error(`${label} must be a finite number`);
  return value;
}
export function positive(value: unknown, label: string): number {
  if (!(finite(value, label) > 0)) throw Error(`${label} must be positive`);
  return value as number;
}
export function vec3(value: unknown, label: string): Vec3 {
  if (!Array.isArray(value) || value.length !== 3) throw Error(`${label} must be a 3-component vector`);
  return [finite(value[0], label), finite(value[1], label), finite(value[2], label)];
}
export function normalize(a: Vec3, label = "vector"): Vec3 {
  const l = length(a);
  if (!(l > 1e-12)) throw Error(`Cannot normalize a zero-length ${label}`);
  return scale(a, 1 / l);
}

const HALF_PI_HI = 1.5707963267948966;
const HALF_PI_LO = 6.123233995736766e-17;
/** Deterministic sine and cosine of an angle in radians. */
export function sinCos(angle: number): [number, number] {
  finite(angle, "Angle");
  const k = Math.round(angle / HALF_PI_HI);
  const r = angle - k * HALF_PI_HI - k * HALF_PI_LO;
  const r2 = r * r;
  // Taylor polynomials; |r| <= π/4 keeps the truncation error below 1e-16.
  const s =
    r *
    (1 +
      r2 *
        (-1 / 6 +
          r2 *
            (1 / 120 +
              r2 *
                (-1 / 5040 +
                  r2 *
                    (1 / 362880 +
                      r2 *
                        (-1 / 39916800 +
                          r2 * (1 / 6227020800 + r2 * (-1 / 1307674368000 + r2 * (1 / 355687428096000)))))))));
  const c =
    1 +
    r2 *
      (-1 / 2 +
        r2 *
          (1 / 24 +
            r2 *
              (-1 / 720 +
                r2 *
                  (1 / 40320 +
                    r2 *
                      (-1 / 3628800 + r2 * (1 / 479001600 + r2 * (-1 / 87178291200 + r2 * (1 / 20922789888000))))))));
  switch (((k % 4) + 4) % 4) {
    case 0:
      return [s, c];
    case 1:
      return [c, -s];
    case 2:
      return [-s, -c];
    default:
      return [-c, s];
  }
}

/** Euler angles in degrees with the Galacean `Transform.rotation` order (q = qY · qX · qZ). */
export function quatFromEuler(degrees: Vec3): Quat {
  const toHalf = Math.PI / 360;
  const [sx, cx] = sinCos(degrees[0] * toHalf);
  const [sy, cy] = sinCos(degrees[1] * toHalf);
  const [sz, cz] = sinCos(degrees[2] * toHalf);
  return [
    cy * sx * cz + sy * cx * sz,
    sy * cx * cz - cy * sx * sz,
    cy * cx * sz - sy * sx * cz,
    cy * cx * cz + sy * sx * sz
  ];
}

export const identityMatrix = (): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export function multiply(a: Mat4, b: Mat4): number[] {
  const out = new Array<number>(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return out;
}
export const translation = (t: Vec3): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, t[0], t[1], t[2], 1];
export const scaling = (s: Vec3): number[] => [s[0], 0, 0, 0, 0, s[1], 0, 0, 0, 0, s[2], 0, 0, 0, 0, 1];
export function rotation(q: Quat): number[] {
  const [x, y, z, w] = q;
  const xx = x * x,
    yy = y * y,
    zz = z * z,
    xy = x * y,
    xz = x * z,
    yz = y * z,
    wx = w * x,
    wy = w * y,
    wz = w * z;
  return [
    1 - 2 * (yy + zz),
    2 * (xy + wz),
    2 * (xz - wy),
    0,
    2 * (xy - wz),
    1 - 2 * (xx + zz),
    2 * (yz + wx),
    0,
    2 * (xz + wy),
    2 * (yz - wx),
    1 - 2 * (xx + yy),
    0,
    0,
    0,
    0,
    1
  ];
}
export function transformPoint(m: Mat4, p: Vec3): Vec3 {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]
  ];
}
