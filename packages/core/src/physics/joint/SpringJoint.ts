import { IDynamicActor, ISpringJoint } from "@galacean/engine-design";
import { Engine } from "../../Engine";
import { Joint } from "./Joint";

/**
 * A joint that maintains an upper or lower bound (or both) on the distance between two points on different objects.
 */
export class SpringJoint extends Joint {
  protected declare _nativeJoint: ISpringJoint | null;

  private _minDistance: number = 0;
  private _maxDistance: number = 0;
  private _tolerance: number = 0.25;
  private _stiffness: number = 0;
  private _damping: number = 0;

  /**
   * The minimum distance.
   */
  get minDistance(): number {
    return this._minDistance;
  }

  set minDistance(value: number) {
    if (this._minDistance !== value) {
      this._minDistance = value;
      const nativeJoint = this._nativeJoint;
      if (nativeJoint) {
        nativeJoint.setMinDistance(value);
        this._wakeBodies();
      }
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
      const nativeJoint = this._nativeJoint;
      if (nativeJoint) {
        nativeJoint.setMaxDistance(value);
        this._wakeBodies();
      }
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
      const nativeJoint = this._nativeJoint;
      if (nativeJoint) {
        nativeJoint.setTolerance(value);
        this._wakeBodies();
      }
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
      const nativeJoint = this._nativeJoint;
      if (nativeJoint) {
        nativeJoint.setStiffness(value);
        this._wakeBodies();
      }
    }
  }

  /**
   * The damping applied by the spring.
   */
  get damping(): number {
    return this._damping;
  }

  set damping(value: number) {
    if (this._damping !== value) {
      this._damping = value;
      const nativeJoint = this._nativeJoint;
      if (nativeJoint) {
        nativeJoint.setDamping(value);
        this._wakeBodies();
      }
    }
  }

  protected override _createJoint(actor: IDynamicActor): ISpringJoint {
    return Engine._nativePhysics.createSpringJoint(actor);
  }

  protected override _syncNative(): void {
    super._syncNative();
    const nativeJoint = this._nativeJoint!;
    nativeJoint.setMinDistance(this._minDistance);
    nativeJoint.setMaxDistance(this._maxDistance);
    nativeJoint.setTolerance(this._tolerance);
    nativeJoint.setStiffness(this._stiffness);
    nativeJoint.setDamping(this._damping);
  }
}
