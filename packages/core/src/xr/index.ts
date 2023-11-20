// xr manager
export { XRManager, registerXRFeatureManager } from "./XRManager";

// xr device
export type { IXRDevice } from "@galacean/engine-design/src/xr/IXRDevice";

// xr feature
export { XRFeatureType } from "./feature/XRFeatureType";
export { XRFeatureManager } from "./feature/XRFeatureManager";
// camera
export type { IXRCameraDescriptor } from "./feature/camera/IXRCameraDescriptor";
export { XRCameraManager } from "./feature/camera/XRCameraManager";
// hitTest
export { XRHitTestManager } from "./feature/hitTest/XRHitTestManager";
export { XRHitTestType } from "./feature/hitTest/XRHitTestType";
// tracking
export { XRRequestTrackingState } from "./feature/trackable/XRRequestTrackingState";
// movement tracking
export type { IXRMovementTrackingDescriptor } from "./feature/movementTracking/IXRMovementTrackingDescriptor";
export { XRMovementTrackingManager } from "./feature/movementTracking/XRMovementTrackingManager";
export { XRMovementTrackingMode } from "./feature/movementTracking/XRMovementTrackingMode";
// anchor tracking
export { XRAnchorTrackingManager } from "./feature/trackable/anchor/XRAnchorTrackingManager";
// image tracking
export { XRImageTrackingManager } from "./feature/trackable/image/XRImageTrackingManager";
export { XRReferenceImage } from "./feature/trackable/image/XRReferenceImage";
// plane Tracking
export { XRPlaneTrackingManager } from "./feature/trackable/plane/XRPlaneTrackingManager";
export { XRPlaneMode } from "./feature/trackable/plane/XRPlaneMode";

// xr input
export { XRTrackingState } from "./input/XRTrackingState";
export { XRInputManager } from "./input/XRInputManager";
export { XRInputButton } from "./input/XRInputButton";
export { XRController } from "./input/XRController";
export { XRInputType } from "./input/XRInputType";
export { XRCamera } from "./input/XRCamera";
export { XRTargetRayMode } from "./input/XRTargetRayMode";
export { XRInputEventType } from "./input/XRInputEventType";
export { XRTrackedUpdateFlag } from "./input/XRTrackedUpdateFlag";

// xr session
export { XRSessionManager } from "./session/XRSessionManager";
export { XRSessionType } from "./session/XRSessionType";
export { XRSessionState } from "./session/XRSessionState";
