import { RecoveredCottageRoofSampler, RecoveredCottageRoofSection } from "./RecoveredCottageRoofSampler";
import { RecoveredWallSampler } from "./RecoveredWallSampler";
import { add, sub, mul, div, sqrt, f32 } from "./RecoveredRoofMath";
import { splitOversizedWoodPlank, type PlankBounds } from "./RecoveredWoodPlank";
export type HorizontalGablePlank =
  | { kind: "ordinary"; bounds: PlankBounds }
  | { kind: "gable"; bounds: PlankBounds; skew: [number, number, number, number]; flags: 6 }
  | { kind: "discard" };
export interface GableWallSpace {
  rectangle: RecoveredCottageRoofSection;
  /** WallSpace length, which need not equal the rectangle's perimeter. */
  length: number;
}

/** Published planner output after cutout subtraction and narrow-board merging. */
export interface HorizontalWoodBoard {
  bounds: PlankBounds;
  side: number | null;
  isTop: boolean;
}
export interface HorizontalWoodCandidate {
  /** Geometry-derived identity; appearance is deliberately not an input. */
  id: string;
  pieceId: bigint;
  splitIndex: number;
  side: number | null;
  cut: Exclude<HorizontalGablePlank, { kind: "discard" }>;
}

/** Original construct_wall_boards horizontal sequence up to top-board shrink.
 * Planning, height rejection, transform/colour packing and SDF list binding are
 * separate producer stages. In particular these are candidates, not final draws. */
export function* horizontalWoodCandidates(
  boards: Iterable<HorizontalWoodBoard>,
  wallId: bigint,
  maximumLength: number,
  roof: RecoveredCottageRoofSampler | null,
  wall: GableWallSpace,
  sampler: RecoveredWallSampler
): Generator<HorizontalWoodCandidate> {
  const counters = new Map<number | null, bigint>();
  for (const board of boards) {
    const side = board.side;
    if (side !== null && (!Number.isInteger(side) || side < 0 || side > 3))
      throw Error("Rectangle side 0..3 or no side required");
    const ordinal = counters.get(side) ?? 0n;
    counters.set(side, ordinal + 1n);
    const pieceId = ordinal + (side === null ? 0n : BigInt(side) * 1000000n);
    let splitIndex = 0;
    for (const bounds of splitOversizedWoodPlank(board.bounds, wallId, pieceId, true, maximumLength)) {
      const index = splitIndex++;
      const cut = shrinkHorizontalGablePlank(bounds, board.isTop, roof, wall, sampler, side);
      if (cut.kind !== "discard")
        yield { id: `${wallId}/${side ?? "curve"}/${ordinal}/${index}`, pieceId, splitIndex: index, side, cut };
    }
  }
}

/** Native 0x1010f1fbc: project both roof-section corners onto the original
 * wall side, without clamping to the side. Assembly explicitly sorts endpoints. */
export function gableRoofSideSpan(
  roof: RecoveredCottageRoofSampler,
  wall: GableWallSpace,
  side: number,
  position: readonly [number, number],
  height: number
): [number, number] | null {
  if (!Number.isInteger(side) || side < 0 || side > 3) throw Error("Rectangle side 0..3 required");
  const section = roof.sectionAt([position[0], height, position[1]]);
  if ("radius" in section.shape || "radius" in wall.rectangle.shape) return null;
  const a = wall.rectangle.corner(side),
    b = wall.rectangle.corner(side + 1);
  const dx = sub(b[0], a[0]),
    dz = sub(b[1], a[1]);
  const square = add(mul(dx, dx), mul(dz, dz));
  const length = sqrt(square),
    denominator = Math.max(square, f32(1e-20));
  const base = mul(wall.rectangle.cornerParameters()[side], wall.length);
  const project = (p: [number, number]) =>
    add(base, mul(length, div(add(mul(sub(p[0], a[0]), dx), mul(sub(p[1], a[1]), dz)), denominator)));
  const u = project(section.corner(side)),
    v = project(section.corner(side + 1));
  return [Math.min(u, v), Math.max(u, v)];
}

/** Native shrink_horizontal_gable_top_plank_aabb (0x1010f3eb0).
 * Bounds and skew are derived together before instance packing. Skew is in
 * the horizontal plank's local axes, not world Y; do not apply it to upright boards. */
export function shrinkHorizontalGablePlank(
  bounds: PlankBounds,
  isTop: boolean,
  roof: RecoveredCottageRoofSampler | null,
  wall: GableWallSpace,
  sampler: RecoveredWallSampler,
  side: number | null
): HorizontalGablePlank {
  const box = bounds.map(f32) as [number, number, number, number];
  if (!box.every(Number.isFinite)) throw Error("Finite plank bounds required");
  if (!isTop) return { kind: "ordinary", bounds: box };
  if (!roof || side === null) return { kind: "discard" };
  // Original caller projects once before sample_pair_at projects again.
  const center = sampler.project(mul(add(box[0], box[2]), 0.5));
  const position = sampler.positionAt(center);
  const bottom = gableRoofSideSpan(roof, wall, side, position, box[1]);
  const top = gableRoofSideSpan(roof, wall, side, position, box[3]);
  if (!bottom || !top) return { kind: "discard" };
  const wider = sub(bottom[1], bottom[0]) < sub(top[1], top[0]) ? top : bottom;
  const min = Math.max(box[0], wider[0]),
    max = Math.min(box[2], wider[1]);
  const width = sub(max, min);
  if (!(max > min && width > 0)) return { kind: "discard" };
  const skew = [bottom[0], top[0], bottom[1], top[1]].map((v) => Math.max(0, Math.min(1, div(sub(v, min), width)))) as [
    number,
    number,
    number,
    number
  ];
  return { kind: "gable", bounds: [min, box[1], max, box[3]], skew, flags: 6 };
}
