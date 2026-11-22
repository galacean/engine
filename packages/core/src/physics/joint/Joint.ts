import { DataObject } from "../../base/DataObject";
import { IDynamicCollider, IJoint } from "@galacean/engine-design";
import { Matrix, Quaternion, Vector3 } from "@galacean/engine-math";
import { Component } from "../../Component";
import { DependentMode, dependentComponents } from "../../ComponentsDependencies";
import { Entity } from "../../Entity";
import type { Scene } from "../../Scene";
import { TransformModifyFlags } from "../../Transform";
import { ignoreClone } from "../../clone/CloneDecorators";
import type { ICloneHook } from "../../clone/ICloneHook";
import { Rigidbody } from "../Rigidbody";

/**
 * A constraint between the Entity's Rigidbody and another body or the world.
 * @decorator `@dependentComponents(Rigidbody, DependentMode.AutoAdd)`
 */
@dependentComponents(Rigidbody, DependentMode.AutoAdd)
export abstract class Joint extends Component implements ICloneHook<Joint> {
  private static _tempVector3 = new Vector3();
  private static _tempQuat = new Quaternion();
  private static _tempMatrix = new Matrix();

  private _bodyInfo = new JointBodyInfo();
  private _connectedBodyInfo = new JointBodyInfo();
  private _connectedBody: Rigidbody | null = null;
  @ignoreClone
  protected _nativeJoint: IJoint | null = null;
  private _force = Infinity;
  private _torque = Infinity;
  private _automaticConnectedAnchor = true;
  private _connectedAnchorAuthored = false;
  @ignoreClone
  private _calculatedConnectedAnchor: Vector3 | null = null;
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
      if (this._nativeJoint) preBody?._wakeNative();
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
    if (value !== anchor) {
      anchor.copyFrom(value);
    }
  }

  /**
   * The anchor in the connected body's local space, or in world space when {@link connectedBody} is null.
   * @remarks Reads the authored value if one was set, otherwise the last calculated anchor.
   * Simulation uses the calculated anchor while {@link automaticConnectedAnchor} is enabled.
   */
  get connectedAnchor(): Vector3 {
    return this._connectedBodyInfo.anchor;
  }

  set connectedAnchor(value: Vector3) {
    const anchor = this.connectedAnchor;
    if (value !== anchor) {
      anchor.copyFrom(value);
    }
  }

  /**
   * Whether the connected anchor automatically matches the world position of {@link anchor}.
   * @remarks Disabling uses the authored connected anchor if available, or keeps the calculated one.
   */
  get automaticConnectedAnchor(): boolean {
    return this._automaticConnectedAnchor;
  }

  set automaticConnectedAnchor(value: boolean) {
    if (value) {
      this._automaticConnectedAnchor = true;
      this._calculateConnectedAnchor();
    } else if (this._automaticConnectedAnchor) {
      this._automaticConnectedAnchor = false;
      if (this._connectedAnchorAuthored) this._updateActualAnchor(AnchorOwner.Connected);
    }
  }

  /**
   * The scale to apply to the mass of the connected body for resolving this constraint.
   * @throws When the value is not positive and finite.
   */
  get connectedMassScale(): number {
    return this._connectedBodyInfo.massScale;
  }

  set connectedMassScale(value: number) {
    if (!(value > 0 && Number.isFinite(value))) {
      throw new Error("Joint connectedMassScale must be positive and finite.");
    }
    if (value !== this._connectedBodyInfo.massScale) {
      this._connectedBodyInfo.massScale = value;
      if (this._nativeJoint) {
        this._nativeJoint.setConnectedMassScale(value);
        this._wakeBodies();
      }
    }
  }

  /**
   * The scale to apply to the mass of this body for resolving this constraint.
   * @throws When the value is not positive and finite.
   */
  get massScale(): number {
    return this._bodyInfo.massScale;
  }

  set massScale(value: number) {
    if (!(value > 0 && Number.isFinite(value))) {
      throw new Error("Joint massScale must be positive and finite.");
    }
    if (value !== this._bodyInfo.massScale) {
      this._bodyInfo.massScale = value;
      if (this._nativeJoint) {
        this._nativeJoint.setMassScale(value);
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
      this._nativeJoint?.setConnectedInertiaScale(value);
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
      this._nativeJoint?.setInertiaScale(value);
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
      this._nativeJoint?.setBreakForce(value);
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
      this._nativeJoint?.setBreakTorque(value);
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
    // @ts-ignore
    entity._updateFlagManager.addListener(this._onSelfTransformChanged);
  }

  /**
   * @internal
   */
  override _onEnableInScene(): void {
    this._registeredScene = this.scene ?? null;
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
    const targetAnchor = target._bodyInfo.anchor;
    targetAnchor._onValueChanged = null;
    targetAnchor.copyFrom(this._bodyInfo.anchor);
    targetAnchor._onValueChanged = target._onAnchorChanged;

    const targetConnectedAnchor = target._connectedBodyInfo.anchor;
    targetConnectedAnchor._onValueChanged = null;
    targetConnectedAnchor.copyFrom(this._connectedBodyInfo.anchor);
    targetConnectedAnchor._onValueChanged = target._handleConnectedAnchorChanged;

    const connectedBody = target._connectedBody;
    connectedBody?.entity._updateFlagManager.addListener(target._onConnectedTransformChanged);
    connectedBody?._attachJoint(target);
  }

  /**
   * Clears an authored connection when its target is destroyed.
   * @internal
   */
  _onBodyDestroyed(body: Rigidbody): void {
    if (this._connectedBody === body) this.connectedBody = null;
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
      nativeJoint.setConnectedCollider(connectedActor);
      this._syncConnectedFrame();
    } else {
      const joint = (this._nativeJoint = this._createJoint(bodyActor));
      if (connectedActor) joint.setConnectedCollider(connectedActor);
      this._syncNative();
    }
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

  protected abstract _createJoint(actor: IDynamicCollider): IJoint;

  /** @internal */
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
    this._updateActualAnchor(AnchorOwner.Self);
    this._syncConnectedFrame();
    nativeJoint.setConnectedMassScale(this._connectedBodyInfo.massScale);
    nativeJoint.setConnectedInertiaScale(this._connectedBodyInfo.inertiaScale);
    nativeJoint.setMassScale(this._bodyInfo.massScale);
    nativeJoint.setInertiaScale(this._bodyInfo.inertiaScale);
    nativeJoint.setBreakForce(this._force);
    nativeJoint.setBreakTorque(this._torque);
  }

  private _syncConnectedFrame(): void {
    if (this._automaticConnectedAnchor) {
      this._calculateConnectedAnchor();
    } else {
      this._updateActualAnchor(AnchorOwner.Connected);
    }
    this._updateRotation();
  }

  private _calculateConnectedAnchor(): void {
    if (!this._nativeJoint) return;
    const bodyInfo = this._bodyInfo;
    const calculated = (this._calculatedConnectedAnchor ||= new Vector3());
    const connectedBody = this._connectedBody;
    const selfMatrix = this.entity.transform.worldMatrix;

    if (connectedBody) {
      const connectedMatrix = connectedBody.entity.transform.worldMatrix;
      const tempVector3 = Joint._tempVector3;
      const tempMatrix = Joint._tempMatrix;
      Vector3.transformCoordinate(bodyInfo.anchor, selfMatrix, tempVector3);
      Matrix.invert(connectedMatrix, tempMatrix);
      Vector3.transformCoordinate(tempVector3, tempMatrix, calculated);
    } else {
      Vector3.transformCoordinate(bodyInfo.anchor, selfMatrix, calculated);
    }
    if (!this._connectedAnchorAuthored) {
      const anchor = this._connectedBodyInfo.anchor;
      anchor._onValueChanged = null;
      anchor.copyFrom(calculated);
      anchor._onValueChanged = this._handleConnectedAnchorChanged;
    }
    this._updateActualAnchor(AnchorOwner.Connected);
  }

  @ignoreClone
  private _onAnchorChanged(): void {
    this._updateActualAnchor(AnchorOwner.Self);
    this._automaticConnectedAnchor && this._calculateConnectedAnchor();
  }

  @ignoreClone
  private _handleConnectedAnchorChanged(): void {
    this._connectedAnchorAuthored = true;
    if (!this._automaticConnectedAnchor) this._updateActualAnchor(AnchorOwner.Connected);
  }

  @ignoreClone
  private _onSelfTransformChanged(type: TransformModifyFlags): void {
    if (type & TransformModifyFlags.WorldScale) {
      this._updateActualAnchor(AnchorOwner.Self);
    }
  }

  @ignoreClone
  private _onConnectedTransformChanged(type: TransformModifyFlags): void {
    if (type & TransformModifyFlags.WorldScale) {
      this._updateActualAnchor(AnchorOwner.Connected);
    }
  }

  private _updateRotation(): void {
    let rotation = this.entity.transform.worldRotationQuaternion;
    const connectedBody = this._connectedBody;
    if (connectedBody) {
      const relativeRotation = Joint._tempQuat;
      Quaternion.invert(connectedBody.entity.transform.worldRotationQuaternion, relativeRotation);
      Quaternion.multiply(relativeRotation, rotation, relativeRotation);
      rotation = relativeRotation;
    }
    this._nativeJoint?.setRotation(rotation);
  }

  private _updateActualAnchor(flag: AnchorOwner): void {
    const nativeJoint = this._nativeJoint;
    if (!nativeJoint) return;

    if (flag & AnchorOwner.Self) {
      const worldScale = this.entity.transform.lossyWorldScale;
      const selfBodyInfo = this._bodyInfo;
      Vector3.multiply(selfBodyInfo.anchor, worldScale, selfBodyInfo.actualAnchor);
      nativeJoint.setAnchor(selfBodyInfo.actualAnchor);
    }
    if (flag & AnchorOwner.Connected) {
      const connectedBodyInfo = this._connectedBodyInfo;
      const anchor = (this._automaticConnectedAnchor && this._calculatedConnectedAnchor) || connectedBodyInfo.anchor;
      const connectedBody = this._connectedBody;
      if (connectedBody) {
        const worldScale = connectedBody.entity.transform.lossyWorldScale;
        Vector3.multiply(anchor, worldScale, connectedBodyInfo.actualAnchor);
      } else {
        connectedBodyInfo.actualAnchor.copyFrom(anchor);
      }
      nativeJoint.setConnectedAnchor(connectedBodyInfo.actualAnchor);
    }
    this._wakeBodies();
  }

  protected _wakeBodies(): void {
    this.entity.getComponent(Rigidbody)?._wakeNative();
    const body = this._connectedBody;
    if (body && body.scene === this.scene) body._wakeNative();
  }

  /** @internal Wake the other endpoint after the constraint enters or leaves simulation. */
  _wakeOtherBody(body: Rigidbody): void {
    if (this._nativeJoint) {
      const connectedBody = this._connectedBody;
      (body === connectedBody ? this.entity.getComponent(Rigidbody) : connectedBody)?._wakeNative();
    }
  }
}

/**
 * @internal
 */
enum AnchorOwner {
  Self = 0x1,
  Connected = 0x2
}

/**
 * @internal
 */
class JointBodyInfo extends DataObject {
  @ignoreClone
  anchor = new Vector3();
  @ignoreClone
  actualAnchor = new Vector3();
  massScale: number = 1;
  inertiaScale: number = 1;
}
