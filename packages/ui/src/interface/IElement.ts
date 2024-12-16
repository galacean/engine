import { Entity } from "@galacean/engine";
import { UICanvas } from "../component/UICanvas";

export interface IElement {
  entity: Entity;
  _indexInCanvas: number;
  _isCanvasDirty: boolean;
  _canvasListeningEntities: Entity[];

  _getCanvas(): UICanvas;
  _canvasListener: (flag: number, param?: any) => void;
}
