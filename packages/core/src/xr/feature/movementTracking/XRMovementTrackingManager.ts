import { IXRMovementTrackingDescriptor } from "./IXRMovementTrackingDescriptor";
import { XRFeatureManager } from "../XRFeatureManager";
import { EnumXRFeatureChangeFlag } from "../../enum/EnumXRFeatureChangeFlag";
import { XRMovementTrackingMode } from "./XRMovementTrackingMode";
import { registerXRFeatureManager } from "../../XRModule";
import { EnumXRFeature } from "../../enum/EnumXRFeature";

@registerXRFeatureManager(EnumXRFeature.MovementTracking)
export class XRMovementTrackingManager extends XRFeatureManager {
  setTrackingMode(value: XRMovementTrackingMode) {
    (this._descriptor as IXRMovementTrackingDescriptor).mode = value;
    this.platformFeature._onFlagChange(EnumXRFeatureChangeFlag.MovementTrackingMode, value);
  }
}
