import { Entity, EntityModifyFlags } from "../../Entity";
import { UICanvas } from "../UICanvas";

export interface IUIElement {
  _entity: Entity;
  _parents: Entity[];
  _rootCanvas: UICanvas;
  _indexInCanvas: number;

  _onEntityModify(flag: EntityModifyFlags): void;
}
