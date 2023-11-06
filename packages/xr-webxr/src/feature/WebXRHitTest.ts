import { Engine, XRFeatureType, XRInputType, IXRHitTestDescriptor, Matrix, XRPlatformHitTest } from "@galacean/engine";
import { WebXRSessionManager } from "../WebXRSessionManager";
import { registerXRPlatformFeature } from "../WebXRDevice";
import { IXRHitResult } from "@galacean/engine-design";

@registerXRPlatformFeature(XRFeatureType.HitTest)
/**
 * WebXR implementation of XRPlatformHitTest.
 */
export class WebXRHitTest extends XRPlatformHitTest {}
