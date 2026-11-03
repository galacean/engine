import type { DecorationWindowCut } from "./DecorationWindowCutBuffer";
import { requireDecorationCollision, type ConstructionDecorationCollisions } from "./ConstructionDecorationCollisions";
import { add, sub, mul, div, f32 } from "./RecoveredRoofMath";
import type { ConnectionXZ, WallConnectionWipHole } from "./WallConnectionTypes";

/** generate_cottage_corner_windows, original ARM64 0x101140d90.
 * Binary SHA256 4b3c843710a5f17fdb460d3f7add420f14ec2a2718fb7ebd677c3c8ba0ac589a.
 * Native attachment selects the corner upstream; this kernel never snaps a
 * normal wall attachment to a nearby corner. Optional set dressing and the
 * wooden-wall SDF are separate consumers, not represented by the masonry hole.
 */
export interface CottageCornerPlacementInput {
  rank: 1 | 2 | 3;
  corner: ConnectionXZ;
  /** Native ordered directions from the corner into its two incident edges. */
  edgeDirs: readonly [ConnectionXZ, ConnectionXZ];
  normalXZ: ConnectionXZ;
  wallX: number;
  pivotY: number;
  wooden: boolean;
}

export interface CottageCornerFrame {
  origin: [number, number, number];
  normalXZ: ConnectionXZ;
}

export function recoveredCottageCornerPlacement(
  collisions: ConstructionDecorationCollisions | undefined,
  input: CottageCornerPlacementInput
) {
  const { rank, corner, edgeDirs, normalXZ, wallX, pivotY } = input;
  if (
    ![1, 2, 3].includes(rank) ||
    ![...corner, ...edgeDirs.flat(), ...normalXZ, wallX, pivotY].every((v) => Number.isFinite(f32(v))) ||
    [...edgeDirs, normalXZ].some((v) => Math.abs(Math.hypot(...v) - 1) > 1e-5)
  )
    throw Error("Invalid native Cottage corner attachment");
  const collision = requireDecorationCollision(collisions, `window_cottage_corner_${rank}x1_collision`);
  const collisionWidth = sub(collision.max[0], collision.min[0]);
  const halfReach = div(collisionWidth, 1.4142135);
  const endpoints = edgeDirs.map((dir) => corner.map((v, i) => add(v, mul(dir[i], halfReach))) as ConnectionXZ);
  const midpoint = corner.map((_, i) => add(mul(endpoints[0][i], 0.5), mul(endpoints[1][i], 0.5)));
  const origin: [number, number, number] = [
    add(midpoint[0], mul(normalXZ[0], 0.35638183)),
    f32(pivotY),
    add(midpoint[1], mul(normalXZ[1], 0.35638183))
  ];
  const sides: CottageCornerFrame[] = edgeDirs.map((dir, i) => ({
    origin: [
      add(mul(corner[0], 0.65), mul(endpoints[i][0], 0.35)),
      f32(pivotY),
      add(mul(corner[1], 0.65), mul(endpoints[i][1], 0.35))
    ],
    // The native side rotation is rotate90Left(dir), including the first edge.
    // Do not replace it with two outward-facing wall normals.
    normalXZ: [f32(-dir[1]), f32(dir[0])]
  }));
  const hole: WallConnectionWipHole = {
    centerU: f32(wallX),
    centerY: f32(pivotY),
    width: sub(add(halfReach, halfReach), 0.504),
    height: sub(collision.max[1], collision.min[1]),
    kind: 0
  };
  // add_lintels 0x1011047f0: two rigid instances of the same original mesh.
  const lintelHeight = f32(0.7150000929832458);
  const lintelScaleX = mul(rank === 1 ? 1 : 0.82, div(halfReach, 0.9));
  const lintels = sides.map((side, index) => {
    const offset = rank === 1 ? 0 : mul(index === 0 ? -1 : 1, 0.08099999278783798);
    return {
      origin: [
        add(side.origin[0], mul(side.normalXZ[1], offset)),
        add(side.origin[1], lintelHeight),
        sub(side.origin[2], mul(side.normalXZ[0], offset))
      ] as [number, number, number],
      normalXZ: side.normalXZ,
      scaleX: lintelScaleX
    };
  });
  const lintelHole: WallConnectionWipHole | undefined = input.wooden
    ? undefined
    : {
        centerU: f32(wallX),
        centerY: add(pivotY, lintelHeight),
        width: add(collisionWidth, 0.35999998450279236),
        height: f32(0.2),
        kind: 0
      };
  return {
    windowCut: {
      anchor: [f32(wallX), f32(pivotY)],
      normalXZ: normalXZ.map(f32) as ConnectionXZ,
      // Original blueprint32 uses the final rigid frame/glass transform.
      origin: [...origin],
      layer: rank + 14,
      flags: 0
    } satisfies DecorationWindowCut,
    origin,
    normalXZ: normalXZ.map(f32) as ConnectionXZ,
    endpoints,
    sides,
    lintels,
    halfReach,
    hole,
    lintelHole
  };
}

/** Rectangle2d helper order, checked against controlled original instructions.
 * ID 0=(-X,-Z), 1=(-X,+Z), 2=(+X,+Z), 3=(+X,-Z).
 * The generator also has a non-rectangle path; this helper makes no claim about
 * upstream corner eligibility on circular or arbitrary curved hosts.
 */
export function recoveredRectangleCornerDirections(cornerId: 0 | 1 | 2 | 3, orientation: ConnectionXZ) {
  if (
    !Number.isInteger(cornerId) ||
    cornerId < 0 ||
    cornerId > 3 ||
    !orientation.every(Number.isFinite) ||
    Math.abs(Math.hypot(...orientation) - 1) > 1e-5
  )
    throw Error("Invalid rectangle corner identity or orientation");
  const directions: [ConnectionXZ, ConnectionXZ][] = [
    [
      [1, 0],
      [0, 1]
    ],
    [
      [0, -1],
      [1, 0]
    ],
    [
      [-1, 0],
      [0, -1]
    ],
    [
      [0, 1],
      [-1, 0]
    ]
  ];
  const normals: ConnectionXZ[] = [
    [-1, -1],
    [-1, 1],
    [1, 1],
    [1, -1]
  ];
  const [c, s] = orientation;
  const rotate = ([x, z]: ConnectionXZ): ConnectionXZ => [sub(mul(c, x), mul(s, z)), add(mul(s, x), mul(c, z))];
  return {
    edgeDirs: directions[cornerId].map(rotate) as [ConnectionXZ, ConnectionXZ],
    normalXZ: rotate(normals[cornerId].map((v) => mul(v, 0.70710677)) as ConnectionXZ)
  };
}
