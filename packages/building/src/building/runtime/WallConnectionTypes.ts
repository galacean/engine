/** Analytic connection producer boundaries. IDs are native uint64 identities,
 * not array indices. World XZ, wall arclength U and vertical world Y are distinct. */
export type ConnectionXZ = [number, number];
export interface WallConnectionWipHole {
  /** Host attachment identity, scoped to its building; never part of the native ABI. */
  decorationId?: string;
  /** Material-specific fitting recess, not a through-opening in structural support. */
  decorationRecess?: true;
  centerU: number;
  centerY: number;
  width: number;
  height: number;
  kind: number;
}
export interface WallConnectionFinalHole {
  minU: number;
  minY: number;
  maxU: number;
  maxY: number;
  kind: number;
  seamCopy: boolean;
}
export type WallConnectionShape =
  | { type: "circle"; center: ConnectionXZ; radius: number; phase: number }
  | { type: "rectangle"; center: ConnectionXZ; orientation: ConnectionXZ; width: number; depth: number };
export interface WallConnectionCrossing {
  point: ConnectionXZ;
  directions: [ConnectionXZ, ConnectionXZ];
  tag: number;
  endpointDistance: number;
  /** Original alternating event label for cyclic hole pairing. */
  crossingKind: 0 | 1;
}
