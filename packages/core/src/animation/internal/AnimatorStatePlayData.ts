import { Component } from "../../Component";
import { AnimationCureOwner } from "./AnimationCureOwner";
import { AnimatorStateData } from "./AnimatorStataData";
import { AnimatorState } from "../AnimatorState";
import { StatePlayState } from "../enums/StatePlayState";

/**
 * @internal
 */
export class AnimatorStatePlayData<T extends Component> {
  state: AnimatorState;
  stateData: AnimatorStateData<T>;
  frameTime: number;
  playState: StatePlayState;
}
