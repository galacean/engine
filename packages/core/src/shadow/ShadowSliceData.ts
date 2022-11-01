import { BoundingSphere, Matrix, Plane, Vector3 } from "@oasis-engine/math";

/**
 * @internal
 */
export class ShadowSliceData {
  // center
  position: Vector3 = new Vector3();
  resolution: number;

  // light view projection matrix
  viewMatrix: Matrix = new Matrix();
  projectionMatrix: Matrix = new Matrix();
  viewProjectMatrix: Matrix = new Matrix();

  // cull info
  cullPlanes: Plane[] = [
    new Plane(new Vector3()),
    new Plane(new Vector3()),
    new Plane(new Vector3()),
    new Plane(new Vector3()),
    new Plane(new Vector3()),
    new Plane(new Vector3()),
    new Plane(new Vector3()),
    new Plane(new Vector3()),
    new Plane(new Vector3()),
    new Plane(new Vector3())
  ];
  cullPlaneCount: number;

  // bounding sphere
  splitBoundSphere: BoundingSphere = new BoundingSphere(new Vector3(), 0.0);
  sphereCenterZ: number;
}
