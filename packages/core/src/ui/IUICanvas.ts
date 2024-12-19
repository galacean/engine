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
  _prepareRender(renderContext: RenderContext): void;
}
