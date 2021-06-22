import { Component } from "../Component";
import { AnimationCureOwner } from "./AnimationCureOwner";
import { AnimatorState } from "./AnimatorState";
import { StatePlayState } from "./enums/StatePlayState";

/**
 * @internal
 */
export class AnimatorStateData<T extends Component> {
  owners: AnimationCureOwner<T>[] = [];
  frameTime: number;
  playState: StatePlayState;
  state: AnimatorState;
}
