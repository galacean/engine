import { Quaternion, Vector3 } from "@galacean/engine";
import { ICollider } from "@galacean/engine-design";
import { HavokPhysics } from "./HavokPhysics";
import type { HavokPhysicsScene } from "./HavokPhysicsScene";
import {
  COL_DIRTY_SHAPE,
  HK_EVENT_ALL_COLLISIONS,
  HK_EVENT_ALL_TRIGGERS,
  HKQuaternion,
  HKVector3,
  HP_BodyId,
  HP_ShapeId,
  swapRemove,
  writeQTransform,
  ZERO_HANDLE
} from "./HavokTypes";
import type { HavokJoint } from "./joint/HavokJoint";
import { HavokColliderShape } from "./shape/HavokColliderShape";

/**
 * Abstract native rigid actor holding collider shapes.
 * Uses deferred Container rebuilds so multiple setLocalPose/addShape mutations
 * in the same frame coalesce into a single Havok container allocation.
 */
export abstract class HavokCollider implements ICollider {
  protected static _tempPos = new Vector3();
  protected static _tempVec = new Vector3();
  protected static _tempRot = new Quaternion();
  protected static _tempInvRot = new Quaternion();
  /** @internal */
  protected static _tempQTransform: [HKVector3, HKQuaternion] = [
    [0, 0, 0],
    [0, 0, 0, 1]
  ];
  private static _tempChildTransform: [HKVector3, HKQuaternion, HKVector3] = [
    [0, 0, 0],
    [0, 0, 0, 1],
    [1, 1, 1]
  ];

  /** @internal */
  readonly _isDynamic: boolean = false;
  /** @internal */
  _scene: HavokPhysicsScene | null = null;
  /** @internal */
  _hkBody: HP_BodyId;
  /** @internal */
  _hkBodyPtr: number;
  /** @internal */
  _shapes: HavokColliderShape[] = [];
  /** @internal */
  _containerShape: HP_ShapeId | null = null;
  /** @internal */
  _dirtyFlags = 0;

  protected _havokPhysics: HavokPhysics;
  protected _destroyed = false;

  private _eventMask: number = HK_EVENT_ALL_TRIGGERS;
  private _joints: HavokJoint[] | null = null;

  constructor(havokPhysics: HavokPhysics, position: Vector3, rotation: Quaternion) {
    this._havokPhysics = havokPhysics;
    const hk = havokPhysics._hk;
    this._hkBody = hk.HP_Body_Create()[1];
    this._hkBodyPtr = Number(this._hkBody[0]);
    const qt = HavokCollider._tempQTransform;
    writeQTransform(position, rotation, qt);
    hk.HP_Body_SetQTransform(this._hkBody, qt);
    // Trigger events always on; contact events toggled per-scene
    hk.HP_Body_SetEventMask(this._hkBody, HK_EVENT_ALL_TRIGGERS);
  }

  /** @internal */
  _updateEventMask(contactEnabled: boolean): void {
    const mask = (contactEnabled ? HK_EVENT_ALL_COLLISIONS : 0) | HK_EVENT_ALL_TRIGGERS;
    if (this._eventMask === mask) return;
    this._eventMask = mask;
    this._havokPhysics._hk.HP_Body_SetEventMask(this._hkBody, mask);
  }

  addShape(shape: HavokColliderShape): boolean {
    if (!shape._hkShape) {
      return false;
    }
    if (shape._syncedFilterVersion !== this._havokPhysics._filterVersion) {
      shape._syncLayerFilter();
    }
    shape._collider = this;
    this._shapes.push(shape);
    this._markShapeDirty();
    this._scene?._removedShapeIds.delete(shape._id);
    return true;
  }

  removeShape(shape: HavokColliderShape): void {
    const idx = this._shapes.indexOf(shape);
    if (idx === -1) return;
    this._shapes.splice(idx, 1);
    shape._collider = null;
    this._markShapeDirty();
    this._scene?._removeColliderShape(shape._id);
  }

  replaceShape(previousShape: HavokColliderShape, newShape: HavokColliderShape): boolean {
    const idx = this._shapes.indexOf(previousShape);
    if (idx === -1 || !newShape._hkShape) {
      return false;
    }
    if (newShape._syncedFilterVersion !== this._havokPhysics._filterVersion) {
      newShape._syncLayerFilter();
    }
    previousShape._collider = null;
    newShape._collider = this;
    this._shapes[idx] = newShape;
    this._markShapeDirty();
    const scene = this._scene;
    if (scene) {
      // Same logical Collider id: trigger pairs survive if still overlapping next step
      scene._removeColliderShape(previousShape._id);
      scene._removedShapeIds.delete(newShape._id);
    }
    return true;
  }

  setWorldTransform(position: Vector3, rotation: Quaternion): void {
    const qt = HavokCollider._tempQTransform;
    writeQTransform(position, rotation, qt);
    this._havokPhysics._hk.HP_Body_SetQTransform(this._hkBody, qt);
    this._scene?._queueBroadphaseDirtyCollider(this);
  }

  getWorldTransform(outPosition: Vector3, outRotation: Quaternion): void {
    const hk = this._havokPhysics._hk;
    const ptr = this._havokPhysics._qTransformScratch;
    if (ptr !== 0) {
      hk._HP_Body_GetQTransform!(this._hkBody[0], ptr);
      const f32 = hk.HEAPF32;
      const b = ptr >>> 2;
      outPosition.set(f32[b], f32[b + 1], f32[b + 2]);
      outRotation.set(f32[b + 3], f32[b + 4], f32[b + 5], f32[b + 6]);
      return;
    }
    const [, transform] = hk.HP_Body_GetQTransform(this._hkBody);
    const pos = transform[0];
    const rot = transform[1];
    outPosition.set(pos[0], pos[1], pos[2]);
    outRotation.set(rot[0], rot[1], rot[2], rot[3]);
  }

  /** @internal */
  _markShapeDirty(): void {
    this._dirtyFlags |= COL_DIRTY_SHAPE;
    this._scene?._queueStepDirtyCollider(this, COL_DIRTY_SHAPE);
  }

  /** @internal */
  _addJoint(joint: HavokJoint): void {
    const joints = this._joints;
    if (!joints) {
      this._joints = [joint];
    } else if (joints.indexOf(joint) === -1) {
      joints.push(joint);
    }
  }

  /** @internal */
  _removeJoint(joint: HavokJoint): void {
    const joints = this._joints;
    if (joints) {
      swapRemove(joints, joint);
    }
  }

  /** @internal */
  _flushShapeIfDirty(): void {
    if ((this._dirtyFlags & COL_DIRTY_SHAPE) === 0) return;
    if (this._scene) {
      // Detach from world around HP_Body_SetShape to prevent Havok's triangle-mesh trigger hang
      // and to refresh the broadphase AABB for immediate scene queries.
      this._scene._reinsertBody(this, true);
    } else {
      this._dirtyFlags &= ~COL_DIRTY_SHAPE;
      this._rebuildBodyShape();
    }
  }

  /** @internal */
  _onAddedToScene(scene: HavokPhysicsScene): void {
    this._scene = scene;
    this._updateEventMask(scene._contactEventsEnabled);
    const joints = this._joints;
    if (joints) {
      for (let i = 0, n = joints.length; i < n; i++) {
        joints[i]._onColliderSceneChanged();
      }
    }
  }

  /** @internal */
  _onRemovedFromScene(): void {
    this._scene = null;
    const joints = this._joints;
    if (joints) {
      for (let i = 0, n = joints.length; i < n; i++) {
        joints[i]._onColliderSceneChanged();
      }
    }
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._scene?.removeCollider(this);
    this._joints = null;
    for (let i = 0, n = this._shapes.length; i < n; i++) {
      this._shapes[i]._collider = null;
    }
    this._shapes.length = 0;
    const hk = this._havokPhysics._hk;
    if (this._containerShape) {
      if (hk) {
        hk.HP_Shape_Release(this._containerShape);
      }
      this._containerShape = null;
    }
    if (hk) {
      hk.HP_Body_Release(this._hkBody);
    }
  }

  protected _onAfterShapeUpdated(): void {}

  /** @internal */
  protected _createContainerShape(shapes: HavokColliderShape[]): HP_ShapeId {
    const hk = this._havokPhysics._hk;
    const container = hk.HP_Shape_CreateContainer()[1];
    const childTransform = HavokCollider._tempChildTransform;
    const cp = childTransform[0];
    const cq = childTransform[1];
    for (let i = 0, n = shapes.length; i < n; i++) {
      const s = shapes[i];
      if (!s._hkShape) continue;
      const p = s._localPosition;
      const q = s._localRotation;
      cp[0] = p.x;
      cp[1] = p.y;
      cp[2] = p.z;
      cq[0] = q.x;
      cq[1] = q.y;
      cq[2] = q.z;
      cq[3] = q.w;
      hk.HP_Shape_AddChild(container, s._hkShape, childTransform);
    }
    return container;
  }

  /** @internal */
  _rebuildBodyShape(): void {
    const hk = this._havokPhysics._hk;
    const shapes = this._shapes;
    const prevContainer = this._containerShape;
    this._containerShape = null;

    if (shapes.length === 0) {
      hk.HP_Body_SetShape(this._hkBody, ZERO_HANDLE);
    } else if (shapes.length === 1 && !shapes[0]._hasNonIdentityLocalPose()) {
      hk.HP_Body_SetShape(this._hkBody, shapes[0]._hkShape!);
    } else {
      const container = this._createContainerShape(shapes);
      this._containerShape = container;
      hk.HP_Body_SetShape(this._hkBody, container);
    }

    if (prevContainer) {
      hk.HP_Shape_Release(prevContainer);
    }
    this._onAfterShapeUpdated();
  }
}
