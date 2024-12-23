import { Camera } from "../Camera";
import { Entity } from "../Entity";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { RenderElement } from "../RenderPipeline/RenderElement";

/**
 * @internal
 */
export interface IUICanvas {
  entity: Entity;
  sortOrder: number;
  _canvasIndex: number;
  _renderElement: RenderElement;
  _canRender(camera: Camera): boolean;
  _prepareRender(renderContext: RenderContext): void;
}
