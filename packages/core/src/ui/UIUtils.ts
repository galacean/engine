import { Matrix, Vector4 } from "@galacean/engine-math";
import { DisorderedArray } from "../DisorderedArray";
import { Engine } from "../Engine";
import { Entity } from "../Entity";
import { RenderQueue } from "../RenderPipeline";
import { ContextRendererUpdateFlag } from "../RenderPipeline/RenderContext";
import { VirtualCamera } from "../VirtualCamera";
import { ComponentType } from "../enums/ComponentType";
import { RenderQueueType } from "../shader";
import { UICanvas } from "./UICanvas";
import { GroupModifyFlags, UIGroup } from "./UIGroup";
import { UITransform } from "./UITransform";
import { IUIElement } from "./interface/IUIElement";

export class UIUtils {
  private static _renderQueue: RenderQueue;
  private static _virtualCamera: VirtualCamera;

  static registerEntityListener(element: IUIElement): void {
    const parents = element._parents;
    const root = element._rootCanvas?.entity;
    let entity = element._entity;
    let index = 0;
    while (entity && entity !== root) {
      const preParent = parents[index];
      if (preParent !== entity) {
        preParent?._unRegisterModifyListener(element._onEntityModify);
        parents[index] = entity;
        entity._registerModifyListener(element._onEntityModify);
      }
      entity = entity.parent;
      index++;
    }
    parents.length = index;
  }

  static unRegisterEntityListener(element: IUIElement): void {
    const { _parents: parents } = element;
    for (let i = 0, n = parents.length; i < n; i++) {
      parents[i]._unRegisterModifyListener(element._onEntityModify);
    }
    parents.length = 0;
  }

  static registerUIToCanvas(element: IUIElement, canvas: UICanvas): void {
    const preCanvas = element._rootCanvas;
    if (preCanvas !== canvas) {
      element._rootCanvas = canvas;
      if (preCanvas) {
        const replaced = preCanvas._disorderedElements.deleteByIndex(element._indexInCanvas);
        replaced && (replaced._indexInCanvas = element._indexInCanvas);
        element._indexInCanvas = -1;
        preCanvas._hierarchyDirty = true;
      }
      if (canvas) {
        const disorderedElements = canvas._disorderedElements;
        element._indexInCanvas = disorderedElements.length;
        disorderedElements.add(element);
        canvas._hierarchyDirty = true;
      } else {
        element.depth = -1;
      }
    }
  }

  static registerUIToGroup(element: IUIElement, group: UIGroup): void {
    const preGroup = element._group;
    if (preGroup !== group) {
      element._group = group;
      if (preGroup) {
        const replaced = preGroup._disorderedElements.deleteByIndex(element._indexInGroup);
        replaced && (replaced._indexInGroup = element._indexInGroup);
        element._indexInGroup = -1;
      }
      if (group) {
        const disorderedElements = group._disorderedElements;
        element._indexInGroup = disorderedElements.length;
        disorderedElements.add(element);
      }
      element._onGroupModify(GroupModifyFlags.All);
    }
  }

  static getRootCanvasInParent(entity: Entity): UICanvas {
    while (entity) {
      const components = entity._components;
      for (let i = 0, n = components.length; i < n; i++) {
        const component = components[i];
        if (
          component.enabled &&
          component._componentType === ComponentType.UICanvas &&
          (<UICanvas>component)._isRootCanvas
        ) {
          return <UICanvas>component;
        }
      }
      entity = entity.parent;
    }
    return null;
  }

  static getGroupInParents(entity: Entity): UIGroup {
    let meetRootCanvas = false;
    while (entity) {
      const components = entity._components;
      for (let i = 0, n = components.length; i < n; i++) {
        const component = components[i];
        if (component.enabled) {
          switch (component._componentType) {
            case ComponentType.UIRenderer:
              meetRootCanvas = (<UICanvas>component)._isRootCanvas;
              break;
            case ComponentType.UIGroup:
              return <UIGroup>component;
            default:
              break;
          }
        }
      }
      if (meetRootCanvas) {
        return null;
      }
      entity = entity.parent;
    }
    return null;
  }

  static render(engine: Engine, uiCanvases: DisorderedArray<UICanvas>): void {
    if (uiCanvases.length <= 0) return;
    const uiRenderQueue = (this._renderQueue ||= new RenderQueue(RenderQueueType.Transparent));
    const virtualCamera = (this._virtualCamera ||= new VirtualCamera());
    const { canvas, _hardwareRenderer: rhi, _renderContext: renderContext, _batcherManager: batcherManager } = engine;
    const { elements: projectE } = virtualCamera.projectionMatrix;
    const { elements: viewE } = virtualCamera.viewMatrix;
    (projectE[0] = 2 / canvas.width), (projectE[5] = 2 / canvas.height), (projectE[10] = 0);
    rhi.activeRenderTarget(null, new Vector4(0, 0, 1, 1), renderContext.flipProjection, 0);
    for (let i = 0, n = uiCanvases.length; i < n; i++) {
      const uiCanvas = uiCanvases.get(i);
      if (!uiCanvas) continue;
      const transform = <UITransform>uiCanvas.entity.transform;
      (viewE[12] = -transform.position.x), (viewE[13] = -transform.position.y);
      Matrix.multiply(virtualCamera.projectionMatrix, virtualCamera.viewMatrix, virtualCamera.viewProjectionMatrix);
      renderContext.applyVirtualCamera(virtualCamera, false);
      renderContext.rendererUpdateFlag |= ContextRendererUpdateFlag.ProjectionMatrix;
      uiRenderQueue.clear();
      uiCanvas._prepareRender(renderContext);
      uiRenderQueue.pushRenderElement(uiCanvas._renderElement);
      batcherManager.batch(uiRenderQueue);
      uiRenderQueue.render(renderContext, "Forward");
    }
  }
}
