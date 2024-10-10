import { Ray, Vector4 } from "@galacean/engine-math";
import { Entity, EntityModifyFlags } from "../../Entity";
import { UIHitResult } from "../../input/pointer/emitter/UIHitResult";
import { UICanvas } from "../UICanvas";
import { UIGroup, UIGroupModifyFlags } from "../UIGroup";

export interface IUIElement {
  depth: number;

  raycastEnable: boolean;
  raycastPadding: Vector4;

  _entity: Entity;
  _parents: Entity[];
  _canvas: UICanvas;
  _indexInCanvas: number;
  _group: UIGroup;
  _indexInGroup: number;

  _raycast(ray: Ray, out: UIHitResult, distance: number): boolean;
  _onGroupModify(flag: UIGroupModifyFlags): void;
  _onEntityModify(flag: EntityModifyFlags): void;
}
