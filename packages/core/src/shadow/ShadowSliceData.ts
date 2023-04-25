import { BoundingSphere, Matrix, Plane, Vector3 } from "@galacean/engine-math";
import { VirtualCamera } from "../VirtualCamera";

/**
 * @internal
 */
export class ShadowSliceData {
  resolution: number;
  virtualCamera: VirtualCamera = new VirtualCamera();
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
