import { IXRTrackedPlane } from "@galacean/engine-design";
import { XRTracked } from "./XRTracked";
import { registerXRComponent } from "../../XRManager";
import { XRFeatureType } from "../../feature/XRFeatureType";
import { Vector3 } from "@galacean/engine-math";

@registerXRComponent(XRFeatureType.PlaneTracking)
/**
 * Tracked plane in the XR world.
 */
export class XRPlane extends XRTracked<IXRTrackedPlane> {
  get polygon(): readonly Vector3[] {
    return this._platformData.polygon;
  }

  get orientation(): "horizontal" | "vertical" {
    return this._platformData.orientation;
  }
}
