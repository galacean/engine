import { IXRDescriptor } from "@galacean/engine-design";
import { EnumWebXRSpaceType } from "../enum/EnumWebXRSpaceType";

export interface IWebXRDescriptor extends IXRDescriptor {
  spaceType: EnumWebXRSpaceType;
}
