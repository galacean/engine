import { ICapsuleShape } from "@galacean/engine-design";
import { Quaternion, Vector3 } from "@galacean/engine";
import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";
import { PhysXShape } from "./PhysXShape";

/**
 * Capsule shape in PhysX.
 */
export class PhysXCapsuleShape extends PhysXShape implements ICapsuleShape {
  // Rotate the native X axis onto the requested capsule axis.
  private static readonly _axes: readonly (Quaternion | null)[] = [
    null,
    PhysXCapsuleShape._yAxis,
    new Quaternion(0, Math.SQRT1_2, 0, Math.SQRT1_2)
  ];

  private _axis: Quaternion | null;
  private readonly _localPosition = new Vector3();
  private readonly _localRotation = new Quaternion();

  constructor(
    physXPhysics: PhysXPhysics,
    uniqueID: number,
    radius: number,
    halfHeight: number,
    material: PhysXPhysicsMaterial,
    upAxis: number
  ) {
    super(physXPhysics);
    this._axis = PhysXCapsuleShape._axes[upAxis];
    this._pxGeometry = new physXPhysics._physX.PxCapsuleGeometry(radius, halfHeight);
    this._initialize(material, uniqueID);
  }

  /**
   * {@inheritDoc IPhysicsShape.setLocalPose }
   */
  override setLocalPose(position: Vector3, rotation: Quaternion): void {
    this._localPosition.copyFrom(position);
    this._localRotation.copyFrom(rotation);
    this._setLocalPose(position, rotation, this._axis);
  }

  /**
   * {@inheritDoc ICapsuleShape.setDimensions }
   */
  setDimensions(radius: number, halfHeight: number, upAxis: number): void {
    const geometry = this._pxGeometry;
    geometry.radius = radius;
    geometry.halfHeight = halfHeight;
    this._pxShape.setGeometry(geometry);
    const axis = PhysXCapsuleShape._axes[upAxis];
    if (axis !== this._axis) {
      this._axis = axis;
      this._setLocalPose(this._localPosition, this._localRotation, axis);
    }
  }
}
