import type { WorldAxisName } from "./worldAxesConstants";

export type WorldAxisVectorTuple = readonly [number, number, number];
export type WorldAxisColorTuple = readonly [number, number, number, number];

export interface WorldAxisSpec {
  readonly name: WorldAxisName;
  readonly direction: WorldAxisVectorTuple;
  readonly color: WorldAxisColorTuple;
}
