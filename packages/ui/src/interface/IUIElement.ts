import { Entity } from "@galacean/engine";
import { UICanvas } from "../component/UICanvas";

export interface IUIElement {
  entity: Entity;
  _parents: Entity[];
  _rootCanvas: UICanvas;
  _indexInCanvas: number;

  _onEntityModify(flag: number): void;
}
