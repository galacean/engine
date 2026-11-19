import { Quaternion, Vector3, Vector4 } from "@galacean/engine";
import { IColliderShape } from "@galacean/engine-design";
import type { HavokCollider } from "../HavokCollider";
import { HavokPhysics } from "../HavokPhysics";
import { HavokMaterialConsumer, HavokPhysicsMaterial } from "../HavokPhysicsMaterial";
import { HavokShapeIdentity, HKPhysicsMaterial, HP_ShapeId, normalizeQuatOrIdentity } from "../HavokTypes";

/**
 * Base class for Havok collider shapes.
 */
export abstract class HavokColliderShape implements IColliderShape, HavokMaterialConsumer, HavokShapeIdentity {
  protected static _tempVector3 = new Vector3();
  protected static _tempWorldPos = new Vector3();
  protected static _tempQuat = new Quaternion();
  protected static _tempWorldRot = new Quaternion();
  protected static _tempVector4 = new Vector4();

  /** @internal */
  _id: number;
  /** @internal */
  _hkShape: HP_ShapeId | null = null;
  /** @internal */
  _hkShapePtr = 0;
  /** @internal */
  _material: HavokPhysicsMaterial;
  /** @internal Already-scaled local position relative to owning actor. */
  _localPosition = new Vector3();
  /** @internal Local rotation relative to owning actor. */
  _localRotation = new Quaternion(0, 0, 0, 1);
  /** @internal */
  _worldScale = new Vector3(1, 1, 1);
  /** @internal */
  _isTrigger = false;
  /** @internal */
  _isSceneQuery = true;
  /** @internal */
  _layer = 0;
  /** @internal */
  _collider: HavokCollider | null = null;

  protected _havokPhysics: HavokPhysics;

  constructor(havokPhysics: HavokPhysics, uniqueID: number, material: HavokPhysicsMaterial) {
    this._havokPhysics = havokPhysics;
    this._id = uniqueID;
    this._material = material;
  }

  /** @internal */
  _initShape(hkShape: HP_ShapeId): void {
    this._hkShape = hkShape;
    this._hkShapePtr = Number(hkShape[0]);
    this._material._addConsumer(this);
    this._applyShapeProperties();
  }

  /** @internal */
  _applyHKMaterial(mat: HKPhysicsMaterial): void {
    if (this._hkShape) {
      this._havokPhysics._hk.HP_Shape_SetMaterial(this._hkShape, mat);
    }
  }

  /** @internal */
  _syncLayerFilter(): void {
    if (this._hkShape) {
      this._havokPhysics._hk.HP_Shape_SetFilterInfo(this._hkShape, this._havokPhysics._getLayerFilterInfo(this._layer));
    }
  }

  /** @internal */
  _hasNonIdentityLocalPose(): boolean {
    const p = this._localPosition;
    const q = this._localRotation;
    return (
      p.x !== 0 || p.y !== 0 || p.z !== 0 || q.x !== 0 || q.y !== 0 || q.z !== 0 || Math.abs(Math.abs(q.w) - 1) > 1e-6
    );
  }

  setLocalPose(position: Vector3, rotation: Quaternion): void {
    const q = HavokColliderShape._tempQuat;
    normalizeQuatOrIdentity(rotation, q);
    const p = this._localPosition;
    const curQ = this._localRotation;
    if (
      p.x === position.x &&
      p.y === position.y &&
      p.z === position.z &&
      curQ.x === q.x &&
      curQ.y === q.y &&
      curQ.z === q.z &&
      curQ.w === q.w
    ) {
      return;
    }
    p.copyFrom(position);
    curQ.copyFrom(q);
    this._collider?._markShapeDirty();
  }

  setWorldScale(scale: Vector3): void {
    const sx = Math.abs(scale.x);
    const sy = Math.abs(scale.y);
    const sz = Math.abs(scale.z);
    if (this._worldScale.x === sx && this._worldScale.y === sy && this._worldScale.z === sz) {
      return;
    }
    this._worldScale.set(sx, sy, sz);
    this._onScaleChanged();
  }

  setContactOffset(): void {
    // Havok WASM does not expose per-shape contact offset.
  }

  setMaterial(value: HavokPhysicsMaterial): void {
    if (this._material === value) return;
    this._material._removeConsumer(this);
    this._material = value;
    this._material._addConsumer(this);
    this._applyHKMaterial(value._getHKMaterial());
  }

  setCollisionLayer(layer: number): void {
    if (this._layer === layer) return;
    this._layer = layer;
    this._syncLayerFilter();
    const collider = this._collider;
    collider?._scene?._invalidateShapePairs(collider, this._id);
  }

  setIsTrigger(value: boolean): void {
    if (this._isTrigger === value) return;
    this._isTrigger = value;
    if (this._hkShape) {
      this._havokPhysics._hk.HP_Shape_SetTrigger(this._hkShape, value);
      const collider = this._collider;
      collider?._scene?._invalidateShapePairs(collider, this._id);
    }
  }

  setIsSceneQuery(value: boolean): void {
    this._isSceneQuery = value;
  }

  pointDistance(point: Vector3): Vector4 {
    return HavokColliderShape._tempVector4.set(point.x, point.y, point.z, -1);
  }

  destroy(): void {
    this._material._removeConsumer(this);
    if (this._hkShape) {
      const hk = this._havokPhysics._hk;
      if (hk) {
        hk.HP_Shape_Release(this._hkShape);
      }
      this._hkShape = null;
      this._hkShapePtr = 0;
    }
    this._collider = null;
  }

  protected _onScaleChanged(): void {}

  protected _replaceHKShape(newShape: HP_ShapeId): void {
    const oldShape = this._hkShape;
    this._hkShape = newShape;
    this._hkShapePtr = Number(newShape[0]);
    this._applyShapeProperties();
    this._collider?._markShapeDirty();
    if (oldShape) {
      this._havokPhysics._hk.HP_Shape_Release(oldShape);
    }
  }

  protected _applyShapeProperties(): void {
    if (!this._hkShape) return;
    const hk = this._havokPhysics._hk;
    hk.HP_Shape_SetMaterial(this._hkShape, this._material._getHKMaterial());
    if (this._isTrigger) {
      hk.HP_Shape_SetTrigger(this._hkShape, true);
    }
    hk.HP_Shape_SetFilterInfo(this._hkShape, this._havokPhysics._getLayerFilterInfo(this._layer));
  }

  protected _getWorldPose(outPos: Vector3, outRot: Quaternion): void {
    if (!this._collider) {
      outPos.set(0, 0, 0);
      outRot.set(0, 0, 0, 1);
      return;
    }
    if (!this._hasNonIdentityLocalPose()) {
      this._collider.getWorldTransform(outPos, outRot);
      return;
    }
    const bodyPos = HavokColliderShape._tempVector3;
    const bodyRot = HavokColliderShape._tempQuat;
    this._collider.getWorldTransform(bodyPos, bodyRot);

    Vector3.transformByQuat(this._localPosition, bodyRot, outPos);
    outPos.add(bodyPos);

    Quaternion.multiply(bodyRot, this._localRotation, outRot);
    outRot.normalize();
  }

  protected _getWorldPosition(outPos: Vector3): void {
    if (!this._collider) {
      outPos.set(0, 0, 0);
      return;
    }
    const bodyPos = HavokColliderShape._tempVector3;
    const bodyRot = HavokColliderShape._tempQuat;
    this._collider.getWorldTransform(bodyPos, bodyRot);
    const lp = this._localPosition;
    if (lp.x !== 0 || lp.y !== 0 || lp.z !== 0) {
      Vector3.transformByQuat(lp, bodyRot, outPos);
      outPos.add(bodyPos);
    } else {
      outPos.copyFrom(bodyPos);
    }
  }
}
