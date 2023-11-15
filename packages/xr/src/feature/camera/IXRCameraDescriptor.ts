import { Camera } from "@galacean/engine";
import { IXRFeatureDescriptor } from "@galacean/engine-design";

export interface IXRCameraDescriptor extends IXRFeatureDescriptor {
  camera?: Camera;
  leftCamera?: Camera;
  rightCamera?: Camera;
}
