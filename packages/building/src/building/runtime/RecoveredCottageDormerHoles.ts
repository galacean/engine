/** Native dormer opening records, shared by rendering and structural clipping.
 * Native 0x10111332c..0x101113434, SHA 4b3c8437...89a.
 * Exact retained native rank1 48-byte oracle: cottage-full-hole48-recipe.json.
 */
import { f32 as f, add, sub, mul } from "./RecoveredRoofMath";
function rotate(q: readonly number[], v: readonly number[]): number[] {
  const [x, y, z, w] = q;
  const dot = add(add(mul(x, v[0]), mul(y, v[1])), mul(z, v[2]));
  const twiceDot = add(dot, dot);
  const base = sub(mul(w, w), add(mul(z, z), add(mul(x, x), mul(y, y))));
  const twiceW = add(w, w);
  const cross = [sub(mul(y, v[2]), mul(z, v[1])), sub(mul(z, v[0]), mul(x, v[2])), sub(mul(x, v[1]), mul(y, v[0]))];
  return v.map((component, i) => add(add(mul(base, component), mul(q[i], twiceDot)), mul(cross[i], twiceW)));
}
export function cottageFullDormerHole48(
  position: readonly number[],
  quaternion: readonly number[],
  hostSlot: number,
  /** Host resizing extension; original unit-scale records remain byte exact. */
  scale: readonly number[] = [1, 1, 1]
): Uint8Array {
  validateTransform(position, quaternion, hostSlot);
  if (scale.length !== 3 || !scale.every((v) => Number.isFinite(f(v)) && f(v) > 0))
    throw Error("Positive finite dormer scale required");
  const q = quaternion.map(f),
    p = position.map(f);
  const offset = rotate(q, [mul(0.05, scale[0]), mul(0.05, scale[1]), mul(-0.05, scale[2])]);
  const normal = rotate(q, [0, 0, 1]);
  return packHole(
    offset.map((v, i) => add(add(v, p[i]), i === 1 ? mul(0.5, scale[1]) : 0)),
    [mul(0.8, scale[0]), f(scale[1]), mul(0.2, scale[2])],
    normal,
    hostSlot
  );
}
function validateTransform(position: readonly number[], quaternion: readonly number[], hostSlot: number) {
  if (
    position.length !== 3 ||
    quaternion.length !== 4 ||
    ![...position, ...quaternion].every((v) => Number.isFinite(f(v)))
  )
    throw Error("Finite native position3/quaternion4 required");
  if (!Number.isInteger(hostSlot) || hostSlot < 0 || hostSlot > 0xffffffff) throw Error("uint32 host slot required");
}
function packHole(center: number[], extent: number[], normal: number[], hostSlot: number): Uint8Array {
  const raw = new Uint8Array(48),
    view = new DataView(raw.buffer);
  [...center, 0, ...extent, 0, normal[0], normal[2], 1, -50].forEach((v, i) => view.setFloat32(i * 4, v, true));
  view.setUint32(12, hostSlot, true);
  return raw;
}

/** Half-dormer producer0x10110642c: overwrite collision Rectangle3d depth with .63.
 * extraWideHole is the native rank2 secondary-decoration branch; caller owns its RNG/conditions.
 * width/height are native Rectangle3d extent, not a visual AABB.
 */
export function cottageHalfDormerHoles48(
  position: readonly number[],
  quaternion: readonly number[],
  width: number,
  height: number,
  hostSlot: number,
  extraWideHole = false
): Uint8Array[] {
  validateTransform(position, quaternion, hostSlot);
  if (![width, height].every((v) => Number.isFinite(f(v)) && f(v) > 0) || (extraWideHole && f(height) <= f(0.2)))
    throw Error("Positive native collision extent required");
  const normal = rotate(quaternion.map(f), [0, 0, 1]),
    p = position.map(f);
  const make = (distance: number, extent: number[]) => {
    const center = normal.map((v, i) => add(p[i], mul(mul(v, distance), 0.5)));
    return packHole(center, extent, normal, hostSlot);
  };
  const out = [make(add(add(f(0.63), 0.5), -0.05), [f(width), add(f(height), 0.2), add(f(0.63), 0.5)])];
  if (extraWideHole) out.push(make(add(f(0.63), 0.5), [add(f(width), 0.7), add(f(height), -0.2), 0.5]));
  return out;
}
