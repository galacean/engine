import { Ray, Vector4 } from "@galacean/engine-math";
import { Entity, EntityModifyFlags } from "../../Entity";
import { HitResult } from "../../physics";
import { UICanvas } from "../UICanvas";
import { UIGroup } from "../UIGroup";

export interface IUIElement {
  depth: number;

  raycastEnable: boolean;
  raycastPadding: Vector4;

  _entity: Entity;
  _parents: Entity[];
  _rootCanvas: UICanvas;
  _indexInCanvas: number;
  _group: UIGroup;
  _indexInGroup: number;

  _raycast(ray: Ray, out: HitResult, distance: number): boolean;
  _onEntityModify(flag: EntityModifyFlags): void;
}
