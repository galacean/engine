import { IJoint } from "@galacean/engine-design";
import { Vector3 } from "@galacean/engine-math";
import { deepClone, ignoreClone } from "../../clone/CloneManager";
import { Component } from "../../Component";
import { dependentComponents, DependentMode } from "../../ComponentsDependencies";
import { Entity } from "../../Entity";
import { Collider } from "../Collider";
import { TransformModifyFlags } from "../../Transform";

/**
 * A base class providing common functionality for joints.
 * @decorator `@dependentComponents(Collider, DependentMode.CheckOnly)`
 */
@dependentComponents(Collider, DependentMode.CheckOnly)
export abstract class Joint extends Component {
  private static _tempVector3 = new Vector3();

  @deepClone
  protected _colliderInfo = new JointColliderInfo();
  @deepClone
  protected _connectedColliderInfo = new JointColliderInfo();
  @ignoreClone
  protected _nativeJoint: IJoint;
  private _force = Infinity;
  private _torque = Infinity;
  private _automaticConnectedAnchor = true;

  /**
   * The connected collider.
   */
  get connectedCollider(): Collider {
    return this._connectedColliderInfo.collider;
  }

  set connectedCollider(value: Collider) {
    if (this._connectedColliderInfo.collider !== value) {
      this._connectedColliderInfo.collider?.entity._updateFlagManager.removeListener(this._onConnectedTransformChanged);
      value?.entity._updateFlagManager.addListener(this._onConnectedTransformChanged);
      this._connectedColliderInfo.collider = value;
      this._nativeJoint?.setConnectedCollider(value._nativeCollider);
      if (this._automaticConnectedAnchor) {
        this._calculateConnectedAnchor();
      } else {
        this._updateActualAnchor(AnchorOwner.Connected);
      }
    }
  }

  /**
   * The connected anchor position.
   * @remarks If connectedCollider is set, this anchor is relative offset, or the anchor is world position.
   */
  get anchor(): Vector3 {
    return this._colliderInfo.anchor;
  }

  set anchor(value: Vector3) {
    const anchor = this._colliderInfo.anchor;
    if (value !== anchor) {
      anchor.copyFrom(value);
      this._updateActualAnchor(AnchorOwner.Self);
      this._automaticConnectedAnchor && this._calculateConnectedAnchor();
    }
  }

  /**
   * The connected anchor position.
   * @remarks If connectedCollider is set, this anchor is relative offset, or the anchor is world position.
   */
  get connectedAnchor(): Vector3 {
    return this._connectedColliderInfo.anchor;
  }

  set connectedAnchor(value: Vector3) {
    if (this.automaticConnectedAnchor) {
      console.warn("Cannot set connectedAnchor when automaticConnectedAnchor is true.");
      return;
    }
    const connectedAnchor = this._connectedColliderInfo.anchor;
    if (value !== connectedAnchor) {
      connectedAnchor.copyFrom(value);
      this._updateActualAnchor(AnchorOwner.Connected);
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
   *  The scale to apply to the inverse mass of collider 0 for resolving this constraint.
   */
  get connectedMassScale(): number {
    return this._connectedColliderInfo.massScale;
  }

  set connectedMassScale(value: number) {
    if (value !== this._connectedColliderInfo.massScale) {
      this._connectedColliderInfo.massScale = value;
      this._nativeJoint?.setConnectedMassScale(value);
    }
  }

  /**
   * The scale to apply to the inverse mass of collider 1 for resolving this constraint.
   */
  get massScale(): number {
    return this._colliderInfo.massScale;
  }

  set massScale(value: number) {
    if (value !== this._colliderInfo.massScale) {
      this._colliderInfo.massScale = value;
      this._nativeJoint?.setMassScale(value);
    }
  }

  /**
   * The scale to apply to the inverse inertia of collider0 for resolving this constraint.
   */
  get connectedInertiaScale(): number {
    return this._connectedColliderInfo.inertiaScale;
  }

  set connectedInertiaScale(value: number) {
    if (value !== this._connectedColliderInfo.inertiaScale) {
      this._connectedColliderInfo.inertiaScale = value;
      this._nativeJoint?.setConnectedInertiaScale(value);
    }
  }

  /**
   * The scale to apply to the inverse inertia of collider1 for resolving this constraint.
   */
  get inertiaScale(): number {
    return this._colliderInfo.inertiaScale;
  }

  set inertiaScale(value: number) {
    if (value !== this._colliderInfo.inertiaScale) {
      this._colliderInfo.inertiaScale = value;
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
    this._colliderInfo.anchor._onValueChanged = this._updateActualAnchor.bind(this, AnchorOwner.Self);
    //@ts-ignore
    this._connectedColliderInfo.anchor._onValueChanged = this._updateActualAnchor.bind(this, AnchorOwner.Connected);
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
  }

  /**
   * @internal
   */
  override _onDisableInScene(): void {
    this._nativeJoint.destroy();
    this._nativeJoint = null;
  }

  protected abstract _createJoint(): void;

  protected _syncNative(): void {
    if (this._nativeJoint) {
      this._nativeJoint.setConnectedCollider(this._connectedColliderInfo.collider?._nativeCollider || null);
      this._updateActualAnchor(AnchorOwner.Self);
      if (this._automaticConnectedAnchor) {
        this._calculateConnectedAnchor();
      } else {
        this._updateActualAnchor(AnchorOwner.Connected);
      }
      this._nativeJoint.setConnectedMassScale(this._connectedColliderInfo.massScale);
      this._nativeJoint.setConnectedInertiaScale(this._connectedColliderInfo.inertiaScale);
      this._nativeJoint.setMassScale(this._colliderInfo.massScale);
      this._nativeJoint.setInertiaScale(this._colliderInfo.inertiaScale);
      this._nativeJoint.setBreakForce(this._force);
      this._nativeJoint.setBreakTorque(this._torque);
    }
  }

  private _calculateConnectedAnchor(): void {
    const colliderInfo = this._colliderInfo;
    const connectedColliderInfo = this._connectedColliderInfo;
    const { worldPosition: selfPos } = this.entity.transform;
    const selfActualAnchor = colliderInfo.actualAnchor;
    const connectedAnchor = connectedColliderInfo.anchor;
    const connectedActualAnchor = connectedColliderInfo.actualAnchor;
    const connectedCollider = connectedColliderInfo.collider;

    if (connectedCollider) {
      const { worldPosition: connectedPos, lossyWorldScale: connectedWorldScale } = connectedCollider.entity.transform;
      Vector3.subtract(selfPos, connectedPos, Joint._tempVector3);
      Vector3.add(Joint._tempVector3, selfActualAnchor, connectedActualAnchor);
      Vector3.divide(connectedActualAnchor, connectedWorldScale, connectedAnchor);
    } else {
      Vector3.add(selfPos, selfActualAnchor, connectedActualAnchor);
      connectedAnchor.copyFrom(connectedActualAnchor);
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

  @ignoreClone
  private _updateActualAnchor(flag: AnchorOwner): void {
    if (flag & AnchorOwner.Self) {
      const worldScale = this.entity.transform.lossyWorldScale;
      const selfColliderInfo = this._colliderInfo;
      Vector3.multiply(selfColliderInfo.anchor, worldScale, selfColliderInfo.actualAnchor);
      this._nativeJoint?.setAnchor(selfColliderInfo.actualAnchor);
    }
    if (flag & AnchorOwner.Connected) {
      const connectedColliderInfo = this._connectedColliderInfo;
      const connectedCollider = connectedColliderInfo.collider;
      if (connectedCollider) {
        const worldScale = connectedCollider.entity.transform.lossyWorldScale;
        Vector3.multiply(connectedColliderInfo.anchor, worldScale, connectedColliderInfo.actualAnchor);
      } else {
        connectedColliderInfo.actualAnchor.copyFrom(connectedColliderInfo.anchor);
      }
      this._nativeJoint?.setConnectedAnchor(connectedColliderInfo.actualAnchor);
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
class JointColliderInfo {
  collider: Collider = null;
  @deepClone
  anchor = new Vector3();
  @deepClone
  actualAnchor = new Vector3();
  massScale: number = 1;
  inertiaScale: number = 1;
}
