import { Component } from "../Component";
import { Entity } from "../Entity";
import { assignmentClone } from "../clone/CloneManager";

export class CanvasGroup extends Component {
  @assignmentClone
  private _groupAlpha = 1;

  set groupAlpha(val: number) {
    if (this._groupAlpha !== val) {
      this._groupAlpha = Math.max(0, Math.min(val, 1));
    }
  }

  get groupAlpha(): number {
    return this._groupAlpha;
  }

  constructor(entity: Entity) {
    super(entity);
  }
}
