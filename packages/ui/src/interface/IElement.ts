import { Entity } from "@galacean/engine";
import { UICanvas } from "../component/UICanvas";

export interface IElement {
  entity: Entity;

  _rootCanvas: UICanvas;
  _indexInRootCanvas: number;
  _elementDirty: number;

  _canvasListeningEntities: Entity[];
  _canvasListener: (flag: number, param?: any) => void;
}
