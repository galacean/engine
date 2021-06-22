import { Component } from "../../Component";
import { AnimationCureOwner } from "./AnimationCureOwner";

/**
 * @internal
 */
export class AnimatorStateData {
  owners: AnimationCureOwner<Component>[] = [];
}
