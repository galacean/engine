import { IJoint } from "@galacean/engine-design";
import { Quaternion, Vector3 } from "@galacean/engine";
import { PhysXActor } from "../PhysXActor";
import { PhysXPhysics } from "../PhysXPhysics";

/**
 * Shared actor frames and constraint settings for PhysX joints.
 */
export class PhysXJoint implements IJoint {
  protected static readonly _maxFloat32 = 3.4028234663852886e38;
  private static readonly _zero = new Vector3();
  private static readonly _identity = new Quaternion();

  protected _pxJoint: any;
  protected readonly _connectedRotation = new Quaternion();

  constructor(
    physics: PhysXPhysics,
    actor: PhysXActor,
    connectedActor: PhysXActor | null,
    create: "createFixedJoint" | "createRevoluteJoint" | "createDistanceJoint"
  ) {
    this._pxJoint = physics._pxPhysics[create](
      actor._pxActor,
      PhysXJoint._zero,
      PhysXJoint._identity,
      connectedActor?._pxActor ?? null,
      PhysXJoint._zero,
      PhysXJoint._identity
    );
  }

  /**
   * {@inheritDoc IJoint.setActors }
   */
  setActors(actor: PhysXActor, connectedActor: PhysXActor | null): void {
    this._pxJoint.setActors(actor._pxActor, connectedActor?._pxActor ?? null);
  }

  /**
   * {@inheritDoc IJoint.setAnchor }
   */
  setAnchor(value: Vector3): void {
    this._pxJoint.setLocalPose(0, value, PhysXJoint._identity);
  }

  /**
   * {@inheritDoc IJoint.setConnectedAnchor }
   */
  setConnectedAnchor(value: Vector3, rotation?: Quaternion): void {
    if (rotation) this._connectedRotation.copyFrom(rotation);
    this._pxJoint.setLocalPose(1, value, this._connectedRotation);
  }

  /**
   * {@inheritDoc IJoint.setMassScale }
   */
  setMassScale(value: number): void {
    this._pxJoint.setInvMassScale0(1 / value);
  }

  /**
   * {@inheritDoc IJoint.setConnectedMassScale }
   */
  setConnectedMassScale(value: number): void {
    this._pxJoint.setInvMassScale1(1 / value);
  }

  /**
   * {@inheritDoc IJoint.setInertiaScale }
   */
  setInertiaScale(value: number): void {
    this._pxJoint.setInvInertiaScale0(value);
  }

  /**
   * {@inheritDoc IJoint.setConnectedInertiaScale }
   */
  setConnectedInertiaScale(value: number): void {
    this._pxJoint.setInvInertiaScale1(value);
  }

  /**
   * {@inheritDoc IJoint.setBreakForce }
   */
  setBreakForce(force: number, torque: number): void {
    this._pxJoint.setBreakForce(force, torque);
  }

  /**
   * {@inheritDoc IJoint.destroy }
   */
  destroy(): void {
    this._pxJoint.release();
    this._pxJoint = null;
  }
}
