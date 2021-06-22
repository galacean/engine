import { Component } from "../Component";
import { AnimatorState } from "./AnimatorState";
import { CurveData } from "./CurveData";
import { StatePlayState } from "./enums/StatePlayState";

/**
 * @internal
 */
export class AnimatorStateData<T extends Component> {
  state: AnimatorState;
  frameTime: number;
  playState: StatePlayState;
  curveDataCollection: CurveData<T>[] = [];
}
