import { Ray, Vector4 } from "@galacean/engine-math";
import { HitResult } from "../../physics";
import { IGroupElement } from "./IGroupElement";

export interface IUIGraphics extends IGroupElement {
  depth: number;
  raycastEnable: boolean;
  raycastPadding: Vector4;
  _raycast(ray: Ray, out: HitResult, distance: number): boolean;
}
