import { DataObject } from "../../base/DataObject";
import { IDynamicCollider, IJoint } from "@galacean/engine-design";
import { Matrix, Quaternion, Vector3 } from "@galacean/engine-math";
import { Component } from "../../Component";
import { DependentMode, dependentComponents } from "../../ComponentsDependencies";
import { Entity } from "../../Entity";
import { Scene } from "../../Scene";
import { TransformModifyFlags } from "../../Transform";
import { ignoreClone } from "../../clone/CloneDecorators";
import type { ICloneHook } from "../../clone/ICloneHook";
import { Rigidbody } from "../Rigidbody";

/**
 * A base class providing common functionality for joints.
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
  protected _nativeJoint: IJoint | null;
  private _force = Infinity;
  private _torque = Infinity;
  private _automaticConnectedAnchor = true;
  private _connectedAnchorAuthored = false;
  @ignoreClone
  private _calculatedConnectedAnchor: Vector3 | null = null;

  /**
   * The connected Rigidbody, or null to connect to a fixed point in world space.
   */
  get connectedBody(): Rigidbody | null {
    return this._getConnectedBody();
  }

  set connectedBody(value: Rigidbody | null) {
    if (value) {
      if (value.destroyed) {
        value = null;
      } else if (value.engine !== this.engine) {
        throw new Error("Joint: connectedBody belongs to another engine.");
      } else if (value === this.entity.getComponent(Rigidbody)) {
        console.error("Joint: cannot connect a Rigidbody to itself.");
        return;
      } else if (!Joint._isSameScene(this.scene, value.scene)) {
        console.error("Joint: connectedBody belongs to another scene.");
        return;
      }
    }
    const preBody = this._connectedBody;
    if (preBody !== value) {
      preBody?.entity._updateFlagManager.removeListener(this._onConnectedTransformChanged);
      preBody?._detachConnectedJoint(this);
      value?.entity._updateFlagManager.addListener(this._onConnectedTransformChanged);
      value?._attachConnectedJoint(this);
      this._connectedBody = value;
      const samePhysicalScene = value && (!value.scene || !this.scene || value.scene === this.scene);
      this._nativeJoint?.setConnectedCollider(samePhysicalScene ? Joint._getBodyActor(value) : null);
      this._updateRotation();
      if (this._automaticConnectedAnchor) {
        this._calculateConnectedAnchor();
      } else {
        this._updateActualAnchor(AnchorOwner.Connected);
      }
      if (this._nativeJoint) {
        Joint._wakeBody(preBody);
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
    }
  }

  /**
   * The connected anchor position.
   * @remarks Reads the authored value once written, otherwise the last effective anchor.
   * Simulation uses the calculated anchor while `automaticConnectedAnchor` is true.
   * The value is local to the connected body when set, otherwise it is in world space.
   */
  get connectedAnchor(): Vector3 {
    const anchor = this._connectedBodyInfo.anchor;
    if (!this._connectedAnchorAuthored) {
      // A retained reference can still be edited after switching to automatic mode.
      this._calculatedConnectedAnchor ||= anchor.clone();
    }
    return anchor;
  }

  set connectedAnchor(value: Vector3) {
    const anchor = this.connectedAnchor;
    if (value !== anchor) {
      anchor.copyFrom(value);
    }
  }

  /**
   * Whether to calculate the connected anchor automatically to match the world position of `anchor`.
   * @remarks Disabling uses the authored anchor, or preserves the calculated anchor if none was authored.
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
      this._nativeJoint?.setConnectedMassScale(value);
      if (this._nativeJoint) {
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
      this._nativeJoint?.setMassScale(value);
      if (this._nativeJoint) {
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
    //@ts-ignore
    this._bodyInfo.anchor._onValueChanged = this._onAnchorChanged;
    this._handleConnectedAnchorChanged = this._handleConnectedAnchorChanged.bind(this);
    //@ts-ignore
    this._connectedBodyInfo.anchor._onValueChanged = this._handleConnectedAnchorChanged;

    this._onSelfTransformChanged = this._onSelfTransformChanged.bind(this);
    this._onConnectedTransformChanged = this._onConnectedTransformChanged.bind(this);
    // @ts-ignore
    entity._updateFlagManager.addListener(this._onSelfTransformChanged);
  }

  /**
   * @internal
   */
  override _onSceneChanged(scene: Scene): void {
    const body = this._connectedBody;
    if (body && !body.destroyed && !Joint._isSameScene(scene, body.scene)) {
      this._onConnectedBodyCrossScene();
    }
  }

  /**
   * @internal
   */
  override _onEnableInScene(): void {
    this._nativeJoint = this._createJoint(this.entity.getComponent(Rigidbody)!._getNativeActor());
    this._syncNative();
    this._updateRotation();
  }

  /**
   * @internal
   */
  override _onDisableInScene(): void {
    if (this._nativeJoint) {
      this._nativeJoint.destroy();
      this._nativeJoint = null;
      this._wakeBodies();
    }
  }

  /**
   * @internal
   */
  _onClone(target: Joint): void {
    const targetAnchor = target._bodyInfo.anchor;
    //@ts-ignore
    targetAnchor._onValueChanged = null;
    targetAnchor.copyFrom(this._bodyInfo.anchor);
    //@ts-ignore
    targetAnchor._onValueChanged = target._onAnchorChanged;

    const targetConnectedAnchor = target._connectedBodyInfo.anchor;
    //@ts-ignore
    targetConnectedAnchor._onValueChanged = null;
    targetConnectedAnchor.copyFrom(this._connectedBodyInfo.anchor);
    //@ts-ignore
    targetConnectedAnchor._onValueChanged = target._handleConnectedAnchorChanged;

    const connectedBody = target._getConnectedBody();
    connectedBody?.entity._updateFlagManager.addListener(target._onConnectedTransformChanged);
    connectedBody?._attachConnectedJoint(target);
  }

  /**
   * @internal
   * Detach from a connected Rigidbody before its native actor is released.
   */
  _onConnectedBodyDestroyed(): void {
    this._detachConnectedBody(false);
  }

  /**
   * @internal
   * Detach from a connected Rigidbody before its native actor enters a different scene.
   */
  _onConnectedBodyCrossScene(): void {
    console.error("Joint: connectedBody belongs to another scene.");
    this._detachConnectedBody(true);
  }

  /**
   * @internal
   * Temporarily clear the native connected actor while a scene merge moves the connected body between scenes.
   */
  _detachNativeConnectedBody(): void {
    this._nativeJoint?.setConnectedCollider(null);
  }

  /**
   * @internal
   * Re-attach the native connected actor once the connected body arrives in this joint's scene.
   */
  _syncNativeConnectedBody(): void {
    if (this._nativeJoint) {
      const body = this._getConnectedBody();
      if (body && (!body.scene || body.scene === this.scene)) {
        this._nativeJoint.setConnectedCollider(Joint._getBodyActor(body));
        this._updateRotation();
        if (this._automaticConnectedAnchor) {
          this._calculateConnectedAnchor();
        } else {
          this._updateActualAnchor(AnchorOwner.Connected);
        }
      }
    }
  }

  private _detachConnectedBody(detachFromBody: boolean): void {
    const body = this._connectedBody;
    if (!body) {
      return;
    }
    body.entity._updateFlagManager.removeListener(this._onConnectedTransformChanged);
    if (detachFromBody) {
      body._detachConnectedJoint(this);
    }
    this._connectedBody = null;
    this._nativeJoint?.setConnectedCollider(null);
    this._updateRotation();
    if (this._automaticConnectedAnchor) {
      this._calculateConnectedAnchor();
    } else {
      this._updateActualAnchor(AnchorOwner.Connected);
    }
  }

  protected override _onDestroy(): void {
    super._onDestroy();
    this.entity._updateFlagManager.removeListener(this._onSelfTransformChanged);
    const connectedBody = this._connectedBody;
    if (connectedBody) {
      connectedBody.entity._updateFlagManager.removeListener(this._onConnectedTransformChanged);
      connectedBody._detachConnectedJoint(this);
      this._connectedBody = null;
    }
  }

  protected abstract _createJoint(actor: IDynamicCollider): IJoint;

  /**
   * A destroyed Rigidbody must not recreate its native actor through a joint that still references it.
   */
  private static _getBodyActor(body: Rigidbody | null): IDynamicCollider | null {
    return body && !body.destroyed ? body._getNativeActor() : null;
  }

  private static _isSameScene(a: Scene | null | undefined, b: Scene | null | undefined): boolean {
    return !a || !b || a === b || a._mergingInto === b || b._mergingInto === a;
  }

  private _getConnectedBody(): Rigidbody | null {
    const body = this._connectedBody;
    if (body && (body.destroyed || !Joint._isSameScene(this.scene, body.scene))) {
      body.entity._updateFlagManager.removeListener(this._onConnectedTransformChanged);
      body._detachConnectedJoint(this);
      this._connectedBody = null;
      return null;
    }
    return body;
  }

  protected _syncNative(): void {
    if (this._nativeJoint) {
      const connectedBody = this._getConnectedBody();
      // Defer native attachment while mergeScenes has not yet moved connectedBody into this.scene
      const samePhysicalScene = connectedBody && (!connectedBody.scene || connectedBody.scene === this.scene);
      this._nativeJoint.setConnectedCollider(samePhysicalScene ? Joint._getBodyActor(connectedBody) : null);
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
    if (!this._nativeJoint) return;
    const bodyInfo = this._bodyInfo;
    const authored = this._connectedAnchorAuthored;
    const connectedAnchor = authored
      ? (this._calculatedConnectedAnchor ||= new Vector3())
      : this._connectedBodyInfo.anchor;
    const connectedBody = this._getConnectedBody();

    // @ts-ignore
    connectedAnchor._onValueChanged = null;
    if (connectedBody) {
      const tempVector3 = Joint._tempVector3;
      const tempMatrix = Joint._tempMatrix;
      Vector3.transformCoordinate(bodyInfo.anchor, this.entity.transform.worldMatrix, tempVector3);
      Matrix.invert(connectedBody.entity.transform.worldMatrix, tempMatrix);
      Vector3.transformCoordinate(tempVector3, tempMatrix, connectedAnchor);
    } else {
      Vector3.transformCoordinate(bodyInfo.anchor, this.entity.transform.worldMatrix, connectedAnchor);
    }
    if (!authored) {
      // @ts-ignore
      connectedAnchor._onValueChanged = this._handleConnectedAnchorChanged;
      this._calculatedConnectedAnchor?.copyFrom(connectedAnchor);
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
    const connectedBody = this._getConnectedBody();
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
      const connectedBody = this._getConnectedBody();
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
    Joint._wakeBody(this.entity.getComponent(Rigidbody));
    Joint._wakeBody(this._connectedBody);
  }

  private static _wakeBody(body: Rigidbody | null | undefined): void {
    if (body && !body.destroyed && body._index !== -1 && !body.isKinematic) {
      body.wakeUp();
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
