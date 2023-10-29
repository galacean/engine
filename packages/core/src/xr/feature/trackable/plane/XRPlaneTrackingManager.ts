import { XRFeatureManager } from "../../XRFeatureManager";
import { UpdateFlagManager } from "../../../../UpdateFlagManager";
import { registerXRFeatureManager } from "../../../XRModule";
import { XRFeatureType } from "../../XRFeatureType";
import { IXRPlaneTrackingDescriptor } from "./IXRPlaneTrackingDescriptor";

@registerXRFeatureManager(XRFeatureType.PlaneTracking)
export class XRPlaneTrackingManager extends XRFeatureManager<IXRPlaneTrackingDescriptor> {
  /** @internal */
  _updateFlagManager: UpdateFlagManager = new UpdateFlagManager();

  addListener(fun: (type?: number, param?: Object) => any) {
    this._updateFlagManager.addListener(fun);
  }

  override _onUpdate(): void {}
}

export enum XRTrackingChangeFlags {
  add = 0x1,
  remove = 0x2,
  update = 0x4,
  all = 0x7
}
