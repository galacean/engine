import { add, sub, mul, div, sqrt, f32, randomSplits, RoofRandom, cross } from "./RecoveredRoofMath";
import { encodeBrick96 } from "./UnitPacking.js";

export interface StoneArchPillarProposal {
  /** Sample identity supplied in wall-path traversal order, not a decoration ID. */
  key: number;
  direction: readonly [number, number];
  position: readonly [number, number, number];
  height: number;
  wallU: number;
}
export interface ResolvedStoneArchPillarProposal extends StoneArchPillarProposal {
  direction: [number, number];
  position: [number, number, number];
  splitHeight: number;
}

/** Original add_proposal 0x1010719c8. Only adjacent equal sample keys combine:
 * keep the tallest proposal (first on a tie) and the lowest split height.
 * Sorting or globally deduplicating keys changes the native traversal contract.
 * REA ev_74b4d3d83553a691a1468009b11b86202615e147437641dcb2e3b64a4c3237bf. */
export function resolveStoneArchPillarProposals(
  proposals: readonly StoneArchPillarProposal[]
): ResolvedStoneArchPillarProposal[] {
  const result: ResolvedStoneArchPillarProposal[] = [];
  for (const proposal of proposals) {
    if (
      !Number.isSafeInteger(proposal.key) ||
      proposal.key < 0 ||
      proposal.direction.length !== 2 ||
      proposal.position.length !== 3 ||
      ![...proposal.direction, ...proposal.position, proposal.height, proposal.wallU].every((x) =>
        Number.isFinite(f32(x))
      ) ||
      proposal.height < 0 ||
      proposal.wallU < 0 ||
      proposal.wallU > 1
    )
      throw Error("Invalid stone arch pillar proposal");
    const height = f32(proposal.height),
      previous = result.at(-1);
    const splitHeight = previous?.key === proposal.key ? Math.min(previous.splitHeight, height) : height;
    if (previous?.key === proposal.key && height <= previous.height) {
      previous.splitHeight = splitHeight;
      continue;
    }
    const owned: ResolvedStoneArchPillarProposal = {
      key: proposal.key,
      direction: [f32(proposal.direction[0]), f32(proposal.direction[1])],
      position: [f32(proposal.position[0]), f32(proposal.position[1]), f32(proposal.position[2])],
      height,
      wallU: f32(proposal.wallU),
      splitHeight
    };
    if (previous?.key === proposal.key) result[result.length - 1] = owned;
    else result.push(owned);
  }
  return result;
}

export interface StoneArchPillarInput {
  height: number;
  /** Height supplied by the native pillar-proposal resolver; not a floor count. */
  splitHeight: number;
  position: readonly [number, number, number];
}
export interface StoneArchPillarPiece {
  dimensions: [number, number, number];
  position: [number, number, number];
}

/** assemble_stone_pillar 0x1010e18d8, including its original random_splits/RNG
 * consumption and the separate cap/foot branches. The caller owns proposal
 * selection, wall orientation and instance encoding.
 * REA ev_49b311bd08f237b3cef13d7a04736e32327271cbbda09f062cafb7e191579e60.
 * Build 4b3c843710a5f17fdb460d3f7add420f14ec2a2718fb7ebd677c3c8ba0ac589a. */
export function assembleStoneArchPillar(input: StoneArchPillarInput, rng: RoofRandom): StoneArchPillarPiece[] {
  const { position } = input;
  if (
    position.length !== 3 ||
    !position.every((x) => Number.isFinite(f32(x))) ||
    ![input.height, input.splitHeight].every((x) => Number.isFinite(f32(x)) && x >= 0)
  )
    throw Error("Invalid stone arch pillar input");
  const top = add(input.height, 0.2),
    split = add(input.splitHeight, 0.2),
    baseY = add(position[1], -0.2);
  const sections =
    top <= f32(1.26)
      ? [{ from: 0, to: split, cap: false }]
      : [
          { from: 0, to: split, cap: true },
          { from: split, to: top, cap: Math.abs(sub(top, split)) > f32(1.2) }
        ];
  const result: StoneArchPillarPiece[] = [];
  const pointAt = (y: number): [number, number, number] => [
    add(position[0], mul(y, 0)),
    add(baseY, y),
    add(position[2], mul(y, 0))
  ];
  for (const section of sections) {
    const span = sub(sub(section.to, section.from), section.cap ? 0.25 : 0);
    const count = Math.max(3, Math.ceil(div(span, 0.56)));
    if (!Number.isSafeInteger(count)) throw Error("Stone arch pillar exceeds numeric capacity");
    // Even a zero-length upper section consumes the original split samples.
    const boundaries = randomSplits(count, div(0.28, span), rng).map((t) => add(section.from, mul(t, span)));
    if (section.cap) boundaries.push(section.to);
    for (let i = 0; i < boundaries.length - 1; i++) {
      const a = pointAt(boundaries[i]),
        b = pointAt(boundaries[i + 1]);
      const dx = sub(b[0], a[0]),
        dy = sub(b[1], a[1]),
        dz = sub(b[2], a[2]);
      const length = sqrt(add(mul(dz, dz), add(mul(dy, dy), mul(dx, dx))));
      if (length < f32(0.01)) continue;
      const cap = section.cap && i === boundaries.length - 2;
      let width: number, depth: number;
      if (cap) {
        width = f32(0.7);
        depth = 0.8400000333786011;
      } else {
        const a = rng.next(),
          b = rng.next();
        width = add(sub(mul(a, 0.05), mul(sub(1, a), 0.05)), 0.42000001668930054);
        depth = add(sub(mul(b, 0.05), mul(sub(1, b), 0.05)), 0.7);
      }
      result.push({
        dimensions: [width, length, depth],
        position: a.map((v, j) => mul(add(v, b[j]), 0.5)) as [number, number, number]
      });
    }
  }
  if (top > f32(2.1))
    result.push({
      dimensions: [f32(0.72), 0.5, f32(0.85)],
      position: [f32(position[0]), add(baseY, -0.25), f32(position[2])]
    });
  return result;
}

export interface StoneArchPillarBrickInput {
  piece: StoneArchPillarPiece;
  /** Native proposal tangent; the proposal owner is responsible for normalization. */
  direction: readonly [number, number];
  wallU: number;
  wallLength: number;
  sourceId: number;
  slot: number;
}

/** Original pillar callback 0x1010e1500. The ±.23 wall-space interval is kept
 * even for a larger cap or foot; it is not inferred from the visible width.
 * REA ev_b832f4fc2da313a62a039366645c0015c1c54db8dda5ec32bc99f25ffbe32f9d. */
export function stoneArchPillarBrick(input: StoneArchPillarBrickInput): { domain96: Uint8Array; packed64: Uint8Array } {
  const { piece, direction, wallU, wallLength, sourceId, slot } = input;
  const uint = (x: number) => Number.isInteger(x) && x >= 0 && x <= 0xffffffff;
  if (
    direction.length !== 2 ||
    !direction.every((x) => Number.isFinite(f32(x))) ||
    ![piece.dimensions, piece.position].every((p) => p.length === 3 && p.every((x) => Number.isFinite(f32(x)))) ||
    piece.dimensions.some((x) => !(f32(x) > 0)) ||
    !uint(sourceId) ||
    !uint(slot) ||
    !(f32(wallLength) > 0) ||
    !Number.isFinite(f32(wallLength)) ||
    !Number.isFinite(wallU) ||
    wallU < 0 ||
    wallU > 1
  )
    throw Error("Invalid stone arch pillar brick input");
  const tangent = [f32(direction[0]), 0, f32(direction[1])];
  const side = cross(tangent, [0, 1, 0]);
  const length = sqrt(add(mul(side[2], side[2]), add(mul(side[0], side[0]), mul(side[1], side[1]))));
  if (!(length > 0) || !Number.isFinite(length)) throw Error("Degenerate stone arch pillar direction");
  const inverse = div(1, length);
  for (let i = 0; i < 3; i++) side[i] = mul(side[i], inverse);
  const up = cross(side, tangent);
  const column = (x: number, y: number, z: number) =>
    tangent.map((v, i) => add(add(mul(v, x), mul(up[i], y)), mul(side[i], z)));
  const [width, height, depth] = piece.dimensions;
  const values = [
    ...column(width, 0, 0),
    ...column(0, height, 0),
    ...column(0, 0, depth),
    ...piece.position,
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
  view.setUint32(76, sourceId, true);
  view.setUint32(80, slot, true);
  const center = mul(wallU, wallLength);
  view.setFloat32(84, add(center, -0.23), true);
  view.setFloat32(88, add(center, 0.23), true);
  return { domain96, packed64: encodeBrick96(domain96) };
}
