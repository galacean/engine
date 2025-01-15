import {
  CameraClearFlags,
  DisorderedArray,
  Entity,
  Pointer,
  PointerEventData,
  PointerEventEmitter,
  Scene,
  registerPointerEventEmitter
} from "@galacean/engine";
import { UICanvas } from "..";
import { UIRenderer } from "../component/UIRenderer";
import { UIHitResult } from "./UIHitResult";

/**
 * @internal
 */
@registerPointerEventEmitter()
export class UIPointerEventEmitter extends PointerEventEmitter {
  private static _MAX_PATH_DEPTH = 2048;
  private static _path0: Entity[] = [];
  private static _path1: Entity[] = [];

  private _enteredElement: UIRenderer;
  private _pressedElement: UIRenderer;
  private _draggedElement: UIRenderer;

  _init(): void {
    this._hitResult = new UIHitResult();
  }

  override processRaycast(scenes: readonly Scene[], pointer: Pointer): void {
    const { _tempRay: ray } = PointerEventEmitter;
    const hitResult = this._hitResult;
    const { position } = pointer;
    const { x, y } = position;
    for (let i = scenes.length - 1; i >= 0; i--) {
      const scene = scenes[i];
      if (!scene.isActive || scene.destroyed) continue;
      // @ts-ignore
      const componentsManager = scene._componentsManager;
      // Overlay Canvas
      let canvasElements: DisorderedArray<UICanvas> = componentsManager._overlayCanvases;
      // Screen to world ( need flip y)
      ray.origin.set(position.x, scene.engine.canvas.height - position.y, 1);
      ray.direction.set(0, 0, -1);
      for (let j = canvasElements.length - 1; j >= 0; j--) {
        if (canvasElements.get(j).raycast(ray, hitResult)) {
          this._updateRaycast((<UIHitResult>hitResult).component, pointer);
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

        // Other canvases
        const isOrthographic = camera.isOrthographic;
        const { worldPosition: cameraPosition, worldForward: cameraForward } = camera.entity.transform;
        // Sort by rendering order
        canvasElements = componentsManager._canvases;
        for (let k = 0, n = canvasElements.length; k < n; k++) {
          canvasElements.get(k)._updateSortDistance(isOrthographic, cameraPosition, cameraForward);
        }
        canvasElements.sort((a, b) => a.sortOrder - b.sortOrder || a._sortDistance - b._sortDistance);
        for (let k = 0, n = canvasElements.length; k < n; k++) {
          canvasElements.get(k)._canvasIndex = k;
        }
        const farClipPlane = camera.farClipPlane;
        // Post-rendering first detection
        for (let k = 0, n = canvasElements.length; k < n; k++) {
          const canvas = canvasElements.get(k);
          if (!canvas._canRender(camera)) continue;
          if (canvas.raycast(ray, hitResult, farClipPlane)) {
            this._updateRaycast((<UIHitResult>hitResult).component, pointer);
            return;
          }
        }
        if (camera.clearFlags & CameraClearFlags.Color) {
          this._updateRaycast(null);
          return;
        }
      }
    }
  }

  override processDrag(pointer: Pointer): void {
    if (this._draggedElement) {
      this._bubble(this._composedPath(this._draggedElement, UIPointerEventEmitter._path0), pointer, this._fireDrag);
    }
  }

  override processDown(pointer: Pointer): void {
    const element = (this._pressedElement = this._draggedElement = this._enteredElement);
    if (element) {
      const path = this._composedPath(element, UIPointerEventEmitter._path0);
      this._bubble(path, pointer, this._fireDown);
      this._bubble(path, pointer, this._fireBeginDrag);
    }
  }

  override processUp(pointer: Pointer): void {
    const liftedPath = UIPointerEventEmitter._path0;
    const enteredElement = this._enteredElement;
    if (enteredElement) {
      this._composedPath(enteredElement, liftedPath);
      this._bubble(liftedPath, pointer, this._fireUp);
      if (this._pressedElement) {
        const pressedPath = this._composedPath(this._pressedElement, UIPointerEventEmitter._path1);
        const enterLength = liftedPath.length;
        const pressLength = pressedPath.length;
        const minLength = Math.min(enterLength, pressLength);
        let i = 0;
        for (; i < minLength; i++) {
          if (liftedPath[enterLength - 1 - i] !== pressedPath[pressLength - 1 - i]) {
            break;
          }
        }
        const targetIndex = enterLength - i;
        const eventData = this._createEventData(pointer);
        for (let j = targetIndex; j < enterLength; j++) {
          this._fireClick(liftedPath[j], eventData);
        }
        this._pressedElement = null;
      }
    }

    if (this._draggedElement) {
      this._bubble(this._composedPath(this._draggedElement, UIPointerEventEmitter._path1), pointer, this._fireEndDrag);
      this._draggedElement = null;
    }

    if (enteredElement) {
      this._bubble(liftedPath, pointer, this._fireDrop);
    }
  }

  override processLeave(pointer: Pointer): void {
    const path = UIPointerEventEmitter._path0;
    if (this._enteredElement) {
      this._bubble(this._composedPath(this._enteredElement, path), pointer, this._fireExit);
      this._enteredElement = null;
    }
    if (this._draggedElement) {
      this._bubble(this._composedPath(this._draggedElement, path), pointer, this._fireEndDrag);
      this._draggedElement = null;
    }

    this._pressedElement = null;
  }

  override dispose(): void {
    this._enteredElement = this._pressedElement = this._draggedElement = null;
  }

  private _updateRaycast(element: UIRenderer, pointer: Pointer = null): void {
    const enteredElement = this._enteredElement;
    if (element !== enteredElement) {
      let prePath = this._composedPath(enteredElement, UIPointerEventEmitter._path0);
      let curPath = this._composedPath(element, UIPointerEventEmitter._path1);
      const preLength = prePath.length;
      const curLength = curPath.length;
      const minLength = Math.min(preLength, curLength);
      let i = 0;
      for (; i < minLength; i++) {
        if (prePath[preLength - i - 1] !== curPath[curLength - i - 1]) {
          break;
        }
      }
      const eventData = this._createEventData(pointer);
      for (let j = 0, n = preLength - i; j < n; j++) {
        this._fireExit(prePath[j], eventData);
      }
      for (let j = 0, n = curLength - i; j < n; j++) {
        this._fireEnter(curPath[j], eventData);
      }
      this._enteredElement = element;
    }
  }

  private _composedPath(element: UIRenderer, path: Entity[]): Entity[] {
    if (!element) {
      path.length = 0;
      return path;
    }
    let entity = (path[0] = element.entity);
    let i = 1;
    const rootEntity = element._getRootCanvas().entity;
    for (; i < UIPointerEventEmitter._MAX_PATH_DEPTH && !!entity && entity !== rootEntity; i++) {
      entity = path[i] = entity.parent;
    }
    path.length = i;
    return path;
  }

  private _bubble(path: Entity[], pointer: Pointer, fireEvent: FireEvent): void {
    const length = path.length;
    if (length <= 0) return;
    const eventData = this._createEventData(pointer);
    for (let i = 0; i < length; i++) {
      fireEvent(path[i], eventData);
    }
  }
}

type FireEvent = (entity: Entity, eventData: PointerEventData) => void;
