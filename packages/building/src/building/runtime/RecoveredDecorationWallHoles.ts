import { add, sub, mul } from "./RecoveredRoofMath";
import type { WallConnectionWipHole } from "./WallConnectionTypes";
import { requireDecorationCollision, type ConstructionDecorationCollisions } from "./ConstructionDecorationCollisions";

/** Cottage generator 086 uses collision width/minY/maxY. Only circular hosts
 * reduce source width by rank * .05; the source Y interval is never shrunk.
 * Half dormers use their selected half collider here, unlike the ordinary
 * collider used by the earlier is_half_dormer predicate. */
export function cottageDecorationWallHole(
  collisions: ConstructionDecorationCollisions | undefined,
  rank: 1 | 2 | 3,
  circular: boolean,
  pivotU: number,
  pivotY: number,
  scaleX: number,
  scaleY: number,
  subtype: "wall" | "half" = "wall"
): WallConnectionWipHole {
  const bounds = requireDecorationCollision(
    collisions,
    `window_cottage_${rank}x1${subtype === "half" ? "_halfdormer" : ""}_collision`
  );
  if (!bounds) throw Error("Missing Cottage window collision bounds");
  return {
    centerU: pivotU,
    centerY: pivotY,
    width: mul(add(sub(bounds.max[0], bounds.min[0]), circular ? [-0.05, -0.1, -0.15][rank - 1] : 0), scaleX),
    height: mul(sub(bounds.max[1], bounds.min[1]), scaleY),
    kind: 0
  };
}

/** Balcony-door generator 105 writes the original placement center, collision
 * width and maxY-minY, with no circular-host shrink or visual-bounds ratio. */
export function cottageDoorWallHole(
  collisions: ConstructionDecorationCollisions | undefined,
  rank: 1 | 2 | 3,
  pivotU: number,
  pivotY: number,
  scaleX: number,
  scaleY: number
): WallConnectionWipHole {
  const bounds = requireDecorationCollision(collisions, `balcony_door_rank${rank}_collision`);
  if (!bounds) throw Error("Missing Cottage door collision bounds");
  return {
    centerU: pivotU,
    centerY: pivotY,
    width: (bounds.max[0] - bounds.min[0]) * scaleX,
    height: (bounds.max[1] - bounds.min[1]) * scaleY,
    kind: 0
  };
}

/** Native arrow-slit generator: the largest opening is a cross, represented by
 * two intersecting masonry bands, not the rectangular collision AABB. */
export function arrowDecorationWallHoles(
  rank: 1 | 2 | 3,
  centerU: number,
  pivotY: number,
  scaleX: number,
  scaleY: number
): WallConnectionWipHole[] {
  const dimensions =
    rank === 1
      ? [[0.5, 0.5]]
      : rank === 2
        ? [[0.4, 1.5]]
        : [
            [0.4, 1.7],
            [0.605, 0.55]
          ];
  return dimensions.map(([width, height]) => ({
    centerU,
    centerY: pivotY,
    width: Math.fround(width) * scaleX,
    height: Math.fround(height) * scaleY,
    kind: 0
  }));
}

/** generate_gothic_wall_windows, original ARM64 0x10118b97c..0x10118bba0.
 * Each pointed window reserves three progressively narrower masonry bands.
 * The stone backing mask and wooden-wall SDF are separate native consumers;
 * these bands are not a substitute for those surface masks.
 * Coordinates are the shared source-model XY frame, NOT each part's bounds.
 * Binary SHA256: 4b3c843710a5f17fdb460d3f7add420f14ec2a2718fb7ebd677c3c8ba0ac589a.
 */
const gothicBands = [
  [
    [-0.2874999940395355, 0.6991999745368958, 1.3339999914169312],
    [0.5404999852180481, 0.5888000130653381, 0.4945000112056732],
    [0.9085000157356262, 0.3599499762058258, 0.3449999988079071]
  ],
  [
    [-0.09800000488758087, 1.1679999828338623, 1.7000000476837158],
    [1.0019999742507935, 1.093000054359436, 0.5299999713897705],
    [1.3519999980926514, 0.6129999756813049, 0.30000001192092896]
  ],
  [
    [0.23000000417232513, 1.5080000162124634, 2.3499999046325684],
    [1.5800000429153442, 1.2430000305175781, 0.3799999952316284],
    [1.8300000429153442, 0.8130000233650208, 0.3400000035762787]
  ]
] as const;

/** Gothic balcony door 0x1011bb1d4, table 0x1026146a0..0x10261470b.
 * REA ev_d0023de3ec839a9025589fd4fa25bc3f132d341e87e22eb3e9fbb7ee2437eebb. */
const gothicDoorBands = [
  [
    [-0.2, 1.13, 2.56],
    [1.14, 0.81, 0.4],
    [1.34, 0.41, 0.4]
  ],
  [
    [-0.41, 1.4, 2.32],
    [0.98, 1.31, 0.48],
    [1.34, 0.8, 0.32]
  ],
  [
    [-0.33, 2.04, 2.64],
    [1.15, 1.62, 0.39],
    [1.42, 1, 0.46]
  ]
] as const;

export function gothicDecorationWallHoles(
  rank: 1 | 2 | 3,
  centerU: number,
  pivotY: number,
  scaleX: number,
  scaleY: number,
  kind: "window" | "door" = "window"
): WallConnectionWipHole[] {
  if (
    ![1, 2, 3].includes(rank) ||
    ![centerU, pivotY, scaleX, scaleY].every(Number.isFinite) ||
    scaleX <= 0 ||
    scaleY <= 0
  )
    throw Error("Invalid Gothic masonry cut transform");
  return (kind === "door" ? gothicDoorBands : gothicBands)[rank - 1].map(([y, width, height]) => ({
    centerU,
    centerY: pivotY + Math.fround(y) * scaleY,
    width: Math.fround(width) * scaleX,
    height: Math.fround(height) * scaleY,
    kind: 0
  }));
}
