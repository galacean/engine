import { Entity } from "./../Entity";
import { EngineObject } from "../base/EngineObject";

export class Motion extends EngineObject {
  /**
   * @internal
   */
  _target: Entity;

  set target(target: Entity) {}
}
