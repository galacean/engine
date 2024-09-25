import { Entity } from "../../../Entity";
import { Scene } from "../../../Scene";
import { Script } from "../../../Script";
import { CameraClearFlags } from "../../../enums/CameraClearFlags";
import { ComponentType } from "../../../enums/ComponentType";
import { UICanvas, UIRenderer } from "../../../ui";
import { Pointer } from "../Pointer";
import { PointerCallbackType } from "../PointerCallbackType";
import { PointerEventEmitter } from "./PointerEventEmitter";
import { UIHitResult } from "./UIHitResult";

export class PointerUIEventEmitter extends PointerEventEmitter {
  protected static _path0: Entity[] = [];
  protected static _path1: Entity[] = [];

  private _enteredElement: UIElement;
  private _pressedElement: UIElement;
  private _draggedElement: UIElement;
  private _hitResult: UIHitResult = new UIHitResult();

  override _processRaycast(scenes: readonly Scene[], pointer: Pointer): void {
    const { _tempRay: ray } = PointerEventEmitter;
    const hitResult = this._hitResult;
    const { position } = pointer;
    const { x, y } = position;
    for (let i = scenes.length - 1; i >= 0; i--) {
      const scene = scenes[i];
      if (!scene.isActive || scene.destroyed) continue;
      const { _componentsManager: componentsManager } = scene;

      /** Overlay Canvas */
      let canvasElements = componentsManager._overlayCanvases._elements;
      ray.origin.set(position.x, position.y, 1);
      ray.direction.set(0, 0, -1);
      for (let j = canvasElements.length - 1; j >= 0; j--) {
        if (canvasElements[j].rayCast(ray, hitResult)) {
          this._updateRaycast(hitResult.component, pointer);
          return;
        }
      }

      const cameras = componentsManager._activeCameras._elements;
      for (let j = cameras.length - 1; j >= 0; j--) {
        const camera = cameras[j];
        if (camera.renderTarget) continue;
        const { pixelViewport } = camera;
        if (
          x < pixelViewport.x ||
          y < pixelViewport.y ||
          x > pixelViewport.x + pixelViewport.width ||
          y > pixelViewport.y + pixelViewport.height
        ) {
          continue;
        }
        camera.screenPointToRay(pointer.position, ray);

        /** Other canvases */
        const cameraPosition = camera.entity.transform.position;
        /** Sort by rendering order */
        const canvases = componentsManager._canvases;
        canvasElements = canvases._elements;
        for (let k = 0, n = canvases.length; k < n; k++) {
          canvasElements[k]._updateSortDistance(cameraPosition);
        }
        canvases.sort((a, b) => a.sortOrder - b.sortOrder || a._sortDistance - b._sortDistance);
        for (let k = 0, n = canvases.length; k < n; k++) {
          canvasElements[k]._canvasIndex = k;
        }
        const farClipPlane = camera.farClipPlane;
        /** Post-rendering first detection */
        for (let k = 0, n = canvases.length; k < n; k++) {
          const canvas = canvasElements[k];
          if (canvas.renderCamera !== camera) continue;
          if (canvas.rayCast(ray, hitResult, farClipPlane)) {
            this._updateRaycast(null);
            return;
          }
        }
        if (camera.clearFlags & CameraClearFlags.Color) {
          this._updateRaycast(null);
          return;
        }
      }
    }
    return null;
  }

  override _processDrag(pointer: Pointer): void {
    if (this._pressedElement) {
      this._fireEvent(this._composedPath(this._pressedElement, PointerUIEventEmitter._path0), pointer, "onPointerDrag");
    }
  }

  /**
   * @internal
   */
  override _processDown(pointer: Pointer): void {
    const element = (this._pressedElement = this._draggedElement = this._enteredElement);
    if (element) {
      const path = this._composedPath(element, PointerUIEventEmitter._path0);
      this._fireEvent(path, pointer, "onPointerDown");
      this._fireEvent(path, pointer, "onPointerBeginDrag");
    }
  }

  /**
   * @internal
   */
  override _processUp(pointer: Pointer): void {
    const enterPath = PointerUIEventEmitter._path0;
    const enteredElement = this._enteredElement;
    if (enteredElement) {
      this._composedPath(enteredElement, enterPath);
      this._fireEvent(enterPath, pointer, "onPointerUp");
      if (this._pressedElement) {
        const clickPath = this._composedPath(this._pressedElement, PointerUIEventEmitter._path1);
        const enterLength = enterPath.length;
        const pressLength = clickPath.length;
        for (let i = 0; i < enterLength && i < pressLength; i++) {
          if (enterPath[enterLength - 1 - i] !== clickPath[pressLength - 1 - i]) {
            const sub = enterLength - i;
            for (let j = 0; j < i; j++) {
              clickPath[j] = clickPath[j + sub];
            }
          }
        }
        this._fireEvent(clickPath, pointer, "onPointerClick");
      }
    }

    this._pressedElement = null;

    if (this._draggedElement) {
      this._fireEvent(
        this._composedPath(this._draggedElement, PointerUIEventEmitter._path1),
        pointer,
        "onPointerEndDrag"
      );
      this._draggedElement = null;
    }

    if (enteredElement) {
      this._fireEvent(enterPath, pointer, "onPointerDrop");
    }
  }

  override _processLeave(pointer: Pointer): void {
    const path = PointerUIEventEmitter._path0;
    if (this._enteredElement) {
      this._fireEvent(this._composedPath(this._enteredElement, path), pointer, "onPointerExit");
      this._enteredElement = null;
    }
    if (this._draggedElement) {
      this._fireEvent(this._composedPath(this._draggedElement, path), pointer, "onPointerEndDrag");
      this._draggedElement = null;
    }

    this._pressedElement = null;
  }

  private _updateRaycast(element: UIElement, pointer: Pointer = null): void {
    const enteredElement = this._enteredElement;
    if (element !== enteredElement) {
      const path = PointerUIEventEmitter._path0;
      enteredElement && this._fireEvent(this._composedPath(enteredElement, path), pointer, "onPointerExit");
      element && this._fireEvent(this._composedPath(element, path), pointer, "onPointerEnter");
      this._enteredElement = element;
    }
  }

  private _fireEvent(path: Entity[], pointer: Pointer, type: PointerCallback): void {
    const length = path.length;
    if (length <= 0) return;
    const eventData = this._createEventData(pointer, path[0]);
    for (let i = 0; i < length; i++) {
      const entity = (eventData.currentTarget = path[i]);
      entity._scripts.forEach(
        (script: Script) => {
          script._pointerOverrideFlag & PointerCallbackType[type] && script[type](eventData);
        },
        (script: Script, index: number) => {
          script._entityScriptsIndex = index;
        }
      );
    }
  }

  override _dispose(): void {
    this._enteredElement = this._pressedElement = this._draggedElement = null;
  }

  private _composedPath(element: UIElement, path: Entity[]): Entity[] {
    let entity = (path[0] = element._entity);
    let i = 1;
    if (element._componentType !== ComponentType.UICanvas || !(<UICanvas>element)._isRootCanvas) {
      const rootEntity = element._canvas._entity;
      for (; i < 2048 && entity !== rootEntity; i++) {
        path[i] = entity;
        entity = entity.parent;
      }
    }
    path.length = i;
    return path;
  }
}

type UIElement = UIRenderer | UICanvas;
type PointerCallback =
  | "onPointerDown"
  | "onPointerUp"
  | "onPointerClick"
  | "onPointerEnter"
  | "onPointerExit"
  | "onPointerBeginDrag"
  | "onPointerDrag"
  | "onPointerEndDrag"
  | "onPointerDrop";
