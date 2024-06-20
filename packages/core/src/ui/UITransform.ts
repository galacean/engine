import { Vector2 } from "@galacean/engine-math";
import { Component } from "../Component";
import { Entity } from "../Entity";
import { UpdateFlagManager } from "../UpdateFlagManager";
import { deepClone, ignoreClone } from "../clone/CloneManager";

export class UITransform extends Component {
  @deepClone
  private _rect: Vector2 = new Vector2(100, 100);
  @deepClone
  private _pivot: Vector2 = new Vector2(0.5, 0.5);
  /** @internal */
  @ignoreClone
  _updateFlagManager: UpdateFlagManager = new UpdateFlagManager();

  get rect(): Vector2 {
    return this._rect;
  }

  set rect(val: Vector2) {
    const { _rect: rect } = this;
    if (rect === val) return;
    (rect.x !== val.x || rect.y !== val.y) && rect.copyFrom(val);
  }

  get pivot(): Vector2 {
    return this._pivot;
  }

  set pivot(val: Vector2) {
    const { _pivot: pivot } = this;
    if (pivot === val) return;
    (pivot.x !== val.x || pivot.y !== val.y) && pivot.copyFrom(val);
  }

  constructor(entity: Entity) {
    super(entity);
    // @ts-ignore
    this._rect._onValueChanged = this._onRectChange.bind(this);
    // @ts-ignore
    this._pivot._onValueChanged = this._onPivotChange.bind(this);
  }

  private _onRectChange(): void {
    this._updateFlagManager.dispatch(UITransformModifyFlags.Rect);
  }

  private _onPivotChange(): void {
    this._updateFlagManager.dispatch(UITransformModifyFlags.Pivot);
  }
}

export enum UITransformModifyFlags {
  /** Rect. */
  Rect = 1,
  /** Pivot. */
  Pivot = 2
}
