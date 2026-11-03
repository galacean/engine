import { add, sub, mul, div, sqrt, f32, cross } from "./RecoveredRoofMath";
import { encodeBrick96 } from "./UnitPacking.js";
import type { StoneArchWalkSegment } from "./RecoveredStoneArchWalker";

export interface StoneArchBrickInput {
  segment: StoneArchWalkSegment;
  baseSeed: number;
  index: number;
  slot: number;
  wallLength: number;
}

/** construct_arches emission callback 0x1010a440c. Length follows each chord,
 * the cross section is .42 × .7, and the original shader receives a stable
 * uint32 seed. No independent CPU position/rotation jitter is added here.
 * REA ev_6906d83a1cb56c06e48759a2a3b2624ba7d77721fac48b040f1b7d322e6f11db.
 * Build: 4b3c843710a5f17fdb460d3f7add420f14ec2a2718fb7ebd677c3c8ba0ac589a. */
export function stoneArchBrick(input: StoneArchBrickInput): {
  sourceId: number;
  domain96: Uint8Array;
  packed64: Uint8Array;
} {
  const { segment, baseSeed, index, slot } = input;
  const uint = (x: number) => Number.isInteger(x) && x >= 0 && x <= 0xffffffff;
  if (
    !uint(baseSeed) ||
    !uint(slot) ||
    !Number.isSafeInteger(index) ||
    index < 0 ||
    !(f32(input.wallLength) > 0) ||
    !Number.isFinite(f32(input.wallLength)) ||
    ![segment.start, segment.end].every((p) => p.length === 3 && p.every((x) => Number.isFinite(f32(x)))) ||
    ![segment.startU, segment.endU].every((x) => Number.isFinite(f32(x)) && x >= 0 && x <= 1)
  )
    throw Error("Invalid stone arch brick input");

  const delta = segment.end.map((v, i) => sub(v, segment.start[i]));
  const length = sqrt(add(add(mul(delta[0], delta[0]), mul(delta[1], delta[1])), mul(delta[2], delta[2])));
  const inverse = div(1, length),
    direction = delta.map((x) => mul(x, inverse));
  const side = cross(direction, [0, 1, 0]);
  const sideLength = sqrt(add(mul(side[2], side[2]), add(mul(side[0], side[0]), mul(side[1], side[1]))));
  if (!(length > 0) || !Number.isFinite(length) || !(sideLength > 0)) throw Error("Degenerate stone arch brick frame");
  const sideInverse = div(1, sideLength);
  for (let i = 0; i < 3; i++) side[i] = mul(side[i], sideInverse);
  const up = cross(side, direction);
  // Keep original matrix multiplication terms/order, including signed zero.
  const column = (x: number, y: number, z: number) =>
    direction.map((v, i) => add(add(mul(v, x), mul(up[i], y)), mul(side[i], z)));
  const values = [
    ...column(length, 0, 0),
    ...column(0, 0.42000001668930054, 0),
    ...column(0, 0, f32(0.7)),
    ...segment.start.map((v, i) => mul(add(v, segment.end[i]), 0.5)),
    0,
    0,
    0,
    0,
    -100,
    -100,
    -100
  ];
  const domain96 = new Uint8Array(96),
    view = new DataView(domain96.buffer);
  values.forEach((v, i) => view.setFloat32(i * 4, v, true));
  const sourceId = (baseSeed + (index >>> 0)) >>> 0;
  view.setUint32(76, sourceId, true);
  view.setUint32(80, slot, true);
  view.setFloat32(84, mul(segment.startU, input.wallLength), true);
  const endU = f32(segment.endU) < f32(segment.startU) ? add(segment.endU, 1) : f32(segment.endU);
  view.setFloat32(88, mul(endU, input.wallLength), true);
  // Native default BrickTransform flags remain zero, unlike ordinary wall bricks.
  return { sourceId, domain96, packed64: encodeBrick96(domain96) };
}
