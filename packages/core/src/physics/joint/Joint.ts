import { DataObject } from "../../base/DataObject";
import { IJoint } from "@galacean/engine-design";
import { Matrix, Quaternion, Vector3 } from "@galacean/engine-math";
import { Component } from "../../Component";
import { DependentMode, dependentComponents } from "../../ComponentsDependencies";
import { Entity } from "../../Entity";
import { TransformModifyFlags } from "../../Transform";
import { ignoreClone } from "../../clone/CloneDecorators";
import { Rigidbody } from "../Rigidbody";

/**
 * A base class providing common functionality for joints.
 * @decorator `@dependentComponents(Rigidbody, DependentMode.AutoAdd)`
 */
@dependentComponents(Rigidbody, DependentMode.AutoAdd)
export abstract class Joint extends Component {
  private static _tempVector3 = new Vector3();
  private static _tempQuat = new Quaternion();
  private static _tempMatrix = new Matrix();

  protected _bodyInfo = new JointBodyInfo();
  protected _connectedBodyInfo = new JointBodyInfo();
  @ignoreClone
  protected _nativeJoint: IJoint | null;
  private _force = Infinity;
  private _torque = Infinity;
  private _automaticConnectedAnchor = true;

  /**
   * The connected Rigidbody, or null to connect to a fixed point in world space.
   */
  get connectedBody(): Rigidbody | null {
    return this._connectedBodyInfo.body;
  }

  set connectedBody(value: Rigidbody | null) {
    const preBody = this._connectedBodyInfo.body;
    if (preBody !== value) {
      preBody?.entity._updateFlagManager.removeListener(this._onConnectedTransformChanged);
      value?.entity._updateFlagManager.addListener(this._onConnectedTransformChanged);
      this._connectedBodyInfo.body = value;
      this._nativeJoint?.setConnectedCollider(value?._getNativeActor() ?? null);
      this._updateRotation();
      if (this._automaticConnectedAnchor) {
        this._calculateConnectedAnchor();
      } else {
        this._updateActualAnchor(AnchorOwner.Connected);
      }
    }
  }

  /**
   * The anchor position.
   */
  get anchor(): Vector3 {
    return this._bodyInfo.anchor;
  }

  set anchor(value: Vector3) {
    const anchor = this._bodyInfo.anchor;
    if (value !== anchor) {
      anchor.copyFrom(value);
      this._updateActualAnchor(AnchorOwner.Self);
      this._automaticConnectedAnchor && this._calculateConnectedAnchor();
    }
  }

  /**
   * The connected anchor position.
   * @remarks If connectedBody is set, this anchor is relative offset, or the anchor is world position.
   * The connectedAnchor is automatically calculated, if you want to set it manually, please set automaticConnectedAnchor to false
   */
  get connectedAnchor(): Vector3 {
    return this._connectedBodyInfo.anchor;
  }

  set connectedAnchor(value: Vector3) {
    const connectedAnchor = this._connectedBodyInfo.anchor;
    if (value !== connectedAnchor) {
      connectedAnchor.copyFrom(value);
    }
  }

  /**
   * Whether or not to calculate the connectedAnchor automatically, if true, the connectedAnchor will be calculated automatically to match the global position of the anchor property.
   */
  get automaticConnectedAnchor(): boolean {
    return this._automaticConnectedAnchor;
  }

  set automaticConnectedAnchor(value: boolean) {
    this._automaticConnectedAnchor = value;
    value && this._calculateConnectedAnchor();
  }

  /**
   *  The scale to apply to the mass of the connected body for resolving this constraint.
   */
  get connectedMassScale(): number {
    return this._connectedBodyInfo.massScale;
  }

  set connectedMassScale(value: number) {
    if (value !== this._connectedBodyInfo.massScale) {
      this._connectedBodyInfo.massScale = value;
      this._nativeJoint?.setConnectedMassScale(value);
    }
  }

  /**
   * The scale to apply to the mass of this body for resolving this constraint.
   */
  get massScale(): number {
    return this._bodyInfo.massScale;
  }

  set massScale(value: number) {
    if (value !== this._bodyInfo.massScale) {
      this._bodyInfo.massScale = value;
      this._nativeJoint?.setMassScale(value);
    }
  }

  /**
   * The scale to apply to the inertia of the connected body for resolving this constraint.
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
   * The scale to apply to the inertia of this body for resolving this constraint.
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
    //@ts-ignore
    this._bodyInfo.anchor._onValueChanged = this._updateActualAnchor.bind(this, AnchorOwner.Self);
    this._handleConnectedAnchorChanged = this._handleConnectedAnchorChanged.bind(this);
    //@ts-ignore
    this._connectedBodyInfo.anchor._onValueChanged = this._handleConnectedAnchorChanged.bind(this);

    this._onSelfTransformChanged = this._onSelfTransformChanged.bind(this);
    this._onConnectedTransformChanged = this._onConnectedTransformChanged.bind(this);
    // @ts-ignore
    entity._updateFlagManager.addListener(this._onSelfTransformChanged);
  }

  /**
   * @internal
   */
  override _onEnableInScene(): void {
    this._createJoint();
    this._syncNative();
    this._updateRotation();
  }

  /**
   * @internal
   */
  override _onDisableInScene(): void {
    this._nativeJoint!.destroy();
    this._nativeJoint = null;
  }

  protected abstract _createJoint(): void;

  protected _syncNative(): void {
    if (this._nativeJoint) {
      this._nativeJoint.setConnectedCollider(this._connectedBodyInfo.body?._getNativeActor() ?? null);
      this._updateActualAnchor(AnchorOwner.Self);
      if (this._automaticConnectedAnchor) {
        this._calculateConnectedAnchor();
      } else {
        this._updateActualAnchor(AnchorOwner.Connected);
      }
      this._nativeJoint.setConnectedMassScale(this._connectedBodyInfo.massScale);
      this._nativeJoint.setConnectedInertiaScale(this._connectedBodyInfo.inertiaScale);
      this._nativeJoint.setMassScale(this._bodyInfo.massScale);
      this._nativeJoint.setInertiaScale(this._bodyInfo.inertiaScale);
      this._nativeJoint.setBreakForce(this._force);
      this._nativeJoint.setBreakTorque(this._torque);
    }
  }

  private _calculateConnectedAnchor(): void {
    const bodyInfo = this._bodyInfo;
    const connectedBodyInfo = this._connectedBodyInfo;
    const connectedAnchor = connectedBodyInfo.anchor;
    const connectedActualAnchor = connectedBodyInfo.actualAnchor;
    const connectedBody = connectedBodyInfo.body;

    // @ts-ignore
    connectedAnchor._onValueChanged = null;
    if (connectedBody) {
      const tempVector3 = Joint._tempVector3;
      const tempMatrix = Joint._tempMatrix;
      Vector3.transformCoordinate(bodyInfo.anchor, this.entity.transform.worldMatrix, tempVector3);
      Matrix.invert(connectedBody.entity.transform.worldMatrix, tempMatrix);
      Vector3.transformCoordinate(tempVector3, tempMatrix, connectedAnchor);
    } else {
      Vector3.transformCoordinate(bodyInfo.anchor, this.entity.transform.worldMatrix, connectedActualAnchor);
      connectedAnchor.copyFrom(connectedActualAnchor);
    }
    // @ts-ignore
    connectedAnchor._onValueChanged = this._handleConnectedAnchorChanged;
    this._updateActualAnchor(AnchorOwner.Connected);
  }

  @ignoreClone
  private _handleConnectedAnchorChanged(): void {
    if (this._automaticConnectedAnchor) {
      console.warn("Cannot set connectedAnchor when automaticConnectedAnchor is true.");
    } else {
      this._updateActualAnchor(AnchorOwner.Connected);
    }
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
    const quat = Joint._tempQuat;
    const connectedBodyInfo = this._connectedBodyInfo;
    const connectedBody = connectedBodyInfo.body;
    if (connectedBody) {
      Quaternion.invert(connectedBody.entity.transform.worldRotationQuaternion, quat);
    }
    Quaternion.multiply(quat, this.entity.transform.worldRotationQuaternion, quat);
    this._nativeJoint?.setRotation(quat);
  }

  private _updateActualAnchor(flag: AnchorOwner): void {
    if (flag & AnchorOwner.Self) {
      const worldScale = this.entity.transform.lossyWorldScale;
      const selfBodyInfo = this._bodyInfo;
      Vector3.multiply(selfBodyInfo.anchor, worldScale, selfBodyInfo.actualAnchor);
      this._nativeJoint?.setAnchor(selfBodyInfo.actualAnchor);
    }
    if (flag & AnchorOwner.Connected) {
      const connectedBodyInfo = this._connectedBodyInfo;
      const connectedBody = connectedBodyInfo.body;
      if (connectedBody) {
        const worldScale = connectedBody.entity.transform.lossyWorldScale;
        Vector3.multiply(connectedBodyInfo.anchor, worldScale, connectedBodyInfo.actualAnchor);
      } else {
        connectedBodyInfo.actualAnchor.copyFrom(connectedBodyInfo.anchor);
      }
      this._nativeJoint?.setConnectedAnchor(connectedBodyInfo.actualAnchor);
    }
  }
}

/**
 * @internal
 */
enum AnchorOwner {
  Self = 0x1,
  Connected = 0x2,
  Both = 0x3
}

/**
 * @internal
 */
class JointBodyInfo extends DataObject {
  body: Rigidbody | null = null;
  anchor = new Vector3();
  actualAnchor = new Vector3();
  massScale: number = 1;
  inertiaScale: number = 1;
}
