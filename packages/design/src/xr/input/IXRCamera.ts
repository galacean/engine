import { Matrix, Rect } from "@galacean/engine-math";
import { IXRInput } from "./IXRInput";
import { IXRPose } from "../IXRPose";

export interface IXRCamera extends IXRInput {
  /** The pose of the camera in XR space. */
  pose: IXRPose;
  /** The viewport of the camera. */
  viewport: Rect;
  /** The projection matrix of the camera. */
  projectionMatrix: Matrix;
}
