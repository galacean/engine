import { Ray, Vector4, HitResult } from "@galacean/engine";
import { IUIGroupable } from "./IUIGroupable";

export interface IUIGraphics extends IUIGroupable {
  depth: number;
  raycastEnable: boolean;
  raycastPadding: Vector4;

  _raycast(ray: Ray, out: HitResult, distance: number): boolean;
}
