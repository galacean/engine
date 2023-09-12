import { ISpringJoint } from "@galacean/engine-design";
import { Vector3 } from "@galacean/engine-math";
import { Collider } from "../Collider";
import { PhysicsManager } from "../PhysicsManager";
import { Joint } from "./Joint";

/**
 * A joint that maintains an upper or lower bound (or both) on the distance between two points on different objects.
 */
export class SpringJoint extends Joint {
  private _minDistance: number = 0;
  private _maxDistance: number = 0;
  private _tolerance: number = 0.25;
  private _stiffness: number = 0;
  private _damping: number = 0;

  /**
   * The swing offset.
   */
  get swingOffset(): Vector3 {
    return this._collider.localPosition;
  }

  set swingOffset(value: Vector3) {
    const swingOffset = this._collider.localPosition;
    if (value !== swingOffset) {
      swingOffset.copyFrom(value);
    }
    (<ISpringJoint>this._nativeJoint).setSwingOffset(value);
  }

  /**
   * The minimum distance.
   */
  get minDistance(): number {
    return this._minDistance;
  }

  set minDistance(value: number) {
    if (this._minDistance !== value) {
      this._minDistance = value;
      (<ISpringJoint>this._nativeJoint).setMinDistance(value);
    }
  }

  /**
   * The maximum distance.
   */
  get maxDistance(): number {
    return this._maxDistance;
  }

  set maxDistance(value: number) {
    if (this._maxDistance !== value) {
      this._maxDistance = value;
      (<ISpringJoint>this._nativeJoint).setMaxDistance(value);
    }
  }

  /**
   * The distance beyond the allowed range at which the joint becomes active.
   */
  get tolerance(): number {
    return this._tolerance;
  }

  set tolerance(value: number) {
    if (this._tolerance !== value) {
      this._tolerance = value;
      (<ISpringJoint>this._nativeJoint).setTolerance(value);
    }
  }

  /**
   * The spring strength of the joint.
   */
  get stiffness(): number {
    return this._stiffness;
  }

  set stiffness(value: number) {
    if (this._stiffness !== value) {
      this._stiffness = value;
      (<ISpringJoint>this._nativeJoint).setStiffness(value);
    }
  }

  /**
   * The degree of damping of the joint spring of the joint.
   */
  get damping(): number {
    return this._damping;
  }

  set damping(value: number) {
    if (this._damping !== value) {
      this._damping = value;
      (<ISpringJoint>this._nativeJoint).setDamping(value);
    }
  }

  /**
   * @internal
   */
  override _onAwake() {
    const collider = this._collider;
    collider.localPosition = new Vector3();
    collider.collider = this.entity.getComponent(Collider);
    this._nativeJoint = PhysicsManager._nativePhysics.createSpringJoint(collider.collider._nativeCollider);
  }
}
