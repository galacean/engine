import { Ray, Vector4 } from "@galacean/engine";
import { UIHitResult } from "../input/UIHitResult";
import { IGroupAble } from "./IGroupAble";

export interface IGraphics extends IGroupAble {
  raycastEnable: boolean;
  raycastPadding: Vector4;

  _raycast(ray: Ray, out: UIHitResult, distance: number): boolean;
}
