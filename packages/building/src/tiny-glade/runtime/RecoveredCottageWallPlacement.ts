import type { DecorationWindowCut } from "./DecorationWindowCutBuffer";
import { add, sub, mul, div, sqrt, f32, type RoofCurve } from "./RecoveredRoofMath";
import { cottageXzProjectiveRotation } from "./RecoveredCottageRoofSampler";
import type { CottageDormerFrameTransform } from "./RecoveredCottageDormerPlacement";
import { projectWallArclength, sampleWallArclength } from "./RecoveredWallSpace";

export type CottageWallPlacementInput =
  | { kind: "rectangle"; cached: CottageDormerFrameTransform }
  | {
      kind: "curve";
      curve: RoofCurve;
      wallSpaceLength?: number;
      closed: boolean;
      wallX: number;
      pivotY: number;
      collisionWidth: number;
    };

/** Original quaternion-vector multiply, retaining the two-stage dot sum.
 * Fixed wall offsets are in metres and do not multiply cached instance scale. */
export function rotateCottageVector(q: readonly number[], vector: readonly number[]): number[] {
  const [x, y, z, w] = q,
    v = vector.map(f32);
  const base = sub(mul(w, w), add(mul(z, z), add(mul(x, x), mul(y, y))));
  const dot = add(mul(z, v[2]), add(mul(x, v[0]), mul(y, v[1])));
  const twiceDot = add(dot, dot),
    twiceW = add(w, w);
  const cross = [sub(mul(y, v[2]), mul(z, v[1])), sub(mul(z, v[0]), mul(x, v[2])), sub(mul(x, v[1]), mul(y, v[0]))];
  return v.map((component, i) => add(add(mul(component, base), mul(q[i], twiceDot)), mul(cross[i], twiceW)));
}
/** Original generate_cottage_wall_windows pose blocks at 0x1011059fc and
 * 0x1011056d8, glass offset at 0x101105e3c. This covers ordinary/half Cottage
 * wall bodies; full roof dormers have a different placement producer.
 * Curved walls use the published polyline, not an analytic circle. Resizing the
 * collision width is a host extension; the native non-rectangle scale is unity. */
function cottageWallBasePlacement(input: CottageWallPlacementInput): CottageDormerFrameTransform {
  let frame: CottageDormerFrameTransform;
  if (input.kind === "rectangle") {
    const c = input.cached;
    if (
      c.position.length !== 3 ||
      c.quaternion.length !== 4 ||
      c.scale.length !== 3 ||
      ![...c.position, ...c.quaternion, ...c.scale].every((v) => Number.isFinite(f32(v))) ||
      !c.scale.every((v) => f32(v) > 0) ||
      !c.quaternion.some((v) => v !== 0)
    )
      throw Error("Finite original Cottage cached transform required");
    frame = { position: c.position.map(f32), quaternion: c.quaternion.map(f32), scale: c.scale.map(f32) };
  } else {
    const { curve, wallX, pivotY, collisionWidth, closed } = input;
    if (
      !Number.isFinite(f32(pivotY)) ||
      !Number.isFinite(f32(collisionWidth)) ||
      !(f32(collisionWidth) > 0) ||
      curve.points.some((p) => p.length !== 2 || !p.every(Number.isFinite))
    )
      throw Error("Finite planar wall curve, pivot and positive collision width required");
    const wallLength = input.wallSpaceLength ?? curve.length;
    const left = sampleWallArclength(
      curve,
      projectWallArclength(add(wallX, mul(collisionWidth, -0.5)), wallLength, closed)
    );
    const right = sampleWallArclength(
      curve,
      projectWallArclength(add(wallX, mul(collisionWidth, 0.5)), wallLength, closed)
    );
    const dx = sub(right[0], left[0]),
      dz = sub(right[1], left[1]);
    const inverse = div(1, sqrt(add(mul(dx, dx), mul(dz, dz))));
    if (!Number.isFinite(inverse)) throw Error("Cottage wall chord collapses to one point");
    frame = {
      position: [add(mul(left[0], 0.5), mul(right[0], 0.5)), f32(pivotY), add(mul(left[1], 0.5), mul(right[1], 0.5))],
      quaternion: cottageXzProjectiveRotation([-mul(dz, inverse), 0, mul(dx, inverse)]),
      scale: [1, 1, 1]
    };
  }
  return frame;
}

export function recoveredCottageWallPlacement(input: CottageWallPlacementInput) {
  const frame = cottageWallBasePlacement(input);
  if (input.kind === "rectangle" || input.closed) {
    const offset = rotateCottageVector(frame.quaternion, [0, 0, 0.14]);
    frame.position = frame.position.map((v, i) => add(v, offset[i]));
  }
  if (input.kind === "curve" && !input.closed) return { frame, glass: undefined };
  const inset = rotateCottageVector(frame.quaternion, [0, 0, 0.07]);
  const glass = {
    position: frame.position.map((v, i) => sub(v, inset[i])),
    quaternion: frame.quaternion.slice(),
    scale: frame.scale.slice()
  };
  return { frame, glass };
}

/** generate_cottage_wall_windows blueprint32 emission (retained producer086):
 * the cut uses the final frame position INCLUDING its fixed .14 wall offset,
 * unlike Gothic's pre-offset chord midpoint. The normal is quaternion * +Z.
 * Ordinary and half Cottage bodies share this producer; roof dormers do not.
 * Retain a material-independent intent for later local material substitution.
 * scaleXY is our authoring extension, not a field in the native blueprint32. */
export function recoveredCottageWallCut(
  frame: CottageDormerFrameTransform,
  rank: 1 | 2 | 3,
  anchor: readonly [number, number],
  closed: boolean,
  scaleXY: readonly [number, number] = [1, 1]
): DecorationWindowCut {
  if (
    ![1, 2, 3].includes(rank) ||
    frame.position.length !== 3 ||
    frame.quaternion.length !== 4 ||
    ![...frame.position, ...frame.quaternion, ...anchor].every((v) => Number.isFinite(f32(v))) ||
    scaleXY.length !== 2 ||
    !scaleXY.every((v) => f32(v) > 0 && Number.isFinite(f32(v)))
  )
    throw Error("Finite Cottage cut pose, anchor and positive scale required");
  const normal = rotateCottageVector(frame.quaternion, [0, 0, 1]);
  return {
    anchor: [f32(anchor[0]), f32(anchor[1])],
    normalXZ: [normal[0], normal[2]],
    origin: [f32(frame.position[0]), f32(frame.position[1]), f32(frame.position[2])],
    layer: rank - 1,
    flags: Number(!closed),
    scaleXY: [f32(scaleXY[0]), f32(scaleXY[1])]
  };
}

/** generate_cottage_balcony_doors, retained producer105: both rectangular and
 * curved walls sample the collision-width chord. Body and blueprint32 share
 * its midpoint with no window-style .14 offset; native layer is rank | 8.
 * Arbitrary source scaling is a host extension, applied once by the adapter. */
export function recoveredCottageDoorPlacement(
  input: Extract<CottageWallPlacementInput, { kind: "curve" }>,
  rank: 1 | 2 | 3,
  sourceScale: readonly [number, number, number] = [1, 1, 1]
) {
  if (sourceScale.length !== 3 || !sourceScale.every((v) => f32(v) > 0 && Number.isFinite(f32(v))))
    throw Error("Positive finite Cottage door scale required");
  const frame = cottageWallBasePlacement(input);
  frame.scale = sourceScale.map(f32);
  const windowCut = recoveredCottageWallCut(frame, rank, [input.wallX, input.pivotY], input.closed, [
    sourceScale[0],
    sourceScale[1]
  ]);
  windowCut.layer = rank | 8;
  return { frame, windowCut };
}
