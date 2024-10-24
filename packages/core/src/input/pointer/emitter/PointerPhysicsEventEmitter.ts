import { Entity } from "../../../Entity";
import { Scene } from "../../../Scene";
import { Script } from "../../../Script";
import { CameraClearFlags } from "../../../enums/CameraClearFlags";
import { Pointer } from "../Pointer";
import { PointerEventEmitter } from "./PointerEventEmitter";

export class PointerPhysicsEventEmitter extends PointerEventEmitter {
  protected _enteredEntity: Entity;
  protected _pressedEntity: Entity;
  protected _draggedEntity: Entity;

  override _processRaycast(scenes: readonly Scene[], pointer: Pointer): void {
    const { _tempRay: ray } = PointerEventEmitter;
    const { position } = pointer;
    const { x, y } = position;
    const hitResult = this._hitResult;
    for (let i = scenes.length - 1; i >= 0; i--) {
      const scene = scenes[i];
      if (!scene.isActive || scene.destroyed) {
        continue;
      }
      const cameras = scene._componentsManager._activeCameras;
      let scenePhysics = scene.physics;
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
        if (scenePhysics.raycast(ray, camera.farClipPlane, camera.cullingMask, hitResult)) {
          this._updateRaycast(hitResult.entity, pointer);
          return;
        }
        if (camera.clearFlags & CameraClearFlags.Color) {
          this._updateRaycast(null, pointer);
          return;
        }
      }
    }
    this._updateRaycast(null, pointer);
  }

  /**
   * @internal
   */
  override _processDrag(pointer: Pointer): void {
    const entity = this._pressedEntity;
    if (entity) {
      this._invokeEntityScripts(entity, (script: Script) => {
        script.onPointerDrag?.(this._createEventData(pointer, entity, entity));
      });
    }
  }

  /**
   * @internal
   */
  override _processDown(pointer: Pointer): void {
    const entity = (this._pressedEntity = this._draggedEntity = this._enteredEntity);
    if (entity) {
      this._invokeEntityScripts(entity, (script: Script) => {
        script.onPointerDown?.(this._createEventData(pointer, entity, entity));
        script.onPointerBeginDrag?.(this._createEventData(pointer, entity, entity));
      });
    }
  }

  /**
   * @internal
   */
  override _processUp(pointer: Pointer): void {
    const { _enteredEntity: enteredEntity, _draggedEntity: draggedEntity } = this;
    if (enteredEntity) {
      const sameTarget = this._pressedEntity === enteredEntity;
      this._invokeEntityScripts(enteredEntity, (script: Script) => {
        script.onPointerUp?.(this._createEventData(pointer, enteredEntity, enteredEntity));
        sameTarget && script.onPointerClick?.(this._createEventData(pointer, enteredEntity, enteredEntity));
        script.onPointerDrop?.(this._createEventData(pointer, enteredEntity, enteredEntity));
      });
    }
    this._pressedEntity = null;
    if (draggedEntity) {
      this._invokeEntityScripts(draggedEntity, (script: Script) => {
        script.onPointerEndDrag?.(this._createEventData(pointer, draggedEntity, draggedEntity));
      });
      this._draggedEntity = null;
    }
  }

  override _processLeave(pointer: Pointer): void {
    const enteredEntity = this._enteredEntity;
    if (enteredEntity) {
      this._invokeEntityScripts(enteredEntity, (script: Script) => {
        script.onPointerExit?.(this._createEventData(pointer, enteredEntity, enteredEntity));
      });
      this._enteredEntity = null;
    }

    const draggedEntity = this._draggedEntity;
    if (draggedEntity) {
      this._invokeEntityScripts(draggedEntity, (script: Script) => {
        script.onPointerEndDrag?.(this._createEventData(pointer, draggedEntity, draggedEntity));
      });
      this._draggedEntity = null;
    }
    this._pressedEntity = null;
  }

  override _dispose(): void {
    this._enteredEntity = this._pressedEntity = this._draggedEntity = null;
  }

  private _updateRaycast(entity: Entity, pointer: Pointer): void {
    const enteredEntity = this._enteredEntity;
    if (entity !== enteredEntity) {
      if (enteredEntity) {
        this._invokeEntityScripts(enteredEntity, (script: Script) => {
          script.onPointerExit?.(this._createEventData(pointer, enteredEntity, enteredEntity));
        });
      }
      if (entity) {
        this._invokeEntityScripts(entity, (script: Script) => {
          script.onPointerEnter?.(this._createEventData(pointer, entity, entity));
        });
      }
      this._enteredEntity = entity;
    }
  }

  private _invokeEntityScripts(entity: Entity, callback: (script: Script) => void): void {
    entity._scripts.forEach(callback, (script: Script, index: number) => {
      script._entityScriptsIndex = index;
    });
  }
}
