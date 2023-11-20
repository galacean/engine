import { IXRInput } from "./IXRInput";
import { IXRPose } from "./IXRPose";

export interface IXRController extends IXRInput {
  /** the pose mode of the controller. (Default is Grip) */
  poseMode: number;
  /** The grip space pose of the controller. */
  gripPose: IXRPose;
  /** The target ray space pose of the controller. */
  targetRayPose: IXRPose;
}
