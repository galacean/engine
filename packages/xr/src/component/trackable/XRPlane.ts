import { IXRTrackedPlane } from "@galacean/engine-design";
import { Vector3, XRFeatureType } from "@galacean/engine";
import { XRTrackedComponent } from "./XRTrackedComponent";
import { registerXRTrackedComponent } from "../../feature/trackable/XRTrackableManager";

@registerXRTrackedComponent(XRFeatureType.AnchorTracking)
/**
 * Tracked plane in the XR world.
 */
export class XRPlane extends XRTrackedComponent<IXRTrackedPlane> {
  get polygon(): readonly Vector3[] {
    return this._platformData.polygon;
  }

  get orientation(): "horizontal" | "vertical" {
    return this._platformData.orientation;
  }
}
