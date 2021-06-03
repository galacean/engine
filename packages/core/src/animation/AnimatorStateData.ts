import { AnimatorState } from "./AnimatorState";
import { CurveData } from "./CurveData";
import { PlayType } from "./enums/PlayType";

/**
 * @internal
 */
export class AnimatorStateData {
  state: AnimatorState;
  frameTime: number;
  playType: PlayType;
  curveDatas: CurveData[] = [];
}
