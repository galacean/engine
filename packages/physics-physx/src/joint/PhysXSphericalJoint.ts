import { ISphericalJoint } from "@oasis-engine/design";
import { PhysXJoint } from "./PhysXJoint";
import { PhysXCollider } from "../PhysXCollider";
import { PhysXPhysics } from "../PhysXPhysics";

/**
 * A joint which behaves in a similar way to a ball and socket.
 */
export class PhysXSphericalJoint extends PhysXJoint implements ISphericalJoint {
  private _yLimit = Math.PI / 2;
  private _zLimit = Math.PI / 2;
  private _contactDistance = -1;
  private _stiffness = 0;
  private _damping = 0;
  private _enableSpring = false;

  constructor(collider: PhysXCollider) {
    super();
    this._collider = collider;
    this._pxJoint = PhysXPhysics._pxPhysics.createSphericalJoint(
      null,
      PhysXJoint._defaultVec,
      PhysXJoint._defaultQuat,
      collider._pxActor,
      PhysXJoint._defaultVec,
      PhysXJoint._defaultQuat
    );
  }

  /**
   * {@inheritDoc ISphericalJoint.enableSpring }
   */
  enableSpring(value: boolean) {
    if (this._enableSpring !== value) {
      this._enableSpring = value;
      this._setLimitCone();
    }
  }

  /**
   * {@inheritDoc ISphericalJoint.setYLimit }
   */
  setYLimit(value: number) {
    if (this._yLimit !== value) {
      this._yLimit = value;
      this._setLimitCone();
    }
  }

  /**
   * {@inheritDoc ISphericalJoint.setZLimit }
   */
  setZLimit(value: number) {
    if (this._zLimit !== value) {
      this._zLimit = value;
      this._setLimitCone();
    }
  }

  /**
   * {@inheritDoc ISphericalJoint.setContactDistance }
   */
  setContactDistance(value: number) {
    if (this._contactDistance !== value) {
      this._contactDistance = value;
      this._setLimitCone();
    }
  }

  /**
   * {@inheritDoc ISphericalJoint.setStiffness }
   */
  setStiffness(value: number) {
    if (this._stiffness !== value) {
      this._stiffness = value;
      this._setLimitCone();
    }
  }

  /**
   * {@inheritDoc ISphericalJoint.setDamping }
   */
  setDamping(value: number) {
    if (this._damping !== value) {
      this._damping = value;
      this._setLimitCone();
    }
  }

  private _setLimitCone() {
    if (this._enableSpring) {
      this._pxJoint.setSoftLimitCone(this._yLimit, this._zLimit, this._stiffness, this._damping);
    } else {
      this._pxJoint.setHardLimitCone(this._yLimit, this._zLimit, this._contactDistance);
    }
  }
}
