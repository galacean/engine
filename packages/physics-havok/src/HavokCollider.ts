import { Quaternion, Vector3 } from "@galacean/engine";
import { ICollider } from "@galacean/engine-design";
import { HavokPhysics } from "./HavokPhysics";
import type { HavokPhysicsScene } from "./HavokPhysicsScene";
import { HavokEventBits, HP_BodyId, HP_ShapeId, ZERO_HANDLE } from "./HavokTypes";
import type { HavokJoint } from "./joint/HavokJoint";
import { HavokColliderShape } from "./shape/HavokColliderShape";

/**
 * Abstract native rigid actor holding collider shapes.
 * Uses deferred Container rebuilds so multiple setLocalPose/addShape mutations
 * in the same frame coalesce into a single Havok container allocation.
 */
export abstract class HavokCollider implements ICollider {
  private static _tempQuat = new Quaternion();

  /** @internal */
  _scene: HavokPhysicsScene | null = null;
  /** @internal */
  _hkBody: HP_BodyId;
  /** @internal */
  _shapes: HavokColliderShape[] = [];
  /** @internal */
  _containerShape: HP_ShapeId | null = null;
  /** @internal */
  _shapeDirty = false;

  protected _havokPhysics: HavokPhysics;
  protected _destroyed = false;

  private _joints = new Set<HavokJoint>();

  constructor(havokPhysics: HavokPhysics, position: Vector3, rotation: Quaternion) {
    this._havokPhysics = havokPhysics;
    const hk = havokPhysics._hk;
    this._hkBody = hk.HP_Body_Create()[1];
    HavokCollider._tempQuat.set(0, 0, 0, 1);
    Quaternion.normalize(rotation, HavokCollider._tempQuat);
    const q = HavokCollider._tempQuat;
    hk.HP_Body_SetQTransform(this._hkBody, [
      [position.x, position.y, position.z],
      [q.x, q.y, q.z, q.w]
    ]);
    // Trigger events always on; contact events toggled per-scene
    hk.HP_Body_SetEventMask(this._hkBody, HavokEventBits.ALL_TRIGGERS);
  }

  /** @internal */
  _updateEventMask(contactEnabled: boolean): void {
    const mask = (contactEnabled ? HavokEventBits.ALL_COLLISIONS : 0) | HavokEventBits.ALL_TRIGGERS;
    this._havokPhysics._hk.HP_Body_SetEventMask(this._hkBody, mask);
  }

  addShape(shape: HavokColliderShape): boolean {
    if (!shape._hkShape) {
      return false;
    }
    shape._collider = this;
    this._shapes.push(shape);
    this._markShapeDirty();
    this._scene?._addColliderShape(shape._id);
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
    previousShape._collider = null;
    newShape._collider = this;
    this._shapes[idx] = newShape;
    this._markShapeDirty();
    const scene = this._scene;
    if (scene) {
      // Same logical Collider id: trigger pairs survive if still overlapping next step
      scene._removeColliderShape(previousShape._id);
      scene._addColliderShape(newShape._id);
    }
    return true;
  }

  setWorldTransform(position: Vector3, rotation: Quaternion): void {
    HavokCollider._tempQuat.set(0, 0, 0, 1);
    Quaternion.normalize(rotation, HavokCollider._tempQuat);
    const q = HavokCollider._tempQuat;
    this._havokPhysics._hk.HP_Body_SetQTransform(this._hkBody, [
      [position.x, position.y, position.z],
      [q.x, q.y, q.z, q.w]
    ]);
    this._scene?._markBroadphaseDirty(this);
  }

  getWorldTransform(outPosition: Vector3, outRotation: Quaternion): void {
    const [, transform] = this._havokPhysics._hk.HP_Body_GetQTransform(this._hkBody);
    const pos = transform[0];
    const rot = transform[1];
    outPosition.set(pos[0], pos[1], pos[2]);
    outRotation.set(rot[0], rot[1], rot[2], rot[3]);
  }

  /** @internal */
  _markShapeDirty(): void {
    this._shapeDirty = true;
    this._scene?._markDirtyCollider(this);
  }

  /** @internal */
  _invalidateShapePairs(shape: HavokColliderShape): void {
    this._scene?._invalidateShapePairs(this, shape._id);
  }

  /** @internal */
  _addJoint(joint: HavokJoint): void {
    this._joints.add(joint);
  }

  /** @internal */
  _removeJoint(joint: HavokJoint): void {
    this._joints.delete(joint);
  }

  /** @internal */
  _flushShapeIfDirty(): void {
    if (!this._shapeDirty) return;
    if (this._scene) {
      // Detach from world around HP_Body_SetShape to prevent Havok's triangle-mesh trigger hang
      // and to refresh the broadphase AABB for immediate scene queries.
      this._scene._reinsertBody(this, true);
    } else {
      this._shapeDirty = false;
      this._rebuildBodyShape();
    }
  }

  /** @internal */
  _onAddedToScene(scene: HavokPhysicsScene): void {
    this._scene = scene;
    this._updateEventMask(scene._contactEventsEnabled);
    if (this._shapeDirty) {
      this._flushShapeIfDirty();
    }
    this._joints.forEach((joint) => {
      joint._onColliderSceneChanged();
    });
  }

  /** @internal */
  _onRemovedFromScene(): void {
    this._scene = null;
    this._joints.forEach((joint) => {
      joint._onColliderSceneChanged();
    });
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._scene?.removeCollider(this);
    this._joints.clear();
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
      const container = hk.HP_Shape_CreateContainer()[1];
      for (let i = 0, n = shapes.length; i < n; i++) {
        const s = shapes[i];
        if (!s._hkShape) continue;
        const p = s._localPosition;
        const q = s._localRotation;
        hk.HP_Shape_AddChild(container, s._hkShape, [
          [p.x, p.y, p.z],
          [q.x, q.y, q.z, q.w],
          [1, 1, 1]
        ]);
      }
      this._containerShape = container;
      hk.HP_Body_SetShape(this._hkBody, container);
    }

    if (prevContainer) {
      hk.HP_Shape_Release(prevContainer);
    }
    this._onAfterShapeUpdated();
  }
}
