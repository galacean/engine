import { IXRPose } from "../../input/IXRPose";

/**
 * 可追踪的数据
 */
export interface IXRTrackable {
  id: number;
  pose: IXRPose;
  state: number;
  frameCount: number;
}
