import { IXRCamera } from "@galacean/engine-design";
import { Matrix, Rect } from "@galacean/engine-math";
import { Camera } from "../../Camera";
import { XRPose } from "../XRPose";
import { XRInput } from "./XRInput";

/**
 * The XR camera.
 */
export class XRCamera extends XRInput implements IXRCamera {
  /** The viewport of the camera. */
  viewport: Rect = new Rect();
  /** The projection matrix of the camera. */
  projectionMatrix: Matrix = new Matrix();
  /** The associated virtual camera. */
  camera: Camera;
  /** The pose of the camera in XR space. */
  pose: XRPose;
}
