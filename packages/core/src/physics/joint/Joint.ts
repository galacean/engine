import { DataObject } from "../../base/DataObject";
import { IDynamicActor, IJoint, IPhysicsScene } from "@galacean/engine-design";
import { Quaternion, Vector3 } from "@galacean/engine-math";
import { Component } from "../../Component";
import { DependentMode, dependentComponents } from "../../ComponentsDependencies";
import { Entity } from "../../Entity";
import type { Scene } from "../../Scene";
import { type Transform, TransformModifyFlags } from "../../Transform";
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

  private static _toSolverWorldAnchor(transform: Transform, anchor: Vector3, out: Vector3): void {
    Vector3.multiply(anchor, transform.lossyWorldScale, out);
    Vector3.transformByQuat(out, transform.worldRotationQuaternion, out);
    out.add(transform.worldPosition);
  }

  @ignoreClone
  protected _nativeJoint: IJoint | null;

  private _bodyInfo = new JointBodyInfo();
  private _connectedBodyInfo = new JointBodyInfo();
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
    value && this._updateAnchors(AnchorOwner.Connected, true);
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
  _onClone(target: Joint): void {
    target._bodyInfo.anchor.copyFrom(this._bodyInfo.anchor);
    target._connectedBodyInfo.anchor.copyFrom(this._connectedBodyInfo.anchor);
    target._automaticConnectedAnchor = this._automaticConnectedAnchor;

    const connectedBody = target._connectedBody;
    connectedBody?.entity._updateFlagManager.addListener(target._onConnectedTransformChanged);
    connectedBody?._attachJoint(target);
  }

  /**
   * Clears an authored connection when its target is destroyed.
   * @internal
   */
  _onBodyDestroyed(body: Rigidbody): void {
    if (this._connectedBody === body) {
      if (!this._automaticConnectedAnchor) {
        const anchor = this._connectedBodyInfo.anchor;
        const worldAnchor = Joint._tempVector3;
        Joint._toSolverWorldAnchor(body.entity.transform, anchor, worldAnchor);
        anchor._onValueChanged = null;
        anchor.copyFrom(worldAnchor);
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
      this._syncFrames(nativeJoint, AnchorOwner.Connected);
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
    this._syncFrames(nativeJoint, AnchorOwner.Both);
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

  private _syncFrames(nativeJoint: IJoint, owner: AnchorOwner): void {
    this._automaticConnectedAnchor && this._calculateConnectedAnchor();
    this._syncAnchors(nativeJoint, owner);

    let rotation = this.entity.transform.worldRotationQuaternion;
    const connectedBody = this._connectedBody;
    if (connectedBody) {
      const relativeRotation = Joint._tempQuat;
      Quaternion.invert(connectedBody.entity.transform.worldRotationQuaternion, relativeRotation);
      Quaternion.multiply(relativeRotation, rotation, relativeRotation);
      rotation = relativeRotation;
    }
    nativeJoint.setRotation(rotation);
  }

  private _calculateConnectedAnchor(): void {
    const connectedAnchor = this._connectedBodyInfo.anchor;
    const connectedBody = this._connectedBody;
    const worldAnchor = Joint._tempVector3;
    Joint._toSolverWorldAnchor(this.entity.transform, this._bodyInfo.anchor, worldAnchor);

    connectedAnchor._onValueChanged = null;
    if (connectedBody) {
      const connectedTransform = connectedBody.entity.transform;
      worldAnchor.subtract(connectedTransform.worldPosition);
      const invRotation = Joint._tempQuat;
      Quaternion.invert(connectedTransform.worldRotationQuaternion, invRotation);
      Vector3.transformByQuat(worldAnchor, invRotation, worldAnchor);
      const scale = connectedTransform.lossyWorldScale;
      const x = worldAnchor.x / scale.x;
      const y = worldAnchor.y / scale.y;
      const z = worldAnchor.z / scale.z;
      connectedAnchor.set(Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0, Number.isFinite(z) ? z : 0);
    } else {
      connectedAnchor.copyFrom(worldAnchor);
    }
    connectedAnchor._onValueChanged = this._handleConnectedAnchorChanged;
  }

  @ignoreClone
  private _onAnchorChanged(): void {
    const automatic = this._automaticConnectedAnchor;
    this._updateAnchors(automatic ? AnchorOwner.Both : AnchorOwner.Self, automatic);
  }

  @ignoreClone
  private _handleConnectedAnchorChanged(): void {
    this._automaticConnectedAnchor = false;
    this._updateAnchors(AnchorOwner.Connected);
  }

  @ignoreClone
  private _onSelfTransformChanged(type: TransformModifyFlags): void {
    type & TransformModifyFlags.WorldScale && this._syncAnchorScale(AnchorOwner.Self);
  }

  @ignoreClone
  private _onConnectedTransformChanged(type: TransformModifyFlags): void {
    type & TransformModifyFlags.WorldScale && this._syncAnchorScale(AnchorOwner.Connected);
  }

  /** Sync the edited anchors and wake bodies once while the joint is active. */
  private _updateAnchors(owner: AnchorOwner, recalculateConnected = false): void {
    const nativeJoint = this._nativeJoint;
    if (nativeJoint) {
      recalculateConnected && this._calculateConnectedAnchor();
      this._syncAnchors(nativeJoint, owner);
      this._wakeBodies();
    }
  }

  private _syncAnchorScale(owner: AnchorOwner): void {
    const nativeJoint = this._nativeJoint;
    if (!nativeJoint) return;
    const isSelf = owner === AnchorOwner.Self;
    const bodyInfo = isSelf ? this._bodyInfo : this._connectedBodyInfo;
    const anchor = bodyInfo.anchor;
    if (anchor.x === 0 && anchor.y === 0 && anchor.z === 0) return;
    const entity = isSelf ? this.entity : this._connectedBody!.entity;
    const scaled = Joint._tempVector3;
    Vector3.multiply(anchor, entity.transform.lossyWorldScale, scaled);
    const actual = bodyInfo.actualAnchor;
    if (PhysicsUtils.differsF32(scaled, actual)) {
      actual.copyFrom(scaled);
      isSelf ? nativeJoint.setAnchor(actual) : nativeJoint.setConnectedAnchor(actual);
      this._wakeBodies(true);
    }
  }

  private _syncAnchors(nativeJoint: IJoint, owner: AnchorOwner): void {
    if (owner & AnchorOwner.Self) {
      const worldScale = this.entity.transform.lossyWorldScale;
      const selfBodyInfo = this._bodyInfo;
      Vector3.multiply(selfBodyInfo.anchor, worldScale, selfBodyInfo.actualAnchor);
      nativeJoint.setAnchor(selfBodyInfo.actualAnchor);
    }
    if (owner & AnchorOwner.Connected) {
      const connectedBodyInfo = this._connectedBodyInfo;
      const connectedBody = this._connectedBody;
      if (connectedBody) {
        const worldScale = connectedBody.entity.transform.lossyWorldScale;
        Vector3.multiply(connectedBodyInfo.anchor, worldScale, connectedBodyInfo.actualAnchor);
      } else {
        connectedBodyInfo.actualAnchor.copyFrom(connectedBodyInfo.anchor);
      }
      nativeJoint.setConnectedAnchor(connectedBodyInfo.actualAnchor);
    }
  }
}

const enum AnchorOwner {
  Self = 0x1,
  Connected = 0x2,
  Both = Self | Connected
}

class JointBodyInfo extends DataObject {
  @ignoreClone
  anchor = new Vector3();
  @ignoreClone
  actualAnchor = new Vector3();
  massScale: number = 1;
  inertiaScale: number = 1;
}
