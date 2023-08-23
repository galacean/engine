import { IXRFeatureDescriptor } from "./IXRFeatureDescriptor";
import { EnumXRHitTestMode } from "../enum/EnumXRHitTestMode";

export interface IXRHitTestDescriptor extends IXRFeatureDescriptor {
  mode: EnumXRHitTestMode;
}
