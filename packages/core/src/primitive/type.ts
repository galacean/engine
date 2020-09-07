import { UpdateType, TypedArray } from "../base/Constant";

export interface UpdateRange {
  offset: number;
  end: number;
}

export interface UpdateRangeMap {
  [x: number]: UpdateRange;
  [x: string]: UpdateRange;
}

export interface UpdateTypeMap {
  [x: number]: UpdateType;
  [x: string]: UpdateType;
}

export interface DataMap {
  [x: number]: TypedArray;
  [x: string]: TypedArray;
}

export interface SemanticMap {
  [x: string]: number;
}

export class BufferAttribute {}
