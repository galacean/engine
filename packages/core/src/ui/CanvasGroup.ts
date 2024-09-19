import { Component } from "../Component";
import { Entity } from "../Entity";
import { assignmentClone } from "../clone/CloneManager";
import { ComponentType } from "../enums/ComponentType";

export class CanvasGroup extends Component {
  @assignmentClone
  ignoreParentGroup = false;
  @assignmentClone
  raycastEnabled = true;
  @assignmentClone
  raycastThrough = true;

  /** @internal */
  _globalAlpha = 1;
  @assignmentClone
  private _alpha = 1;

  set alpha(val: number) {
    if (this._alpha !== val) {
      this._alpha = Math.max(0, Math.min(val, 1));
    }
  }

  get alpha(): number {
    return this._alpha;
  }

  constructor(entity: Entity) {
    super(entity);
    this._componentType = ComponentType.CanvasGroup;
  }
}
