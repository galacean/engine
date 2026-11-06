import { add, sub, mul, div, sqrt, f32, RoofCurve } from "./RecoveredRoofMath";
import type { DecorationStoneBone } from "./DecorationStoneInstance";

// Authored source profiles at 0x101265558. These are asset constants, not
// generated scene caches. Half Gothic/arrow mapping: 0x10118c39c/0x1011c05c0.
const GOTHIC_PROFILES = [
  [
    [0.0, 1.2599999904632568],
    [0.20000000298023224, 1.090000033378601],
    [0.3499999940395355, 0.8700000047683716],
    [0.4399999976158142, 0.6200000047683716],
    [0.47999998927116394, 0.36000001430511475],
    [0.47999998927116394, -0.949999988079071]
  ],
  [
    [0.0, 1.7000000476837158],
    [0.20999999344348907, 1.600000023841858],
    [0.38999998569488525, 1.4600000381469727],
    [0.5400000214576721, 1.2899999618530273],
    [0.6499999761581421, 1.090000033378601],
    [0.7200000286102295, 0.8799999952316284],
    [0.75, 0.6499999761581421],
    [0.75, -0.949999988079071]
  ],
  [
    [0.0, 2.25],
    [0.20999999344348907, 2.140000104904175],
    [0.4000000059604645, 2.0],
    [0.5699999928474426, 1.8200000524520874],
    [0.7099999785423279, 1.6299999952316284],
    [0.8199999928474426, 1.4199999570846558],
    [0.8999999761581421, 1.190000057220459],
    [0.949999988079071, 0.9599999785423279],
    [0.9599999785423279, 0.7200000286102295],
    [0.9599999785423279, -0.949999988079071]
  ]
];
export type StoneHalfFamily = "gothic" | "arrow";
function checkRank(family: StoneHalfFamily, rank: number) {
  if (![1, 2, 3].includes(rank) || (family === "arrow" && rank === 1))
    throw Error("Half Gothic requires rank 1..3; half arrow requires rank 2 or 3");
}
/** Inputs use the original three hat bones ordered left/center/right.
 * Author resizing scales the source profile Y; X follows the already resized
 * bones. Fixed outward offsets stay in metres, as in the original producer. */
export function gothicHalfDormerProfiles(input: {
  family: StoneHalfFamily;
  rank: 1 | 2 | 3;
  bones: readonly [DecorationStoneBone, DecorationStoneBone, DecorationStoneBone];
  circle: boolean;
  wallTop: number;
  heightScale?: number;
}): [RoofCurve, RoofCurve] {
  checkRank(input.family, input.rank);
  const heightScale = input.heightScale ?? 1;
  if (
    !Number.isFinite(f32(input.wallTop)) ||
    !(heightScale > 0) ||
    !Number.isFinite(f32(heightScale)) ||
    input.bones.some(
      (b) =>
        b.position.length !== 3 ||
        b.normalXZ.length !== 2 ||
        [...b.position, ...b.normalXZ].some((v) => !Number.isFinite(f32(v)))
    )
  )
    throw Error("Finite half-dormer bones, wall top and positive height scale required");
  const source =
    input.family === "arrow"
      ? [
          [-0, f32(1.27)],
          [f32(0.6), 0]
        ]
      : GOTHIC_PROFILES[input.rank - 1];
  const offset =
    input.family === "gothic" && input.circle ? [f32(0.25), f32(0.3), f32(0.29)][input.rank - 1] : f32(0.38);
  const center = input.bones[1];
  return [input.bones[0], input.bones[2]].map((side) => {
    const mapped = source.map(([x, y]) => {
      const t = Math.max(0, Math.min(1, div(x, source[source.length - 1][0]))),
        inverse = sub(1, t);
      const normal = center.normalXZ.map((v, i) => add(mul(v, inverse), mul(side.normalXZ[i], t)));
      const inverseLength = div(1, sqrt(add(mul(normal[0], normal[0]), mul(normal[1], normal[1]))));
      if (!Number.isFinite(inverseLength)) throw Error("Half-dormer normal interpolation collapses");
      const position = center.position.map((v, i) => add(mul(v, inverse), mul(side.position[i], t)));
      return [
        add(position[0], mul(mul(normal[0], inverseLength), offset)),
        add(add(mul(y, heightScale), position[1]), mul(0, offset)),
        add(position[2], mul(mul(normal[1], inverseLength), offset))
      ];
    });
    const points = [mapped[0]];
    for (let i = 1; i < mapped.length; i++) {
      const current = mapped[i - 1],
        next = mapped[i];
      if (next[1] < f32(input.wallTop)) {
        const t = div(sub(input.wallTop, current[1]), sub(next[1], current[1]));
        points.push(current.map((v, k) => add(v, mul(sub(next[k], v), t))));
        break;
      }
      points.push(next);
    }
    return new RoofCurve(points);
  }) as [RoofCurve, RoofCurve];
}

/** Native Hole48 emission blocks 0x10118be38 and 0x101103d5c.
 * Position is the producer frame position, not the separate roof cache anchor.
 * Callers supply scaled collider extents/center; native arrow W/H stay fixed
 * unless the author explicitly resizes the model. */
export function stoneHalfDormerHole48(input: {
  family: StoneHalfFamily;
  rank: 1 | 2 | 3;
  position: readonly number[];
  forward: readonly number[];
  collisionCenterY: number;
  collisionExtent: readonly number[];
  slot: number;
  sourceScale?: readonly [number, number, number];
}): Uint8Array {
  checkRank(input.family, input.rank);
  const scale = input.sourceScale ?? [1, 1, 1];
  if (
    !Number.isInteger(input.slot) ||
    input.slot < 0 ||
    input.slot > 0xffffffff ||
    input.position.length !== 3 ||
    input.forward.length !== 3 ||
    input.collisionExtent.length !== 3 ||
    ![...input.position, ...input.forward, input.collisionCenterY, ...input.collisionExtent, ...scale].every((v) =>
      Number.isFinite(f32(v))
    ) ||
    !input.collisionExtent.every((v) => v > 0) ||
    !scale.every((v) => v > 0)
  )
    throw Error("Invalid half-dormer hole inputs");
  const arrow = input.family === "arrow";
  const extent = arrow
    ? [mul(0.7, scale[0]), mul(2.54, scale[1]), add(input.collisionExtent[2], 0.5)]
    : [input.collisionExtent[0], input.collisionExtent[1], f32(1.13)];
  const bytes = new Uint8Array(48),
    view = new DataView(bytes.buffer);
  input.position.forEach((v, i) =>
    view.setFloat32(
      i * 4,
      add(add(v, i === 1 ? input.collisionCenterY : 0), mul(mul(input.forward[i], 0.5), 0.5)),
      true
    )
  );
  view.setUint32(12, input.slot, true);
  extent.forEach((v, i) => view.setFloat32(16 + i * 4, v, true));
  view.setFloat32(32, input.forward[0], true);
  view.setFloat32(36, input.forward[2], true);
  view.setFloat32(40, arrow ? 2.5 : [2, 2.2, 1.85][input.rank - 1], true);
  view.setFloat32(44, arrow ? 0.05 : [-0.011, -0.131, 0.059][input.rank - 1], true);
  return bytes;
}
