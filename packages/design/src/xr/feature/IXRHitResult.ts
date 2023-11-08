import { Vector3 } from "@galacean/engine-math";

export interface IXRHitResult {
  point: Vector3;
  normal: Vector3;
  distance: number;
  hitId: number;
  hitType: number;
}
