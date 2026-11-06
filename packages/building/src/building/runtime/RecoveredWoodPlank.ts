import { add, sub, mul, div, f32, RoofRandom } from "./RecoveredRoofMath";

/** Wall-space rectangle: min arclength, min height, max arclength, max height. */
export type PlankBounds = readonly [number, number, number, number];

function finiteBounds(bounds: PlankBounds): [number, number, number, number] {
  const box = bounds.map(f32) as [number, number, number, number];
  if (box.length !== 4 || !box.every(Number.isFinite) || box[0] > box[2] || box[1] > box[3])
    throw Error("Finite ordered plank bounds required");
  return box;
}

/** Original subdivide_region_into_planks, 0x1010f2b04. ARM64 FRINTA rounds
 * the dimension/pitch ratio; the decompiled integer cast is misleading.
 * Iteration is lazy so the caller retains control of its generation budget. */
export function* subdivideWoodRegion(bounds: PlankBounds, pitch: number, horizontal: boolean): Generator<PlankBounds> {
  const box = finiteBounds(bounds),
    step = f32(pitch),
    axis = horizontal ? 1 : 0;
  if (!(step > 0) || !Number.isFinite(step)) throw Error("Finite positive plank pitch required");
  const span = sub(box[axis + 2], box[axis]);
  const count = Math.max(1, Math.round(div(span, step)));
  if (!Number.isSafeInteger(count)) throw Error("Plank subdivision exceeds exact JavaScript indexing");
  for (let i = 0; i < count; i++) {
    const piece = [...box] as [number, number, number, number];
    const from = add(box[axis], div(mul(span, f32(i)), f32(count)));
    piece[axis] = horizontal ? add(from, 0) : from;
    piece[axis + 2] = add(box[axis], div(mul(span, f32(i + 1)), f32(count)));
    yield piece;
  }
}

/** Original split_oversized_board_piece, 0x1010f2730. The seed uses float
 * endpoint bits and full uint64 identities, not rounded coordinates. Native
 * stack order emits the lower/left partition first and preserves stable order. */
export function* splitOversizedWoodPlank(
  bounds: PlankBounds,
  wallId: bigint,
  pieceId: bigint,
  horizontal: boolean,
  maximumLength: number
): Generator<PlankBounds> {
  const box = finiteBounds(bounds),
    max = f32(maximumLength);
  if (!Number.isFinite(max)) throw Error("Finite plank length limit required");
  for (const id of [wallId, pieceId])
    if (typeof id !== "bigint" || id < 0n || id >= 1n << 64n) throw Error("uint64 wall and piece identities required");
  const limit = Math.max(max, f32(0.05)),
    axis = horizontal ? 0 : 1;
  const stack: PlankBounds[] = [box],
    bits = new DataView(new ArrayBuffer(4));
  const endpointBits = (x: number) => {
    bits.setFloat32(0, x, true);
    return BigInt(bits.getUint32(0, true));
  };
  while (stack.length) {
    const piece = stack.pop()!,
      lo = piece[axis],
      hi = piece[axis + 2],
      span = sub(hi, lo);
    if (span <= limit) {
      yield piece;
      continue;
    }
    const seed = BigInt.asUintN(
      64,
      (endpointBits(lo) * 0x10c6fn) ^ (endpointBits(hi) * 0x17cfbn) ^ wallId ^ (pieceId * 0xf4243n)
    );
    const random = new RoofRandom(seed).next();
    const fraction = horizontal ? add(mul(random, 0.85), mul(sub(1, random), 0.15)) : add(mul(random, 0.4), 0.3);
    const split = add(lo, mul(span, fraction));
    // Host representability failure: the native recursion can stop advancing at
    // large f32 coordinates. Report it rather than silently emit an oversized board.
    if (!(split > lo && split < hi)) throw Error("Plank split is not representable at these f32 coordinates");
    const upper = [...piece] as [number, number, number, number],
      lower = [...piece] as [number, number, number, number];
    upper[axis] = split;
    lower[axis + 2] = split;
    stack.push(upper, lower);
  }
}
