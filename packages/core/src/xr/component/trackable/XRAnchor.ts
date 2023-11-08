import { IXRTrackedAnchor } from "@galacean/engine-design";
import { XRTracked } from "./XRTracked";
import { registerXRComponent } from "../../XRModule";
import { XRFeatureType } from "../../feature/XRFeatureType";

@registerXRComponent(XRFeatureType.AnchorTracking)
export class XRAnchor extends XRTracked<IXRTrackedAnchor> {}
