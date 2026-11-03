/** Portable original wall-domain inputs. No native pointer, scene snapshot or runtime dependency. */
export type WallRect = [number, number, number, number];
export interface WallHole {
  bounds: WallRect;
  flags: number;
}
export interface WallCurve {
  pointsXZ: [number, number][];
  knots: number[];
  length: number;
}
export interface WallProfile {
  unitScale?: import("./MaterialFootprint").UnitFootprintScale;
  id: string;
  slot: number;
  curve: WallCurve;
  top: number[];
  bottom: number[];
  third: number[];
  seed: bigint;
  /** Original S0..S4: endpoint jitter, bottom anchor, width extension, thickness factor, wall height. */
  parameters: [number, number, number, number, number];
  mode: number;
  roof: { height: number; ranges: [number, number, number, number]; kind: number };
  widthExtension: boolean;
  scaleThickness: boolean;
  extendTop: boolean;
  holes: WallHole[];
  holeLength: number;
  holesClosed: boolean;
}
export interface WallPiece {
  bounds: WallRect;
  deformation: [number, number, number, number];
  id: number;
  splitY: boolean;
  splitX: boolean;
}
export interface WallRow {
  y0: number;
  y1: number;
  u0: number;
  u1: number;
  aboveStart: number;
  aboveEnd: number;
}
export interface WallInstance {
  id: string;
  sourceId: number;
  row: number;
  column: number;
  domain96: Uint8Array;
  packed64: Uint8Array;
}
