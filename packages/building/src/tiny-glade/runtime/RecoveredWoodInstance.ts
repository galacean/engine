import type { HorizontalWoodCandidate } from "./RecoveredGablePlank";
import type { PlankBounds } from "./RecoveredWoodPlank";
import { RecoveredCottageRoofSection } from "./RecoveredCottageRoofSampler";
import { RecoveredWallSampler } from "./RecoveredWallSampler";
import { add, sub, mul, div, sqrt, f32, RoofRandom } from "./RecoveredRoofMath";
import { IDENTITY_UNIT_SCALE, type UnitFootprintScale } from "./MaterialFootprint";

/** Inputs owned by the published wall producer. Circular walls use the native
 * curved-domain producer, not this affine instance representation. */
export interface HorizontalAffineWoodHost {
  wallId: bigint;
  shape: { kind: "rectangle"; rectangle: RecoveredCottageRoofSection; maxY: number } | { kind: "freeform" };
  sampler: RecoveredWallSampler;
  gableRanges: readonly (readonly [number, number])[];
  /** Native stone wall with shape tag >= 2; not wooden material selection. */
  irregularStoneTop: boolean;
  colorId: number;
  /** Host target specifications; identity retains native bytes. */
  unitScale?: UnitFootprintScale;
}

export interface HorizontalAffineWoodPiece {
  id: string;
  kind: "ordinary" | "gable";
  cutBounds: PlankBounds;
  bytes: ArrayBuffer;
}

/** Rebind a prepared piece after the batch cut owner has assigned word offsets.
 * Only the count-dependent seed and list token change. Subtract the previous
 * count first so replacing a list is idempotent and never accumulates seed drift.
 * The caller keeps its input bytes; geometry/random sampling is not repeated. */
export function bindHorizontalAffineWoodPiece(
  piece: HorizontalAffineWoodPiece,
  token: number
): HorizontalAffineWoodPiece {
  if (!Number.isInteger(token) || token < 0 || token > 0xffffffff) throw Error("uint32 cut list token required");
  const stride = piece.kind === "gable" ? 96 : 80;
  if (piece.bytes.byteLength !== stride) throw Error("Whole horizontal wood instance required");
  const bytes = piece.bytes.slice(0),
    view = new DataView(bytes);
  const listOffset = stride - 8,
    seedOffset = piece.kind === "gable" ? 48 : 52;
  const previousCount = view.getUint32(listOffset, true) >>> 24;
  view.setUint32(seedOffset, view.getUint32(seedOffset, true) + ((token >>> 24) - previousCount) * 10, true);
  view.setUint32(listOffset, token, true);
  return { ...piece, cutBounds: [...piece.cutBounds], bytes };
}

/** Horizontal affine branch of construct_wall_boards, 0x1010c872c..0x1010c8f38.
 * The list owner receives height-clipped bounds and returns its packed u32
 * token (low 24 bits word offset, high 8 bits count). Count also affects the
 * original shading seed, so binding must happen before seed packing. */
export function buildHorizontalAffineWoodPiece(
  candidate: HorizontalWoodCandidate,
  host: HorizontalAffineWoodHost,
  listForPiece: (bounds: PlankBounds) => number
): HorizontalAffineWoodPiece | null {
  const { wallId, colorId, shape, sampler } = host,
    { pieceId, cut } = candidate;
  const scale = host.unitScale ?? IDENTITY_UNIT_SCALE;
  for (const id of [wallId, pieceId])
    if (typeof id !== "bigint" || id < 0n || id >= 1n << 64n) throw Error("uint64 wall and piece identities required");
  if (!Number.isInteger(colorId) || colorId < 0 || colorId > 0xffffffff) throw Error("uint32 color identity required");
  if (shape.kind === "rectangle" && ("radius" in shape.rectangle.shape || !Number.isFinite(f32(shape.maxY))))
    throw Error("Rectangular wall and finite maxY required");
  if (host.gableRanges.some(([lo, hi]) => !Number.isFinite(f32(lo)) || !Number.isFinite(f32(hi)) || lo > hi))
    throw Error("Finite ordered gable ranges required");
  const [minU, minY, maxU, maxY] = cut.bounds.map(f32);
  if (![minU, minY, maxU, maxY].every(Number.isFinite)) throw Error("Finite plank bounds required");
  const width = sub(maxU, minU),
    center = mul(add(minU, maxU), 0.5),
    projected = sampler.project(center);
  const pair = sampler.samplePairAt(projected);
  let sampledTop = pair ? add(mul(pair.b[4], pair.t), mul(pair.a[4], sub(1, pair.t))) : 1;
  const inGable = host.gableRanges.some(([lo, hi]) => center >= sub(lo, 0.001) && center <= add(hi, 0.001));
  if (!inGable && shape.kind === "rectangle") sampledTop = Math.min(sampledTop, f32(shape.maxY));
  const random = (wallMultiplier: bigint, pieceMultiplier: bigint, offset: bigint) =>
    new RoofRandom(BigInt.asUintN(64, wallId * wallMultiplier + pieceId * pieceMultiplier + offset)).next();
  const extra = host.irregularStoneTop ? mul(random(0x10c6fn, 0xf4243n, 0x11n), 0.2) : 0;
  const top = Math.min(maxY, add(sampledTop, extra)),
    height = sub(top, minY);
  if (!(width > 0) || height < mul(0.05, scale.height)) return null;
  const thicknessRandom = random(0xeb3bn, 0x101eb1n, 0x11n),
    jitterRandom = random(0x184bn, 0x14b291n, 0x75n);
  const thickness = mul(add(sub(mul(thicknessRandom, 0.03), mul(sub(1, thicknessRandom), 0.03)), 0.32), scale.depth);
  const jitter = mul(add(mul(jitterRandom, 0.05), mul(sub(1, jitterRandom), 0)), scale.height);
  let tangent: [number, number, number] | null = null;
  if (shape.kind === "rectangle" && candidate.side !== null) {
    if (!Number.isInteger(candidate.side) || candidate.side < 0 || candidate.side > 3)
      throw Error("Rectangle side 0..3 required");
    const a = shape.rectangle.corner(candidate.side),
      b = shape.rectangle.corner(candidate.side + 1);
    const dx = sub(b[0], a[0]),
      dz = sub(b[1], a[1]),
      inverse = div(1, sqrt(add(mul(dx, dx), mul(dz, dz))));
    if (Number.isFinite(inverse) && inverse > 0) tangent = [mul(dx, inverse), 0, mul(dz, inverse)];
  }
  tangent ??= sampler.tangentBetween(minU, maxU);
  const normal = [-tangent[2], 0, tangent[0]];
  const verticalExtent = add(mul(jitter, 1.5), height);
  const fittedLength = add(width, mul(add(mul(jitterRandom, 0), mul(sub(1, jitterRandom), -0.05)), scale.width));
  // A user-scaled joint can exceed a short boundary fragment. Native identity
  // keeps its exact arithmetic; scaled target sizes retain a positive fragment.
  const length = scale.width === 1 ? fittedLength : Math.max(mul(width, 0.5), fittedLength);
  const along = tangent.map((v) => mul(v, length));
  const across = normal.map((v) => mul(v, thickness));
  const up = [mul(verticalExtent, 0), verticalExtent, mul(verticalExtent, 0)];
  const x = cut.kind === "gable" ? up : across;
  const z = cut.kind === "gable" ? across.map((v) => -v) : up;
  const position = sampler.positionAt(projected);
  const translation = [
    sub(position[0], mul(along[0], 0.5)),
    sub(add(minY, mul(height, 0.5)), mul(along[1], 0.5)),
    sub(position[1], mul(along[2], 0.5))
  ];
  const cutBounds: PlankBounds = [minU, minY, maxU, top];
  const token = listForPiece(cutBounds);
  if (!Number.isInteger(token) || token < 0 || token > 0xffffffff) throw Error("uint32 cut list token required");
  const countSeed = (token >>> 24) * 10;
  const small = add(width, jitter) < 1.5 ? 1 : 0;
  const bytes = new ArrayBuffer(cut.kind === "gable" ? 96 : 80),
    view = new DataView(bytes);
  [...x, ...along, ...z, ...translation].forEach((value, i) => view.setFloat32(i * 4, value, true));
  const wallSeed = Number(BigInt.asUintN(32, wallId)),
    pieceSeed = Number(BigInt.asUintN(32, pieceId));
  if (cut.kind === "gable") {
    view.setUint32(48, wallSeed + pieceSeed + countSeed, true);
    view.setUint32(52, colorId, true);
    view.setUint32(56, cut.flags | small, true);
    cut.skew.forEach((value, i) => view.setFloat32(64 + i * 4, value, true));
    view.setUint32(88, token, true);
  } else {
    view.setUint32(48, wallSeed, true);
    view.setUint32(52, pieceSeed + countSeed, true);
    view.setUint32(56, colorId, true);
    view.setUint32(60, 224 | small, true);
    view.setUint32(72, token, true);
  }
  return { id: candidate.id, kind: cut.kind, cutBounds, bytes };
}
