/** Original animation root 0x100933ca4, settled progress 1. No asset mirroring.
 * baseQuaternion is WindowShutter32[0..16], reconstructed upstream from forward.
 * Source side 0 becomes flag 1, source side 1 becomes flag 0.
 * The full native transient easing is not implemented by this settled helper.
 */
export function settledWindowShutterRotation(baseQuaternion: readonly number[], side: 0 | 1): number[] {
  if (
    baseQuaternion.length !== 4 ||
    !baseQuaternion.every((v) => Number.isFinite(Math.fround(v))) ||
    !baseQuaternion.some((v) => v !== 0) ||
    (side !== 0 && side !== 1)
  )
    throw Error("Finite shutter base quaternion and side 0/1 required");
  const f = Math.fround;
  const mul = (a: number, b: number) => f(f(a) * f(b));
  const add = (a: number, b: number) => f(f(a) + f(b));
  const sign = side === 0 ? 1 : -1;
  // Original degrees-to-radians constant bits 0x3c8efa35.
  const angle = mul(mul(mul(sign, 60), 0.01745329238474369), 0.5);
  const sin = f(Math.sin(angle));
  const cos = f(Math.cos(angle));
  const q = [mul(0, sin), mul(1, sin), mul(0, sin), cos];
  const rev = [q[1], q[0], q[3], q[2]];
  const extRev = [rev[2], rev[3], rev[0], rev[1]];
  const ext = [q[2], q[3], q[0], q[1]];
  // Preserve SIMD operation grouping and signed zero, rather than normalizing Q.
  const sx = [1, -1, 1, -1],
    sy = [1, 1, -1, -1],
    sz = [-1, 1, 1, -1];
  return q.map((v, i) =>
    add(
      add(mul(v, baseQuaternion[3]), mul(mul(extRev[i], baseQuaternion[0]), sx[i])),
      add(mul(mul(ext[i], baseQuaternion[1]), sy[i]), mul(mul(rev[i], baseQuaternion[2]), sz[i]))
    )
  );
}

/** Original 0x100927130: yaw/pitch pose from forward, discarding source roll.
 * Native caller supplies Q * +Z; unlike XZ projective rotation, preserves Y.
 * Degenerate vertical forward has no fallback in original and produces NaNs.
 */
export function windowShutterBaseQuaternion(forward: readonly number[]): number[] {
  if (forward.length !== 3 || !forward.every((v) => Number.isFinite(Math.fround(v))))
    throw Error("Finite shutter forward required");
  const f = Math.fround;
  const m = (a: number, b: number) => f(f(a) * f(b));
  const a = (a: number, b: number) => f(f(a) + f(b));
  const s = (a: number, b: number) => f(f(a) - f(b));
  const div = (a: number, b: number) => f(f(a) / f(b));
  const sqrt = (a: number) => f(Math.sqrt(f(a)));
  const x = f(forward[0]),
    y = f(forward[1]),
    z = f(forward[2]);
  const yNegZero = m(y, -0);
  let rx = a(yNegZero, z),
    ry = a(m(x, 0), m(z, -0)),
    rz = s(f(-x), yNegZero);
  const nr = div(1, sqrt(a(m(rz, rz), a(m(rx, rx), m(ry, ry)))));
  rx = m(rx, nr);
  ry = m(ry, nr);
  rz = m(rz, nr);
  let ux = s(m(y, rz), m(z, ry));
  let uy = s(m(z, rx), m(x, rz));
  let uz = s(m(x, ry), m(y, rx));
  const nu = div(1, sqrt(a(m(uz, uz), a(m(ux, ux), m(uy, uy)))));
  ux = m(ux, nu);
  uy = m(uy, nu);
  uz = m(uz, nu);
  const sumXY = a(ry, ux),
    sumXZ = a(x, rz),
    diffXZ = s(x, rz),
    sumYZ = a(y, uz),
    diffYZ = s(uz, y),
    diffXY = s(ry, ux);
  if (z <= 0) {
    const diff = s(uy, rx),
      oneMinusZ = s(1, z);
    if (diff > 0) {
      const t = a(oneMinusZ, diff),
        k = div(0.5, sqrt(t));
      return [m(sumXY, k), m(t, k), m(sumYZ, k), m(diffXZ, k)];
    }
    const t = s(oneMinusZ, diff),
      k = div(0.5, sqrt(t));
    return [m(t, k), m(sumXY, k), m(sumXZ, k), m(diffYZ, k)];
  }
  const sum = a(rx, uy),
    onePlusZ = a(z, 1);
  if (sum > 0) {
    const t = a(onePlusZ, sum),
      k = div(0.5, sqrt(t));
    return [m(diffYZ, k), m(diffXZ, k), m(diffXY, k), m(t, k)];
  }
  const t = s(onePlusZ, sum),
    k = div(0.5, sqrt(t));
  return [m(sumXZ, k), m(sumYZ, k), m(t, k), m(diffXY, k)];
}
