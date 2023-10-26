import { IXRFeatureDescriptor } from "@galacean/engine-design";
import { EnumXRHitTestMode } from "../../enum/EnumXRHitTestMode";

export interface IXRHitTestDescriptor extends IXRFeatureDescriptor {
  mode: EnumXRHitTestMode;
}
