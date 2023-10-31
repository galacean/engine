import { IXRFeatureDescriptor } from "@galacean/engine-design";
import { Camera } from "../../../Camera";

export interface IXRCameraDescriptor extends IXRFeatureDescriptor {
  camera?: Camera;
  leftCamera?: Camera;
  rightCamera?: Camera;
}
