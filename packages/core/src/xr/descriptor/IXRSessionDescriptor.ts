
import { EnumXRMode } from "../enum/EnumXRMode";
import { IXRFeatureDescriptor } from "./IXRFeatureDescriptor";

export interface IXRSessionDescriptor {
  mode: EnumXRMode;
  requestFeatures: IXRFeatureDescriptor[];
}
