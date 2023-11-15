import { IXRPose } from "../../input/IXRPose";

/**
 * The base interface of XR trackable.
 */
export interface IXRTracked {
  /** The unique id of the trackable. */
  id: number;
  /** The pose of the trackable. */
  pose: IXRPose;
  /** The tracking state of the trackable. */
  state: number;
  /** The modified frame count of the trackable. */
  frameCount: number;
}
