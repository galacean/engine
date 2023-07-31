import { Entity } from "../../Entity";
import { XRFeature } from "./XRFeature";
import { registerFeature } from "../XRManager";
import { EnumXRFeature } from "../enum/EnumXRFeature";

@registerFeature(EnumXRFeature.imageTracking)
export class XRImageTrackManager extends XRFeature {
  addImage(): void {}

  removeImage(): void {}

  getTrackedObject(): Entity {
    return null;
  }

  override onEnable(): void {}

  override onDisable(): void {}

  override onDestroy(): void {}
}
