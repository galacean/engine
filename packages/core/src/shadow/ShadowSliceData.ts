import { BoundingSphere, Matrix, Plane, Vector3 } from "@oasis-engine/math";

/**
 * @internal
 */
export class ShadowSliceData {
  position: Vector3 = new Vector3();
  offsetX: number;
  offsetY: number;
  resolution: number;
  viewMatrix: Matrix = new Matrix();
  projectionMatrix: Matrix = new Matrix();
  viewProjectMatrix: Matrix = new Matrix();
  cullPlanes: Array<Plane> = [
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
  splitBoundSphere: BoundingSphere = new BoundingSphere(new Vector3(), 0.0);
  sphereCenterZ: number;
}
