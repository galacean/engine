import { IXRTrackedAnchor } from "@galacean/engine-design";
import { XRTracked } from "./XRTracked";
import { registerXRComponent } from "../../XRManager";
import { XRFeatureType } from "../../feature/XRFeatureType";

@registerXRComponent(XRFeatureType.AnchorTracking)
/**
 * Tracked anchor in the XR world.
 */
export class XRAnchor extends XRTracked<IXRTrackedAnchor> {}
