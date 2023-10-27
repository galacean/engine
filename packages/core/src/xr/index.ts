// manager
export { XRModule, registerXRFeatureManager, registerXRPlatformFeature } from "./XRModule";

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
export type { IXRImageTrackingDescriptor } from "./feature/ImageTracking/IXRImageTrackingDescriptor";
export { XRReferenceImage } from "./feature/ImageTracking/XRReferenceImage";
export { XRImageTrackingManager } from "./feature/ImageTracking/XRImageTrackingManager";
// --- PlaneTracking --
export type { IXRPlaneTrackingDescriptor } from "./feature/planeTracking/IXRPlaneTrackingDescriptor";
export { XRPlaneTrackingManager } from "./feature/planeTracking/XRPlaneTrackingManager";

// enum
export { EnumXRAnchorTrackingMode } from "./enum/EnumXRAnchorTrackingMode";
export { EnumXRButton } from "./enum/EnumXRButton";
export { EnumXRFeature } from "./enum/EnumXRFeature";
export { EnumXRHitTestMode } from "./enum/EnumXRHitTestMode";
export { EnumXRImageTrackingMode } from "./enum/EnumXRImageTrackingMode";
export { EnumXRInputSource } from "./enum/EnumXRInputSource";
export { EnumXRMode } from "./enum/EnumXRMode";
export { EnumXRPlaneTrackingMode } from "./enum/EnumXRPlaneTrackingMode";
export { EnumXRTrackingMode } from "./enum/EnumXRTrackingMode";
export { EnumXRFeatureChangeFlag } from "./enum/EnumXRFeatureChangeFlag";
export { TrackingStateChangeFlags } from "./enum/TrackingStateChangeFlags";

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
