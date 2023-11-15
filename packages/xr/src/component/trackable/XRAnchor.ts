import { IXRTrackedAnchor } from "@galacean/engine-design";
import { XRFeatureType } from "@galacean/engine";
import { XRTrackedComponent } from "./XRTrackedComponent";
import { registerXRTrackedComponent } from "../../feature/trackable/XRTrackableManager";

@registerXRTrackedComponent(XRFeatureType.AnchorTracking)
/**
 * Tracked anchor in the XR world.
 */
export class XRAnchor extends XRTrackedComponent<IXRTrackedAnchor> {}
