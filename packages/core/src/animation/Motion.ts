import { Entity } from "../Entity";

/**
 * Base class for AnimationClips and BlendTrees.
 */
export class Motion {
  /** @internal */
  _target: Entity;

  /** @internal */
  _setTarget(target: Entity): void {}
}
