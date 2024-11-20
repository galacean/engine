import { Entity } from "@galacean/engine";
import { UICanvas } from "../component/UICanvas";

export interface IElement {
  entity: Entity;
  readonly canvas: UICanvas;

  _indexInCanvas: number;
  _isCanvasDirty: boolean;

  _canvasListeningEntities: Entity[];
  _canvasListener: (flag: number, param?: any) => void;
}
