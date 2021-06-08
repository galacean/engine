import { Component } from "../Component";
import { AnimatorState } from "./AnimatorState";
import { CurveData } from "./CurveData";
import { PlayType } from "./enums/PlayType";

/**
 * @internal
 */
export class AnimatorStateData<T extends Component> {
  state: AnimatorState;
  frameTime: number;
  playType: PlayType;
  curveDatas: CurveData<T>[] = [];
}
