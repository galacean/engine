import { IXRInput } from "./IXRInput";
import { IXRPose } from "../IXRPose";

export interface IXRController extends IXRInput {
  /** The grip space pose of the controller in XR space. */
  gripPose: IXRPose;
  /** The target ray space pose of the controller in XR space. */
  targetRayPose: IXRPose;
}
