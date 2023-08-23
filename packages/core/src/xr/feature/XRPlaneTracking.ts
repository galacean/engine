import { XRFeature } from "./XRFeature";
import { UpdateFlagManager } from "../../UpdateFlagManager";
import { registerXRFeature } from "../XRManager";
import { EnumXRFeature } from "../enum/EnumXRFeature";

@registerXRFeature(EnumXRFeature.PlaneTracking)
export class XRPlaneTracking extends XRFeature {
  /** @internal */
  _updateFlagManager: UpdateFlagManager = new UpdateFlagManager();

  addListener(fun: (type?: number, param?: Object) => any) {
    this._updateFlagManager.addListener(fun);
  }

  override onUpdate(): void {}
}

export enum XRTrackingChangeFlags {
  add = 0x1,
  remove = 0x2,
  update = 0x4,
  all = 0x7
}
