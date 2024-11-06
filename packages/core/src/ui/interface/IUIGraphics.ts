import { Ray, Vector4 } from "@galacean/engine-math";
import { HitResult } from "../../physics";
import { IUIGroupable } from "./IUIGroupable";

export interface IUIGraphics extends IUIGroupable {
  depth: number;
  raycastEnable: boolean;
  raycastPadding: Vector4;

  _raycast(ray: Ray, out: HitResult, distance: number): boolean;
}
