// manager
export { XRModule, registerXRFeatureManager } from "./XRModule";

// feature
export { XRPlatformFeature } from "./feature/XRPlatformFeature";
// -- Movement --
export type { IXRMovementTrackingDescriptor } from "./feature/movementTracking/IXRMovementTrackingDescriptor";
export { XRMovementTrackingMode } from "./feature/movementTracking/XRMovementTrackingMode";
export { XRMovementTrackingManager } from "./feature/movementTracking/XRMovementTrackingManager";
// -- HitTest --
export type { IXRHitTestDescriptor } from "./feature/hitTest/IXRHitTestDescriptor";
export { XRHitTestManager } from "./feature/hitTest/XRHitTestManager";
// -- ImageTracking --
export type { IXRImageTrackingDescriptor } from "./feature/trackable/image/IXRImageTrackingDescriptor";
export { XRReferenceImage } from "./feature/trackable/image/XRReferenceImage";
export { XRImageTrackingManager } from "./feature/trackable/image/XRImageTrackingManager";
// --- PlaneTracking --
export type { IXRPlaneTrackingDescriptor } from "./feature/trackable/plane/IXRPlaneTrackingDescriptor";
export { XRPlaneTrackingManager } from "./feature/trackable/plane/XRPlaneTrackingManager";

// enum
export { XRAnchorTrackingMode } from "./feature/trackable/anchor/XRAnchorTrackingMode";
export { XRInputButton } from "./input/XRInputButton";
export { XRFeatureType } from "./feature/XRFeatureType";
export { XRHitTestMode } from "./feature/hitTest/XRHitTestMode";
export { XRInputType } from "./input/XRInputType";
export { XRSessionType } from "./session/XRSessionType";
export { XRPlaneTrackingMode } from "./feature/trackable/plane/XRPlaneTrackingMode";
export { XRTrackingMode } from "./component/XRTrackingMode";
export { XRFeatureChangeFlag } from "./feature/XRFeatureChangeFlag";
export { XRTrackingState } from "./input/XRTrackedState";

// input
export { XRInputTrackingState } from "./input/XRInputTrackingState";
export { XRController } from "./input/XRController";
export { XRInput } from "./input/XRInput";
export { XRInputManager } from "./input/XRInputManager";
export { XRCamera } from "./input/XRCamera";

// session
export { XRSessionManager } from "./session/XRSessionManager";

// interface
export type { IXRDevice } from "./IXRDevice";

// component
export { XRPoseDriver } from "./component/XRPoseDriver";
