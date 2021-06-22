import { Component } from "../../Component";
import { AnimationCureOwner } from "./AnimationCureOwner";

/**
 * @internal
 */
export class AnimatorStateData<T extends Component> {
  owners: AnimationCureOwner<T>[] = [];
}
