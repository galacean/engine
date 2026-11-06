/** Analytic connection producer boundaries. IDs are native uint64 identities,
 * not array indices. World XZ, wall arclength U and vertical world Y are distinct. */
export type ConnectionXZ = [number, number];
export interface WallStitchCandidate {
  unitScale?: import("./MaterialFootprint").UnitFootprintScale;
  tag: number;
  endpointDistance: number;
  point: ConnectionXZ;
  minY: number;
  maxY: number;
  directions: [ConnectionXZ, ConnectionXZ];
  wallIds: [bigint, bigint];
  /** Host random appearance inputs; native callers default to wallIds. */
  wallSeeds?: [bigint, bigint];
  terrainY: number;
  kinds: [number, number];
  beam: boolean;
}
export interface WallStitchPlacement {
  quaternion: number[];
  position: number[];
  scale: number[];
  direction: ConnectionXZ;
  wallIds: [bigint, bigint];
  /** Host random appearance inputs; native callers default to wallIds. */
  wallSeeds?: [bigint, bigint];
  kinds: [number, number];
  sourceCandidate: number;
  unit: "brick" | "wooden_plank";
  /** Native beam ownership chooses one side; brick retains both for encoding. */
  selectedWallId?: bigint;
  selectedKind?: number;
}
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
/** The published curve is a producer input: terrain/path edits must be resolved
 * upstream. Top values are absolute Y; third values are offsets from baseY. */
export interface WallConnectionOwner {
  unitScale?: import("./MaterialFootprint").UnitFootprintScale;
  id: bigint;
  seed?: bigint;
  shape: WallConnectionShape;
  points: [number, number, number][];
  top: number[];
  third: number[];
  baseY: number;
  maxY: number;
  maxYGable: number;
  material: number;
  style: number;
  foundationOffset: number;
  flatRoof: boolean;
}
export interface WallConnectionCrossing {
  point: ConnectionXZ;
  directions: [ConnectionXZ, ConnectionXZ];
  tag: number;
  endpointDistance: number;
  /** Original alternating event label for cyclic hole pairing. */
  crossingKind: 0 | 1;
}
