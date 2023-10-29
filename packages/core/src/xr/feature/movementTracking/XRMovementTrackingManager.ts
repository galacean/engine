import { IXRMovementTrackingDescriptor } from "./IXRMovementTrackingDescriptor";
import { XRFeatureManager } from "../XRFeatureManager";
import { XRFeatureChangeFlag } from "../XRFeatureChangeFlag";
import { XRMovementTrackingMode } from "./XRMovementTrackingMode";
import { registerXRFeatureManager } from "../../XRModule";
import { XRFeatureType } from "../XRFeatureType";

@registerXRFeatureManager(XRFeatureType.MovementTracking)
export class XRMovementTrackingManager extends XRFeatureManager<IXRMovementTrackingDescriptor> {
  setTrackingMode(value: XRMovementTrackingMode) {
    (this._descriptor as IXRMovementTrackingDescriptor).mode = value;
    this.platformFeature._onFeatureChange(XRFeatureChangeFlag.MovementTrackingMode, value);
  }
}
