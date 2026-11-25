import { DataObject } from "../../base/DataObject";
import { IDynamicActor, IJoint, IPhysicsScene } from "@galacean/engine-design";
import { Quaternion, Vector3 } from "@galacean/engine-math";
import { Component } from "../../Component";
import { DependentMode, dependentComponents } from "../../ComponentsDependencies";
import { Entity } from "../../Entity";
import type { Scene } from "../../Scene";
import { TransformModifyFlags } from "../../Transform";
import { ignoreClone } from "../../clone/CloneDecorators";
import type { ICloneHook } from "../../clone/ICloneHook";
import { PhysicsUtils } from "../PhysicsUtils";
import { Rigidbody } from "../Rigidbody";

/**
 * A constraint between the Entity's Rigidbody and another body or the world.
 * @decorator `@dependentComponents(Rigidbody, DependentMode.AutoAdd)`
 */
@dependentComponents(Rigidbody, DependentMode.AutoAdd)
export abstract class Joint extends Component implements ICloneHook<Joint> {
  private static _tempVector3 = new Vector3();
  private static _tempQuat = new Quaternion();
  private static _tempConnectedRotation = new Quaternion();

  private static _unscaleFromActorFrame(entity: Entity, offset: Vector3, out: Vector3): void {
    const transform = entity.transform;
    const parent = entity.parent;
    if (!parent || parent.transform._getWorldUniformScaling()) {
      const scale = transform.lossyWorldScale;
      const x = offset.x / scale.x;
      const y = offset.y / scale.y;
      const z = offset.z / scale.z;
      out.set(Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0, Number.isFinite(z) ? z : 0);
      return;
    }

    const e = transform._getScaleMatrix().elements;
    const m00 = e[0],
      m10 = e[1],
      m20 = e[2];
    const m01 = e[3],
      m11 = e[4],
      m21 = e[5];
    const m02 = e[6],
      m12 = e[7],
      m22 = e[8];
    const bx = offset.x,
      by = offset.y,
      bz = offset.z;

    const c00 = m11 * m22 - m21 * m12;
    const c01 = m21 * m02 - m01 * m22;
    const c02 = m01 * m12 - m11 * m02;
    const det = m00 * c00 + m10 * c01 + m20 * c02;

    const g00 = m00 * m00 + m10 * m10 + m20 * m20;
    const g11 = m01 * m01 + m11 * m11 + m21 * m21;
    const g22 = m02 * m02 + m12 * m12 + m22 * m22;
    const volBound = Math.sqrt(g00) * Math.sqrt(g11) * Math.sqrt(g22);
    if (volBound > 0 && Math.abs(det) > volBound * 1e-6) {
      const invDet = 1 / det;
      const x = (c00 * bx + c01 * by + c02 * bz) * invDet;
      const y = ((m20 * m12 - m10 * m22) * bx + (m00 * m22 - m20 * m02) * by + (m10 * m02 - m00 * m12) * bz) * invDet;
      const z = ((m10 * m21 - m20 * m11) * bx + (m20 * m01 - m00 * m21) * by + (m00 * m11 - m10 * m01) * bz) * invDet;
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        out.set(x, y, z);
        return;
      }
    }

    // Singular scale matrix: project onto the best-conditioned non-degenerate column subspace.
    const g01 = m00 * m01 + m10 * m11 + m20 * m21;
    const g02 = m00 * m02 + m10 * m12 + m20 * m22;
    const g12 = m01 * m02 + m11 * m12 + m21 * m22;
    const r0 = m00 * bx + m10 * by + m20 * bz;
    const r1 = m01 * bx + m11 * by + m21 * bz;
    const r2 = m02 * bx + m12 * by + m22 * bz;

    const d01 = g00 * g11 - g01 * g01;
    const d02 = g00 * g22 - g02 * g02;
    const d12 = g11 * g22 - g12 * g12;
    const s01 = g00 > 0 && g11 > 0 ? d01 / (g00 * g11) : 0;
    const s02 = g00 > 0 && g22 > 0 ? d02 / (g00 * g22) : 0;
    const s12 = g11 > 0 && g22 > 0 ? d12 / (g11 * g22) : 0;
    if (Math.max(s01, s02, s12) > 1e-12) {
      let x = 0;
      let y = 0;
      let z = 0;
      if (s01 >= s02 && s01 >= s12) {
        x = (g11 * r0 - g01 * r1) / d01;
        y = (g00 * r1 - g01 * r0) / d01;
      } else if (s02 >= s12) {
        x = (g22 * r0 - g02 * r2) / d02;
        z = (g00 * r2 - g02 * r0) / d02;
      } else {
        y = (g22 * r1 - g12 * r2) / d12;
        z = (g11 * r2 - g12 * r1) / d12;
      }
      out.set(Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0, Number.isFinite(z) ? z : 0);
      return;
    }

    const maxG = Math.max(g00, g11, g22);
    if (maxG > 0) {
      if (g00 >= g11 && g00 >= g22) {
        const x = r0 / g00;
        out.set(Number.isFinite(x) ? x : 0, 0, 0);
      } else if (g11 >= g22) {
        const y = r1 / g11;
        out.set(0, Number.isFinite(y) ? y : 0, 0);
      } else {
        const z = r2 / g22;
        out.set(0, 0, Number.isFinite(z) ? z : 0);
      }
      return;
    }
    out.set(0, 0, 0);
  }

  @ignoreClone
  protected _nativeJoint: IJoint | null;

  private _bodyInfo = new JointBodyInfo();
  private _connectedBodyInfo = new JointBodyInfo();
  @ignoreClone
  private _connectedBody: Rigidbody | null = null;
  private _force = Infinity;
  private _torque = Infinity;
  @ignoreClone
  private _automaticConnectedAnchor = true;
  @ignoreClone
  private _registeredScene: Scene | null = null;

  /**
   * The connected Rigidbody, or null to constrain against the world.
   * @remarks With a connected body, the constraint is active only while both bodies are registered in the same scene.
   * Destroying the connected body clears the connection.
   * @throws When assigned a destroyed body, the joint's own body, or a body from another engine.
   */
  get connectedBody(): Rigidbody | null {
    return this._connectedBody;
  }

  set connectedBody(value: Rigidbody | null) {
    if (value) {
      if (value.destroyed) {
        throw new Error("Joint: connectedBody has been destroyed.");
      } else if (value.engine !== this.engine) {
        throw new Error("Joint: connectedBody belongs to another engine.");
      } else if (value.entity === this.entity) {
        throw new Error("Joint: cannot connect a Rigidbody to itself.");
      }
    }
    const preBody = this._connectedBody;
    if (preBody !== value) {
      preBody?.entity._updateFlagManager.removeListener(this._onConnectedTransformChanged);
      preBody?._detachJoint(this);
      value?.entity._updateFlagManager.addListener(this._onConnectedTransformChanged);
      value?._attachJoint(this);
      this._nativeJoint && preBody?._wakeNative();
      this._connectedBody = value;
      this._syncActiveJoint();
    }
  }

  /**
   * The anchor in this Entity's local space.
   */
  get anchor(): Vector3 {
    return this._bodyInfo.anchor;
  }

  set anchor(value: Vector3) {
    const anchor = this._bodyInfo.anchor;
    value !== anchor && anchor.copyFrom(value);
  }

  /**
   * The anchor in the connected body's local space, or in world space when {@link connectedBody} is null.
   * @remarks Writing disables {@link automaticConnectedAnchor}.
   */
  get connectedAnchor(): Vector3 {
    return this._connectedBodyInfo.anchor;
  }

  set connectedAnchor(value: Vector3) {
    const anchor = this._connectedBodyInfo.anchor;
    value !== anchor && anchor.copyFrom(value);
  }

  /**
   * Whether the connected anchor automatically matches the world position of {@link anchor} while the joint is active.
   * @remarks Re-enabling recalculates the anchor when the joint is active; disabling preserves the current value.
   */
  get automaticConnectedAnchor(): boolean {
    return this._automaticConnectedAnchor;
  }

  set automaticConnectedAnchor(value: boolean) {
    this._automaticConnectedAnchor = value;
    const nativeJoint = this._nativeJoint;
    if (value && nativeJoint) {
      this._syncConnectedFrame(nativeJoint, false);
      this._wakeBodies();
    }
  }

  /**
   * The scale to apply to the mass of the connected body for resolving this constraint.
   * @remarks `Infinity` treats the connected body as having infinite mass during constraint solving.
   * @throws When the value is not positive or its Float32 inverse is not finite.
   */
  get connectedMassScale(): number {
    return this._connectedBodyInfo.massScale;
  }

  set connectedMassScale(value: number) {
    if (typeof value !== "number" || !(value > 0 && Number.isFinite(Math.fround(1 / value)))) {
      throw new Error("Joint connectedMassScale must be positive with a finite Float32 inverse.");
    }
    if (value !== this._connectedBodyInfo.massScale) {
      this._connectedBodyInfo.massScale = value;
      const nativeJoint = this._nativeJoint;
      if (nativeJoint) {
        nativeJoint.setConnectedMassScale(value);
        this._wakeBodies();
      }
    }
  }

  /**
   * The scale to apply to the mass of this body for resolving this constraint.
   * @remarks `Infinity` treats this body as having infinite mass during constraint solving.
   * @throws When the value is not positive or its Float32 inverse is not finite.
   */
  get massScale(): number {
    return this._bodyInfo.massScale;
  }

  set massScale(value: number) {
    if (typeof value !== "number" || !(value > 0 && Number.isFinite(Math.fround(1 / value)))) {
      throw new Error("Joint massScale must be positive with a finite Float32 inverse.");
    }
    if (value !== this._bodyInfo.massScale) {
      this._bodyInfo.massScale = value;
      const nativeJoint = this._nativeJoint;
      if (nativeJoint) {
        nativeJoint.setMassScale(value);
        this._wakeBodies();
      }
    }
  }

  /**
   * The scale to apply to the inverse inertia of the connected body for resolving this constraint.
   */
  get connectedInertiaScale(): number {
    return this._connectedBodyInfo.inertiaScale;
  }

  set connectedInertiaScale(value: number) {
    if (value !== this._connectedBodyInfo.inertiaScale) {
      this._connectedBodyInfo.inertiaScale = value;
      const nativeJoint = this._nativeJoint;
      if (nativeJoint) {
        nativeJoint.setConnectedInertiaScale(value);
        this._wakeBodies();
      }
    }
  }

  /**
   * The scale to apply to the inverse inertia of this body for resolving this constraint.
   */
  get inertiaScale(): number {
    return this._bodyInfo.inertiaScale;
  }

  set inertiaScale(value: number) {
    if (value !== this._bodyInfo.inertiaScale) {
      this._bodyInfo.inertiaScale = value;
      const nativeJoint = this._nativeJoint;
      if (nativeJoint) {
        nativeJoint.setInertiaScale(value);
        this._wakeBodies();
      }
    }
  }

  /**
   * The maximum force the joint can apply before breaking.
   */
  get breakForce(): number {
    return this._force;
  }

  set breakForce(value: number) {
    if (value !== this._force) {
      this._force = value;
      const nativeJoint = this._nativeJoint;
      if (nativeJoint) {
        nativeJoint.setBreakForce(value);
        this._wakeBodies();
      }
    }
  }

  /**
   * The maximum torque the joint can apply before breaking.
   */
  get breakTorque(): number {
    return this._torque;
  }

  set breakTorque(value: number) {
    if (value !== this._torque) {
      this._torque = value;
      const nativeJoint = this._nativeJoint;
      if (nativeJoint) {
        nativeJoint.setBreakTorque(value);
        this._wakeBodies();
      }
    }
  }

  constructor(entity: Entity) {
    super(entity);
    this._onAnchorChanged = this._onAnchorChanged.bind(this);
    this._bodyInfo.anchor._onValueChanged = this._onAnchorChanged;
    this._handleConnectedAnchorChanged = this._handleConnectedAnchorChanged.bind(this);
    this._connectedBodyInfo.anchor._onValueChanged = this._handleConnectedAnchorChanged;

    this._onSelfTransformChanged = this._onSelfTransformChanged.bind(this);
    this._onConnectedTransformChanged = this._onConnectedTransformChanged.bind(this);
    entity._updateFlagManager.addListener(this._onSelfTransformChanged);
  }

  /**
   * @internal
   */
  override _onEnableInScene(): void {
    if (this.destroyed) return;
    this._registeredScene = this.scene!;
    this.entity.getComponent(Rigidbody)!._attachJoint(this);
    this._syncActiveJoint();
  }

  /**
   * @internal
   */
  override _onDisableInScene(): void {
    if (!this._registeredScene) return;
    this._registeredScene = null;
    this.entity.getComponent(Rigidbody)?._detachJoint(this);
    this._destroyNativeJoint();
  }

  /**
   * @internal
   */
  _onClone(target: Joint, cloneMap: ReadonlyMap<object, object>): void {
    target._bodyInfo.anchor.copyFrom(this._bodyInfo.anchor);
    target._connectedBodyInfo.anchor.copyFrom(this._connectedBodyInfo.anchor);
    target._automaticConnectedAnchor = this._automaticConnectedAnchor;

    const body = this._connectedBody;
    target.connectedBody = body && (<Rigidbody | undefined>cloneMap.get(body) ?? body);
  }

  /**
   * Clears an authored connection when its target is destroyed.
   * @internal
   */
  _onBodyDestroyed(body: Rigidbody, registeredActor: IDynamicActor | null): void {
    if (this._connectedBody === body) {
      if (!this._automaticConnectedAnchor) {
        const transform = body.entity.transform;
        const position = registeredActor ? Joint._tempVector3 : transform.worldPosition;
        const rotation = registeredActor ? Joint._tempQuat : transform.worldRotationQuaternion;
        registeredActor?.getWorldTransform(position, rotation);
        const anchor = this._connectedBodyInfo.anchor;
        anchor._onValueChanged = null;
        PhysicsUtils.scaleToActorFrame(body.entity, anchor, anchor);
        Vector3.transformByQuat(anchor, rotation, anchor);
        anchor.add(position);
        anchor._onValueChanged = this._handleConnectedAnchorChanged;
      }
      this.connectedBody = null;
    }
  }

  /**
   * Reconciles the constraint with both bodies' native scene registrations.
   * @internal
   */
  _syncActiveJoint(): void {
    const scene = this._registeredScene;
    if (!scene) return;
    const bodyActor = this.entity.getComponent(Rigidbody)?._getRegisteredActor(scene) ?? null;
    const connectedBody = this._connectedBody;
    const connectedActor = connectedBody?._getRegisteredActor(scene) ?? null;
    if (!bodyActor || (connectedBody && !connectedActor)) {
      this._destroyNativeJoint();
      return;
    }
    const nativeJoint = this._nativeJoint;
    if (nativeJoint) {
      nativeJoint.setConnectedActor(connectedActor);
      this._syncConnectedFrame(nativeJoint);
    } else {
      const joint = (this._nativeJoint = this._createJoint(scene.physics._nativePhysicsScene, bodyActor));
      connectedActor && joint.setConnectedActor(connectedActor);
      this._syncNative();
    }
    this._wakeBodies();
  }

  protected override _onDestroy(): void {
    this._bodyInfo.anchor._onValueChanged = null;
    this._connectedBodyInfo.anchor._onValueChanged = null;
    super._onDestroy();
    if (this._registeredScene) this._onDisableInScene();
    this.entity._updateFlagManager.removeListener(this._onSelfTransformChanged);
    const connectedBody = this._connectedBody;
    if (connectedBody) {
      connectedBody.entity._updateFlagManager.removeListener(this._onConnectedTransformChanged);
      connectedBody._detachJoint(this);
      this._connectedBody = null;
    }
  }

  protected abstract _createJoint(physicsScene: IPhysicsScene, actor: IDynamicActor): IJoint;

  protected _destroyNativeJoint(): void {
    const nativeJoint = this._nativeJoint;
    if (nativeJoint) {
      nativeJoint.destroy();
      this._nativeJoint = null;
      this._wakeBodies();
    }
  }

  protected _syncNative(): void {
    const nativeJoint = this._nativeJoint!;
    this._syncAnchor(nativeJoint, this._bodyInfo, true);
    this._syncConnectedFrame(nativeJoint);
    nativeJoint.setConnectedMassScale(this._connectedBodyInfo.massScale);
    nativeJoint.setConnectedInertiaScale(this._connectedBodyInfo.inertiaScale);
    nativeJoint.setMassScale(this._bodyInfo.massScale);
    nativeJoint.setInertiaScale(this._bodyInfo.inertiaScale);
    nativeJoint.setBreakForce(this._force);
    nativeJoint.setBreakTorque(this._torque);
  }

  protected _wakeBodies(onlyIfSleeping = false): void {
    const selfBody = this.entity.getComponent(Rigidbody);
    selfBody && (!onlyIfSleeping || selfBody.isSleeping()) && selfBody._wakeNative();
    const body = this._connectedBody;
    body && body.scene === this.scene && (!onlyIfSleeping || body.isSleeping()) && body._wakeNative();
  }

  private _syncConnectedFrame(nativeJoint: IJoint, updateRotation = true): void {
    const selfActor = this.entity.getComponent(Rigidbody)!._getActorWithCurrentPose()!;
    const body = this._connectedBody;
    const connectedActor = body?._getActorWithCurrentPose();
    const position = Joint._tempVector3;
    const rotation = Joint._tempQuat;
    selfActor.getWorldTransform(position, rotation);
    const automatic = this._automaticConnectedAnchor;
    const anchor = this._connectedBodyInfo.anchor;
    if (automatic) {
      anchor._onValueChanged = null;
      Vector3.transformByQuat(this._bodyInfo.actualAnchor, rotation, anchor);
      anchor.add(position);
    }
    if (connectedActor) {
      const invRotation = Joint._tempConnectedRotation;
      connectedActor.getWorldTransform(position, invRotation);
      Quaternion.invert(invRotation, invRotation);
      if (automatic) {
        anchor.subtract(position);
        Vector3.transformByQuat(anchor, invRotation, anchor);
        Joint._unscaleFromActorFrame(body!.entity, anchor, anchor);
      }
      if (updateRotation) Quaternion.multiply(invRotation, rotation, rotation);
    }
    if (automatic) anchor._onValueChanged = this._handleConnectedAnchorChanged;
    this._syncAnchor(nativeJoint, this._connectedBodyInfo, true);
    if (updateRotation) nativeJoint.setRotation(rotation);
  }

  @ignoreClone
  private _onAnchorChanged(): void {
    const nativeJoint = this._nativeJoint;
    if (nativeJoint && this._syncAnchor(nativeJoint, this._bodyInfo)) {
      if (this._automaticConnectedAnchor) this._syncConnectedFrame(nativeJoint, false);
      this._wakeBodies();
    }
  }

  @ignoreClone
  private _handleConnectedAnchorChanged(): void {
    this._automaticConnectedAnchor = false;
    const nativeJoint = this._nativeJoint;
    if (nativeJoint && this._syncAnchor(nativeJoint, this._connectedBodyInfo)) this._wakeBodies();
  }

  @ignoreClone
  private _onSelfTransformChanged(type: TransformModifyFlags): void {
    type & TransformModifyFlags.WorldScale && this._syncAnchorScale(this._bodyInfo);
  }

  @ignoreClone
  private _onConnectedTransformChanged(type: TransformModifyFlags): void {
    type & TransformModifyFlags.WorldScale && this._syncAnchorScale(this._connectedBodyInfo);
  }

  private _syncAnchorScale(info: JointBodyInfo): void {
    const nativeJoint = this._nativeJoint;
    if (!nativeJoint) return;
    const anchor = info.anchor;
    if (anchor.x === 0 && anchor.y === 0 && anchor.z === 0) return;
    if (this._syncAnchor(nativeJoint, info)) this._wakeBodies(true);
  }

  private _syncAnchor(nativeJoint: IJoint, info: JointBodyInfo, force = false): boolean {
    const self = info === this._bodyInfo;
    const entity = self ? this.entity : this._connectedBody?.entity;
    const scaled = Joint._tempVector3;
    if (entity) PhysicsUtils.scaleToActorFrame(entity, info.anchor, scaled);
    else scaled.copyFrom(info.anchor);

    const actual = info.actualAnchor;
    if (!force && !PhysicsUtils.differsF32(scaled, actual)) return false;
    actual.copyFrom(scaled);
    if (self) nativeJoint.setAnchor(actual);
    else nativeJoint.setConnectedAnchor(actual);
    return true;
  }
}

class JointBodyInfo extends DataObject {
  @ignoreClone
  anchor = new Vector3();
  @ignoreClone
  actualAnchor = new Vector3();
  massScale: number = 1;
  inertiaScale: number = 1;
}
