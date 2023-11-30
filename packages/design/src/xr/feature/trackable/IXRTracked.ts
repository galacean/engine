import { IXRPose } from "../../input/IXRPose";

/**
 * The base interface of XR trackable.
 */
export interface IXRTracked {
  /** The unique id of the trackable. */
  id: number;
  /** The pose of the trackable in XR space. */
  pose: IXRPose;
  /** The tracking state of the trackable. */
  state: number;
}
