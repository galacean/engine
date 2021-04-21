import { Entity } from "../Entity";
import { EngineObject } from "../base/EngineObject";

/**
 * Base class for AnimationClips and BlendTrees.
 */
export class Motion extends EngineObject {
  /**
   * @internal
   */
  _target: Entity;

  /**
   * @internal
   */
  _setTarget(target: Entity) {}
}
