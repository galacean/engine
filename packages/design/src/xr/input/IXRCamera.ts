import { Matrix, Rect } from "@galacean/engine-math";
import { IXRInput } from "./IXRInput";

export interface IXRCamera extends IXRInput {
  /** The viewport of the camera. */
  viewport: Rect;
  /** The projection matrix of the camera. */
  projectionMatrix: Matrix;
}
