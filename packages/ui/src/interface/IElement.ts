import { Entity } from "@galacean/engine";
import { UICanvas } from "..";
import { RootCanvasModifyFlags } from "../component/UICanvas";

export interface IElement {
  entity: Entity;
  _rootCanvas: UICanvas;
  _indexInRootCanvas: number;
  _rootCanvasListeningEntities: Entity[];
  _isRootCanvasDirty: boolean;

  _getRootCanvas(): UICanvas;
  _rootCanvasListener: (flag: number, param?: any) => void;
  _onRootCanvasModify?(flag: RootCanvasModifyFlags): void;
}
