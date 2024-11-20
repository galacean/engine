import { HitResult, Ray, Vector4 } from "@galacean/engine";
import { IGroupAble } from "./IGroupAble";

export interface IGraphics extends IGroupAble {
  raycastEnable: boolean;
  raycastPadding: Vector4;

  _raycast(ray: Ray, out: HitResult, distance: number): boolean;
}
