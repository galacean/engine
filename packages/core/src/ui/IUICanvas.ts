import { Camera } from "../Camera";
import { Entity } from "../Entity";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { RenderElement } from "../RenderPipeline/RenderElement";
import type { DisorderedArray } from "../utils/DisorderedArray";
import { IUIElement } from "./IUIElement";

/**
 * The canvas contract the engine pipeline and canvas-hosted renderers work against.
 * Underscore members are engine-internal plumbing implemented by the ui package's `UICanvas`.
 */
export interface IUICanvas {
  entity: Entity;
  sortOrder: number;
  _canvasIndex: number;
  _isRootCanvas: boolean;
  _sortDistance: number;
  _realRenderMode: number;
  _renderElements: RenderElement[];
  _disorderedElements: DisorderedArray<IUIElement>;
  _canRender(camera: Camera): boolean;
  _prepareRender(renderContext: RenderContext): void;
}
