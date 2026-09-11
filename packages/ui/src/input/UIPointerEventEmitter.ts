import {
  Camera,
  CameraClearFlags,
  DisorderedArray,
  Entity,
  Pointer,
  PointerEventData,
  PointerEventEmitter,
  Renderer,
  Scene,
  registerPointerEventEmitter
} from "@galacean/engine";
import { UICanvas } from "..";
import { UIRenderer } from "../component/UIRenderer";
import { UIHitResult } from "./UIHitResult";

/**
 * Structural view of the `@internal` render queue fields consumed by the hit test.
 */
interface RenderedQueue {
  batchedElements: ReadonlyArray<{ component: Renderer }>;
}

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
  private static _renderedCanvases: UICanvas[] = [];
  private static _visitedCanvases: Set<number> = new Set();

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
      const overlayCanvases: DisorderedArray<UICanvas> = componentsManager._overlayCanvases;
      // Screen to world ( Assume that world units have a one-to-one relationship with pixel units )
      ray.origin.set(position.x, scene.engine.canvas.height - position.y, 1);
      ray.direction.set(0, 0, -1);
      for (let j = overlayCanvases.length - 1; j >= 0; j--) {
        if (overlayCanvases.get(j)._raycast(ray, hitResult)) {
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

        // The hit order is the one the camera actually painted, so it is consumed instead of derived
        const renderedCanvases = this._collectRenderedCanvases(camera);
        const farClipPlane = camera.farClipPlane;
        const cullingMask = camera.cullingMask;
        for (let k = 0, n = renderedCanvases.length; k < n; k++) {
          const canvas = renderedCanvases[k];
          if (!canvas._canDispatchEvent(camera)) continue;
          if (canvas._raycast(ray, hitResult, farClipPlane, cullingMask)) {
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

  /**
   * Collect the canvases of the pass this camera completed last, topmost painted first.
   *
   * The hit test consumes the draw order rather than deriving it again: `Engine.update()` runs the
   * pointer raycast before it renders, and the queues are only reset — and their pooled elements only
   * reused — while rendering, so the queues still hold the pass the pointer is aiming at, which is the
   * frame currently on screen. Each queue's `batchedElements` is in draw order and the queues are
   * drawn opaque -> alphaTest -> transparent, so walking them backwards visits what is visible from the
   * top down. A canvas keeps the position of the topmost element it owns, which also covers tied
   * canvases whose elements interleave.
   */
  private _collectRenderedCanvases(camera: Camera): UICanvas[] {
    const canvases = UIPointerEventEmitter._renderedCanvases;
    const visited = UIPointerEventEmitter._visitedCanvases;
    canvases.length = 0;
    visited.clear();
    // @ts-ignore
    const cullingResults = camera._renderPipeline?._cullingResults;
    if (cullingResults) {
      this._collectCanvasesFromQueue(cullingResults.transparentQueue, canvases, visited);
      this._collectCanvasesFromQueue(cullingResults.alphaTestQueue, canvases, visited);
      this._collectCanvasesFromQueue(cullingResults.opaqueQueue, canvases, visited);
    }
    return canvases;
  }

  private _collectCanvasesFromQueue(queue: RenderedQueue, canvases: UICanvas[], visited: Set<number>): void {
    const elements = queue.batchedElements;
    for (let i = elements.length - 1; i >= 0; i--) {
      const component = elements[i].component;
      if (!(component instanceof UIRenderer) || component.destroyed) continue;
      // Only content painted last frame is a candidate, so stale entries must not survive
      const canvas = component._getRootCanvas();
      if (!canvas || canvas.destroyed || !canvas.entity.isActiveInHierarchy) continue;
      if (visited.has(canvas.instanceId)) continue;
      visited.add(canvas.instanceId);
      canvases.push(canvas);
    }
  }

  override processDrag(pointer: Pointer): void {
    const draggedPath = this._draggedPath;
    if (draggedPath.length > 0) {
      this._bubble(draggedPath, pointer, this._fireDrag);
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
          common.length = 0;
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
      add.length = del.length = 0;
    }
    curPath.length = 0;
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
