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
  private static _tempSet: Set<number> = new Set();
  private static _path: Entity[] = [];
  private static _tempArray0: Entity[] = [];
  private static _tempArray1: Entity[] = [];

  private _enteredPath: Entity[] = [];
  private _pressedPath: Entity[] = [];
  private _draggedPath: Entity[] = [];

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
      // Screen to world ( Assume that world units have a one-to-one relationship with pixel units )
      ray.origin.set(position.x, scene.engine.canvas.height - position.y, 1);
      ray.direction.set(0, 0, -1);
      for (let j = canvasElements.length - 1; j >= 0; j--) {
        if (canvasElements.get(j)._raycast(ray, hitResult)) {
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
          if (canvas._raycast(ray, hitResult, farClipPlane)) {
            this._updateRaycast((<UIHitResult>hitResult).component, pointer);
            return;
          }
        }
        if (camera.clearFlags & CameraClearFlags.Color) {
          this._updateRaycast(null);
          return;
        }
      }
      this._updateRaycast(null);
    }
  }

  override processDrag(pointer: Pointer): void {
    const draggedPath = this._draggedPath;
    if (draggedPath.length > 0) {
      this._bubble(draggedPath, pointer, this._fireDrag);
      draggedPath.length = 0;
    }
  }

  override processDown(pointer: Pointer): void {
    const enteredPath = this._enteredPath;
    const pressedPath = this._pressedPath;
    const draggedPath = this._draggedPath;
    const length = (draggedPath.length = pressedPath.length = enteredPath.length);
    if (length > 0) {
      for (let i = 0; i < length; i++) {
        pressedPath[i] = draggedPath[i] = enteredPath[i];
      }
      this._bubble(pressedPath, pointer, this._fireDown);
      this._bubble(draggedPath, pointer, this._fireBeginDrag);
    }
  }

  override processUp(pointer: Pointer): void {
    const enteredPath = this._enteredPath;
    const pressedPath = this._pressedPath;
    if (enteredPath.length > 0) {
      this._bubble(enteredPath, pointer, this._fireUp);
      if (pressedPath.length > 0) {
        const common = UIPointerEventEmitter._tempArray0;
        if (this._findCommonInPath(enteredPath, pressedPath, common)) {
          const eventData = this._createEventData(pointer);
          for (let i = 0, n = common.length; i < n; i++) {
            this._fireClick(common[i], eventData);
          }
        }
      }
    }

    pressedPath.length = 0;

    const draggedPath = this._draggedPath;
    if (draggedPath.length > 0) {
      this._bubble(draggedPath, pointer, this._fireEndDrag);
      draggedPath.length = 0;
    }

    if (enteredPath.length > 0) {
      this._bubble(enteredPath, pointer, this._fireDrop);
    }
  }

  override processLeave(pointer: Pointer): void {
    const enteredPath = this._enteredPath;
    if (enteredPath.length > 0) {
      this._bubble(enteredPath, pointer, this._fireExit);
      enteredPath.length = 0;
    }

    const draggedPath = this._draggedPath;
    if (draggedPath.length > 0) {
      this._bubble(draggedPath, pointer, this._fireEndDrag);
      draggedPath.length = 0;
    }

    this._pressedPath.length = 0;
  }

  override dispose(): void {
    this._enteredPath.length = this._pressedPath.length = this._draggedPath.length = 0;
  }

  private _updateRaycast(element: UIRenderer, pointer: Pointer = null): void {
    const enteredPath = this._enteredPath;
    const curPath = this._composedPath(element, UIPointerEventEmitter._path);
    const add = UIPointerEventEmitter._tempArray0;
    const del = UIPointerEventEmitter._tempArray1;
    if (this._findDiffInPath(enteredPath, curPath, add, del)) {
      const eventData = this._createEventData(pointer);
      for (let i = 0, n = add.length; i < n; i++) {
        this._fireEnter(add[i], eventData);
      }
      for (let i = 0, n = del.length; i < n; i++) {
        this._fireExit(del[i], eventData);
      }

      const length = (enteredPath.length = curPath.length);
      for (let i = 0; i < length; i++) {
        enteredPath[i] = curPath[i];
      }
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

  private _findCommonInPath(prePath: Entity[], curPath: Entity[], common: Entity[]): boolean {
    common.length = 0;
    const idSet = UIPointerEventEmitter._tempSet;
    idSet.clear();
    for (let i = 0, n = prePath.length; i < n; i++) {
      idSet.add(prePath[i].instanceId);
    }
    let hasCommon = false;
    for (let i = 0, n = curPath.length; i < n; i++) {
      const entity = curPath[i];
      if (idSet.has(entity.instanceId)) {
        common.push(entity);
        hasCommon = true;
      }
    }
    return hasCommon;
  }

  private _findDiffInPath(prePath: Entity[], curPath: Entity[], add: Entity[], del: Entity[]): boolean {
    add.length = del.length = 0;
    const idSet = UIPointerEventEmitter._tempSet;
    idSet.clear();
    let changed = false;
    for (let i = 0, n = prePath.length; i < n; i++) {
      idSet.add(prePath[i].instanceId);
    }
    for (let i = 0, n = curPath.length; i < n; i++) {
      const entity = curPath[i];
      if (!idSet.has(entity.instanceId)) {
        add.push(entity);
        changed = true;
      }
    }
    idSet.clear();
    for (let i = 0, n = curPath.length; i < n; i++) {
      idSet.add(curPath[i].instanceId);
    }
    for (let i = 0, n = prePath.length; i < n; i++) {
      const entity = prePath[i];
      if (!idSet.has(entity.instanceId)) {
        del.push(entity);
        changed = true;
      }
    }
    return changed;
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
