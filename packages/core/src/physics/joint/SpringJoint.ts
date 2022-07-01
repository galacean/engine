import { Joint } from "./Joint";
import { ISpringJoint } from "@oasis-engine/design";
import { Collider } from "../Collider";
import { PhysicsManager } from "../PhysicsManager";
import { SpringJointFlag } from "../enums";
import { DynamicCollider } from "../DynamicCollider";
import { dependentComponents } from "../../ComponentsDependencies";

/**
 * A joint that maintains an upper or lower bound (or both) on the distance between two points on different objects.
 * @decorator `@dependentComponents(DynamicCollider)`
 */
@dependentComponents(DynamicCollider)
export class SpringJoint extends Joint {
  private _minDistance: number = 0;
  private _maxDistance: number = 0;
  private _tolerance: number = 0;
  private _stiffness: number = 0;
  private _damping: number = 0;

  /**
   * The minimum distance.
   */
  get minDistance(): number {
    return this._minDistance;
  }

  set minDistance(value: number) {
    this._minDistance = value;
    (<ISpringJoint>this._nativeJoint).setMinDistance(value);
  }

  /**
   * The maximum distance.
   */
  get maxDistance(): number {
    return this._maxDistance;
  }

  set maxDistance(value: number) {
    this._maxDistance = value;
    (<ISpringJoint>this._nativeJoint).setMaxDistance(value);
  }

  /**
   * The distance beyond the allowed range at which the joint becomes active.
   */
  get tolerance(): number {
    return this._tolerance;
  }

  set tolerance(value: number) {
    this._tolerance = value;
    (<ISpringJoint>this._nativeJoint).setTolerance(value);
  }

  /**
   * The spring strength of the joint.
   */
  get stiffness(): number {
    return this._stiffness;
  }

  set stiffness(value: number) {
    this._stiffness = value;
    (<ISpringJoint>this._nativeJoint).setStiffness(value);
  }

  /**
   * The degree of damping of the joint spring of the joint.
   */
  get damping(): number {
    return this._damping;
  }

  set damping(value: number) {
    this._damping = value;
    (<ISpringJoint>this._nativeJoint).setDamping(value);
  }

  /**
   * The connected collider.
   */
  get connectedCollider(): DynamicCollider {
    return this.collider0;
  }

  set connectedCollider(value: DynamicCollider) {
    this.collider0 = value;
  }

  /**
   * Set a single flag specific to a Distance Joint to true or false.
   * @param flag The flag to set or clear.
   * @param value the value to which to set the flag
   */
  setDistanceJointFlag(flag: SpringJointFlag, value: boolean): void {
    (<ISpringJoint>this._nativeJoint).setDistanceJointFlag(flag, value);
  }

  /**
   * @override
   * @internal
   */
  _onAwake() {
    const jointCollider0 = this._jointCollider0;
    const jointCollider1 = this._jointCollider1;
    jointCollider0.collider = null;
    jointCollider1.collider = this.entity.getComponent(DynamicCollider);
    this._nativeJoint = PhysicsManager._nativePhysics.createSpringJoint(
      null,
      jointCollider0.localPosition,
      jointCollider0.localRotation,
      jointCollider1.collider._nativeCollider,
      jointCollider1.localPosition,
      jointCollider1.localRotation
    );
  }
}
