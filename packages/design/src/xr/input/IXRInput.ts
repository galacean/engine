import { IXRPose } from "./IXRPose";
export interface IXRInput {
  pose: IXRPose;
  trackingState: number;
  addTrackingStateChangeListener(listener: (from: number, to: number) => any): void;
  removeTrackingStateChangeListener(listener: (from: number, to: number) => any): void;
}
