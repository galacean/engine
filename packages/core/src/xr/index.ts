// xr manager
export { XRModule, registerXRFeatureManager } from "./XRModule";

// xr device
export type { IXRDevice } from "./IXRDevice";

// xr feature
export { XRRequestTrackingState } from "./feature/trackable/XRRequestTrackingState";
export { XRTrackedUpdateFlag } from "./feature/trackable/XRTrackedUpdateFlag";
export { XRPlatformFeature } from "./feature/XRPlatformFeature";
export { XRFeatureType } from "./feature/XRFeatureType";
// camera
export type { IXRCameraDescriptor } from "./feature/camera/IXRCameraDescriptor";
export { XRPlatformCamera } from "./feature/camera/XRPlatformCamera";
export { XRCameraManager } from "./feature/camera/XRCameraManager";
// hitTest
export type { IXRHitTestDescriptor } from "./feature/hitTest/IXRHitTestDescriptor";
export { XRHitTestManager } from "./feature/hitTest/XRHitTestManager";
export { XRHitTestMode } from "./feature/hitTest/XRHitTestMode";
export { XRPlatformHitTest } from "./feature/hitTest/XRPlatformHitTest";
// movement tracking
export type { IXRMovementTrackingDescriptor } from "./feature/movementTracking/IXRMovementTrackingDescriptor";
export { XRMovementTrackingManager } from "./feature/movementTracking/XRMovementTrackingManager";
export { XRMovementTrackingMode } from "./feature/movementTracking/XRMovementTrackingMode";
export { XRPlatformMovementTracking } from "./feature/movementTracking/XRPlatformMovementTracking";
// anchor tracking
export type { IXRAnchorTrackingDescriptor } from "./feature/trackable/anchor/IXRAnchorTrackingDescriptor";
export { XRAnchorTrackingManager } from "./feature/trackable/anchor/XRAnchorTrackingManager";
export { XRAnchorTrackingMode } from "./feature/trackable/anchor/XRAnchorTrackingMode";
export { XRPlatformAnchorTracking } from "./feature/trackable/anchor/XRPlatformAnchorTracking";
// image tracking
export type { IXRImageTrackingDescriptor } from "./feature/trackable/image/IXRImageTrackingDescriptor";
export { XRImageTrackingManager } from "./feature/trackable/image/XRImageTrackingManager";
export { XRPlatformImageTracking } from "./feature/trackable/image/XRPlatformImageTracking";
export { XRReferenceImage } from "./feature/trackable/image/XRReferenceImage";
// plane Tracking
export type { IXRPlaneTrackingDescriptor } from "./feature/trackable/plane/IXRPlaneTrackingDescriptor";
export { XRPlaneTrackingManager } from "./feature/trackable/plane/XRPlaneTrackingManager";
export { XRPlaneTrackingMode } from "./feature/trackable/plane/XRPlaneTrackingMode";
export { XRPlatformPlaneTracking } from "./feature/trackable/plane/XRPlatformPlaneTracking";

// xr input
export { XRTrackingState } from "./feature/trackable/XRTrackingState";
export { XRInputManager } from "./input/XRInputManager";
export { XRInputButton } from "./input/XRInputButton";
export { XRController } from "./input/XRController";
export { XRInputType } from "./input/XRInputType";
export { XRCamera } from "./input/XRCamera";
export { XRInput } from "./input/XRInput";

// xr session
export { XRSessionManager } from "./session/XRSessionManager";
export { XRSessionType } from "./session/XRSessionType";
export { XRSessionState } from "./session/XRSessionState";

// xr component
export { XRTrackingMode } from "./component/XRTrackingMode";
export { XRPoseDriver } from "./component/XRPoseDriver";
