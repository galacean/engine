import { IXRFeatureDescriptor, IXRPose } from "@galacean/engine-design";

export interface IXRAnchorTrackingDescriptor extends IXRFeatureDescriptor {
  anchors?: IXRPose[];
}
