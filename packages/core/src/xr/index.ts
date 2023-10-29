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
export { EnumXRButton } from "./enum/EnumXRButton";
export { XRFeatureType } from "./feature/XRFeatureType";
export { XRHitTestMode } from "./feature/hitTest/XRHitTestMode";
export { XRImageTrackingMode } from "./feature/trackable/image/XRImageTrackingMode";
export { XRInputType } from "./input/XRInputType";
export { EnumXRMode } from "./enum/EnumXRMode";
export { XRPlaneTrackingMode } from "./feature/trackable/plane/XRPlaneTrackingMode";
export { EnumXRTrackingMode } from "./enum/EnumXRTrackingMode";
export { XRFeatureChangeFlag } from "./feature/XRFeatureChangeFlag";
export { XRTrackingState } from "./enum/XRTrackedState";

// input
export { XRInputTrackingState } from "./input/XRInputTrackingState";
export { XRController } from "./input/XRController";
export { XRInput } from "./input/XRInput";
export { XRInputManager } from "./input/XRInputManager";
export { XRViewer } from "./input/XRViewer";

// session
export { XRSessionManager } from "./session/XRSessionManager";

// interface
export type { IXRDevice } from "./IXRDevice";

// component
export { XRPoseDriver } from "./component/XRPoseDriver";
