import {
  CameraClearFlags,
  Entity,
  Pointer,
  PointerEventData,
  PointerEventEmitter,
  Scene,
  Script,
  registerPointerEventEmitter
} from "@galacean/engine";
import { UIRenderer } from "../component/UIRenderer";

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
      /** Overlay Canvas */
      let canvasElements = componentsManager._overlayCanvases;
      ray.origin.set(position.x, position.y, 1);
      ray.direction.set(0, 0, -1);
      for (let j = canvasElements.length - 1; j >= 0; j--) {
        if (canvasElements.get(j).raycast(ray, hitResult)) {
          this._updateRaycast(<UIRenderer>hitResult.component, pointer);
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
            this._updateRaycast(<UIRenderer>hitResult.component, pointer);
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
        const event = this._createEventData(pointer, liftedPath[targetIndex]);
        for (let j = targetIndex; j < enterLength; j++) {
          this._fireClick(liftedPath[j], event);
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
      const event = this._createEventData(pointer);
      for (let j = 0, n = preLength - i; j < n; j++) {
        this._fireExit(prePath[j], event);
      }
      for (let j = 0, n = curLength - i; j < n; j++) {
        this._fireEnter(curPath[j], event);
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
    const eventData = this._createEventData(pointer, path[0]);
    for (let i = 0; i < length; i++) {
      fireEvent(path[i], eventData);
    }
  }

  private _fireDown(entity: Entity, eventData: PointerEventData): void {
    // @ts-ignore
    entity._scripts.forEach(
      (script: Script) => {
        script.onPointerDown?.(eventData);
      },
      (script: Script, index: number) => {
        // @ts-ignore
        script._entityScriptsIndex = index;
      }
    );
  }

  private _fireUp(entity: Entity, eventData: PointerEventData): void {
    // @ts-ignore
    entity._scripts.forEach(
      (script: Script) => {
        script.onPointerUp?.(eventData);
      },
      (script: Script, index: number) => {
        // @ts-ignore
        script._entityScriptsIndex = index;
      }
    );
  }

  private _fireClick(entity: Entity, eventData: PointerEventData): void {
    // @ts-ignore
    entity._scripts.forEach(
      (script: Script) => {
        script.onPointerClick?.(eventData);
      },
      (script: Script, index: number) => {
        // @ts-ignore
        script._entityScriptsIndex = index;
      }
    );
  }

  private _fireEnter(entity: Entity, eventData: PointerEventData): void {
    // @ts-ignore
    entity._scripts.forEach(
      (script: Script) => {
        script.onPointerEnter?.(eventData);
      },
      (script: Script, index: number) => {
        // @ts-ignore
        script._entityScriptsIndex = index;
      }
    );
  }

  private _fireExit(entity: Entity, eventData: PointerEventData): void {
    // @ts-ignore
    entity._scripts.forEach(
      (script: Script) => {
        script.onPointerExit?.(eventData);
      },
      (script: Script, index: number) => {
        // @ts-ignore
        script._entityScriptsIndex = index;
      }
    );
  }

  private _fireBeginDrag(entity: Entity, eventData: PointerEventData): void {
    // @ts-ignore
    entity._scripts.forEach(
      (script: Script) => {
        script.onPointerBeginDrag?.(eventData);
      },
      (script: Script, index: number) => {
        // @ts-ignore
        script._entityScriptsIndex = index;
      }
    );
  }

  private _fireDrag(entity: Entity, eventData: PointerEventData): void {
    // @ts-ignore
    entity._scripts.forEach(
      (script: Script) => {
        script.onPointerDrag?.(eventData);
      },
      (script: Script, index: number) => {
        // @ts-ignore
        script._entityScriptsIndex = index;
      }
    );
  }

  private _fireEndDrag(entity: Entity, eventData: PointerEventData): void {
    // @ts-ignore
    entity._scripts.forEach(
      (script: Script) => {
        script.onPointerEndDrag?.(eventData);
      },
      (script: Script, index: number) => {
        // @ts-ignore
        script._entityScriptsIndex = index;
      }
    );
  }

  private _fireDrop(entity: Entity, eventData: PointerEventData): void {
    // @ts-ignore
    entity._scripts.forEach(
      (script: Script) => {
        script.onPointerDrop?.(eventData);
      },
      (script: Script, index: number) => {
        // @ts-ignore
        script._entityScriptsIndex = index;
      }
    );
  }
}

type FireEvent = (entity: Entity, eventData: PointerEventData) => void;
