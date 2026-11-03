import { add, sub, mul, f32 } from "./RecoveredRoofMath";

/** Native is_half_dormer comparator, 0x101130db8..0x101130df8.
 * The caller resolves the top-boundary curve and excludes flat roofs, gable
 * ends and open walls before this test. This uses the ORDINARY family collider;
 * the selected half producer subsequently owns a different collider.
 */
export function halfDormerCrossesEave(
  pivotY: number,
  ordinaryMinY: number,
  ordinaryMaxY: number,
  wallTop: number
): boolean {
  if (![pivotY, ordinaryMinY, ordinaryMaxY, wallTop].every((v) => Number.isFinite(f32(v))))
    throw Error("Finite half-dormer height inputs required");
  if (f32(ordinaryMaxY) <= f32(ordinaryMinY)) throw Error("Positive ordinary collider height required");
  const center = mul(add(ordinaryMinY, ordinaryMaxY), 0.5);
  const height = sub(ordinaryMaxY, ordinaryMinY);
  // This half-center term is intentional: replacing it with maxY changes
  // asymmetric Gothic colliders. Equality remains an ordinary wall window.
  const windowTop = add(pivotY, mul(add(height, center), 0.5));
  return f32(wallTop) < windowTop;
}

/** Native rank-2 Cottage shutter selection. The caller supplies the actual
 * stone-foundation condition, not the project's lower-body/column height.
 * Undefined transition means that the native foundation suppression is disabled.
 * This flag owns BOTH shutters and their additional roof opening.
 */
export function cottageHalfDormerHasShutters(
  rank: 1 | 2 | 3,
  seed: number,
  pivotY: number,
  collisionMinY: number,
  foundationTransitionY: number | undefined
): boolean {
  if (![1, 2, 3].includes(rank) || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw Error("Cottage rank 1..3 and uint32 seed required");
  if (
    ![pivotY, collisionMinY, ...(foundationTransitionY === undefined ? [] : [foundationTransitionY])].every((v) =>
      Number.isFinite(f32(v))
    )
  )
    throw Error("Finite Cottage foundation inputs required");
  if (rank !== 2) return false;
  if (foundationTransitionY !== undefined && add(pivotY, collisionMinY) <= f32(foundationTransitionY)) return false;
  const initial = BigInt.asUintN(64, BigInt(seed) * 0x759839da217fn + 0x13c7ca9293765n) ^ 0x4d595df4d0f33173n;
  const state = BigInt.asUintN(64, initial + 0xa0761d6478bd642fn);
  const product = (state ^ 0xe7037ed1a0b428dbn) * state;
  return ((product ^ (product >> 64n)) & 0x80000000n) !== 0n;
}
