import { Entity } from "../../../Entity";
import { Scene } from "../../../Scene";
import { CameraClearFlags } from "../../../enums/CameraClearFlags";
import { HitResult } from "../../../physics";
import { Pointer } from "../Pointer";
import { PointerEventEmitter } from "./PointerEventEmitter";

/**
 * @internal
 */
export class PhysicsPointerEventEmitter extends PointerEventEmitter {
  protected _enteredEntity: Entity;
  protected _pressedEntity: Entity;
  protected _draggedEntity: Entity;

  override processRaycast(scenes: readonly Scene[], pointer: Pointer): void {
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
        if (scenePhysics.raycast(ray, camera.farClipPlane, camera.cullingMask, <HitResult>hitResult)) {
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

  override processDrag(pointer: Pointer): void {
    const entity = this._draggedEntity;
    entity && this._fireDrag(entity, this._createEventData(pointer));
  }

  override processDown(pointer: Pointer): void {
    const entity = (this._pressedEntity = this._draggedEntity = this._enteredEntity);
    if (entity) {
      const eventData = this._createEventData(pointer);
      this._fireDown(entity, eventData);
      this._fireBeginDrag(entity, eventData);
    }
  }

  override processUp(pointer: Pointer): void {
    const { _enteredEntity: enteredEntity, _draggedEntity: draggedEntity } = this;
    if (enteredEntity) {
      const sameTarget = this._pressedEntity === enteredEntity;
      const eventData = this._createEventData(pointer);
      this._fireUp(enteredEntity, eventData);
      sameTarget && this._fireClick(enteredEntity, eventData);
      this._fireDrop(enteredEntity, eventData);
    }
    this._pressedEntity = null;
    if (draggedEntity) {
      this._fireEndDrag(draggedEntity, this._createEventData(pointer));
      this._draggedEntity = null;
    }
  }

  override processLeave(pointer: Pointer): void {
    const enteredEntity = this._enteredEntity;
    if (enteredEntity) {
      this._fireExit(enteredEntity, this._createEventData(pointer));
      this._enteredEntity = null;
    }

    const draggedEntity = this._draggedEntity;
    if (draggedEntity) {
      this._fireEndDrag(draggedEntity, this._createEventData(pointer));
      this._draggedEntity = null;
    }
    this._pressedEntity = null;
  }

  override dispose(): void {
    this._enteredEntity = this._pressedEntity = this._draggedEntity = null;
  }

  protected override _init(): void {
    this._hitResult = new HitResult();
  }

  private _updateRaycast(entity: Entity, pointer: Pointer): void {
    const enteredEntity = this._enteredEntity;
    if (entity !== enteredEntity) {
      if (enteredEntity) {
        this._fireExit(enteredEntity, this._createEventData(pointer));
      }
      if (entity) {
        this._fireEnter(entity, this._createEventData(pointer));
      }
      this._enteredEntity = entity;
    }
  }
}
