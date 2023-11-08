import { IXRTrackedAnchor } from "@galacean/engine-design";
import { XRTracked } from "./XRTracked";
import { registerXRComponent } from "../../XRModule";
import { XRFeatureType } from "../../feature/XRFeatureType";

@registerXRComponent(XRFeatureType.AnchorTracking)
/**
 * Tracked anchor in the XR world.
 */
export class XRAnchor extends XRTracked<IXRTrackedAnchor> {}
