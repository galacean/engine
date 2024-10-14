import { Component } from "../../../Component";
import { Entity } from "../../../Entity";
import { Scene } from "../../../Scene";
import { Script } from "../../../Script";
import { CameraClearFlags } from "../../../enums/CameraClearFlags";
import { ComponentType } from "../../../enums/ComponentType";
import { UICanvas, UIRenderer } from "../../../ui";
import { Pointer } from "../Pointer";
import { PointerEventData } from "../PointerEventData";
import { PointerEventEmitter } from "./PointerEventEmitter";

export class PointerUIEventEmitter extends PointerEventEmitter {
  protected static _path0: Entity[] = [];
  protected static _path1: Entity[] = [];

  private _enteredElement: Component;
  private _pressedElement: Component;
  private _draggedElement: Component;

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
      let canvasElements = componentsManager._overlayCanvases;
      ray.origin.set(position.x, position.y, 1);
      ray.direction.set(0, 0, -1);
      for (let j = canvasElements.length - 1; j >= 0; j--) {
        if (canvasElements.get(j).raycast(ray, hitResult)) {
          this._updateRaycast(<Component>hitResult.component, pointer);
          return;
        }
      }

      const cameras = componentsManager._activeCameras;
      for (let j = cameras.length - 1; j >= 0; j--) {
        const camera = cameras.get(j);
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
        canvasElements = componentsManager._canvases;
        for (let k = 0, n = canvasElements.length; k < n; k++) {
          canvasElements.get(k)._updateSortDistance(cameraPosition);
        }
        canvasElements.sort((a, b) => a.sortOrder - b.sortOrder || a._sortDistance - b._sortDistance);
        for (let k = 0, n = canvasElements.length; k < n; k++) {
          canvasElements.get(k)._canvasIndex = k;
        }
        const farClipPlane = camera.farClipPlane;
        /** Post-rendering first detection */
        for (let k = 0, n = canvasElements.length; k < n; k++) {
          const canvas = canvasElements.get(k);
          if (canvas.renderCamera !== camera) continue;
          if (canvas.raycast(ray, hitResult, farClipPlane)) {
            this._updateRaycast(<Component>hitResult.component, pointer);
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
      this._bubble(this._composedPath(this._pressedElement, PointerUIEventEmitter._path0), pointer, "onPointerDrag");
    }
  }

  /**
   * @internal
   */
  override _processDown(pointer: Pointer): void {
    const element = (this._pressedElement = this._draggedElement = this._enteredElement);
    if (element) {
      const path = this._composedPath(element, PointerUIEventEmitter._path0);
      this._bubble(path, pointer, "onPointerDown");
      this._bubble(path, pointer, "onPointerBeginDrag");
    }
  }

  /**
   * @internal
   */
  override _processUp(pointer: Pointer): void {
    const liftedPath = PointerUIEventEmitter._path0;
    const enteredElement = this._enteredElement;
    if (enteredElement) {
      this._composedPath(enteredElement, liftedPath);
      this._bubble(liftedPath, pointer, "onPointerUp");
      if (this._pressedElement) {
        const pressedPath = this._composedPath(this._pressedElement, PointerUIEventEmitter._path1);
        const enterLength = liftedPath.length;
        const pressLength = pressedPath.length;
        const minLength = Math.min(enterLength, pressLength);
        let i = 0;
        for (; i < minLength; i++) {
          if (liftedPath[enterLength - 1 - i] !== pressedPath[pressLength - 1 - i]) {
            break;
          }
        }
        for (let j = enterLength - i; j < enterLength; j++) {
          this._fireEvent(liftedPath[j], this._createEventData(pointer), "onPointerClick");
        }
        this._pressedElement = null;
      }
    }

    if (this._draggedElement) {
      this._bubble(this._composedPath(this._draggedElement, PointerUIEventEmitter._path1), pointer, "onPointerEndDrag");
      this._draggedElement = null;
    }

    if (enteredElement) {
      this._bubble(liftedPath, pointer, "onPointerDrop");
    }
  }

  override _processLeave(pointer: Pointer): void {
    const path = PointerUIEventEmitter._path0;
    if (this._enteredElement) {
      this._bubble(this._composedPath(this._enteredElement, path), pointer, "onPointerExit");
      this._enteredElement = null;
    }
    if (this._draggedElement) {
      this._bubble(this._composedPath(this._draggedElement, path), pointer, "onPointerEndDrag");
      this._draggedElement = null;
    }

    this._pressedElement = null;
  }

  private _updateRaycast(element: Component, pointer: Pointer = null): void {
    const enteredElement = this._enteredElement;
    if (element !== enteredElement) {
      let prePath = this._composedPath(enteredElement, PointerUIEventEmitter._path0);
      let curPath = this._composedPath(element, PointerUIEventEmitter._path1);
      const preLength = prePath.length;
      const curLength = curPath.length;
      const minLength = Math.min(preLength, curLength);
      let i = 0;
      for (; i < minLength; i++) {
        if (prePath[preLength - i - 1] !== curPath[curLength - i - 1]) {
          break;
        }
      }
      const event = this._createEventData(pointer);
      for (let j = 0, n = preLength - i; j < n; j++) {
        this._fireEvent(prePath[j], event, "onPointerExit");
      }
      for (let j = 0, n = curLength - i; j < n; j++) {
        this._fireEvent(curPath[j], event, "onPointerEnter");
      }
      this._enteredElement = element;
    }
  }

  private _bubble(path: Entity[], pointer: Pointer, type: PointerCallback): void {
    const length = path.length;
    if (length <= 0) return;
    const eventData = this._createEventData(pointer, path[0]);
    for (let i = 0; i < length; i++) {
      this._fireEvent(path[i], eventData, type);
    }
  }

  private _fireEvent(entity: Entity, eventData: PointerEventData, type: PointerCallback): void {
    eventData.currentTarget = entity;
    entity._scripts.forEach(
      (script: Script) => {
        script[type]?.(eventData);
      },
      (script: Script, index: number) => {
        script._entityScriptsIndex = index;
      }
    );
  }

  override _dispose(): void {
    this._enteredElement = this._pressedElement = this._draggedElement = null;
  }

  private _composedPath(element: Component, path: Entity[]): Entity[] {
    if (!element) {
      path.length = 0;
      return path;
    }
    let entity = (path[0] = element._entity);
    let i = 1;
    if (element._componentType === ComponentType.UICanvas && (<UICanvas>element)._isRootCanvas) {
      path.length = 1;
      return path;
    } else {
      const rootEntity = (<UICanvas | UIRenderer>element)._canvas._entity;
      // Avoid endless loops
      for (; i < 2048 && !!entity && entity !== rootEntity; i++) {
        entity = path[i] = entity.parent;
      }
    }
    path.length = i;
    return path;
  }
}

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
