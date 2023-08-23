// manager
export { XRManager, registerXRFeature, registerXRProvider } from "./XRManager";
export { XRInputManager } from "./input/XRInputManager";

// feature
export { XRMovementTracking } from "./feature/movementTracking/XRMovementTracking";
export { XRPlaneTracking } from "./feature/planeTracking/XRPlaneTracking";

// descriptor
export type { IXRPlaneTrackingDescriptor } from "./feature/planeTracking/IXRPlaneTrackingDescriptor";
export type { IXRMovementTrackingDescriptor } from "./feature/movementTracking/IXRMovementTrackingDescriptor";
export type { IXRHandTrackingDescriptor } from "./feature/handTracking/IXRHandTrackingDescriptor";
export type { IXRFeatureDescriptor } from "./descriptor/IXRFeatureDescriptor";
export type { IXRSessionDescriptor } from "./descriptor/IXRSessionDescriptor";

// enum
export { EnumXRAnchorTrackingMode } from "./enum/EnumXRAnchorTrackingMode";
export { EnumXRButton } from "./enum/EnumXRButton";
export { EnumXRFeature } from "./enum/EnumXRFeature";
export { EnumXRHandTrackingMode } from "./enum/EnumXRHandTrackingMode";
export { EnumXRHitTestMode } from "./enum/EnumXRHitTestMode";
export { EnumXRImageTrackingMode } from "./enum/EnumXRImageTrackingMode";
export { EnumXRInputSource } from "./enum/EnumXRInputSource";
export { EnumXRMode } from "./enum/EnumXRMode";
export { EnumXRPlaneTrackingMode } from "./enum/EnumXRPlaneTrackingMode";
export { EnumXRTrackingMode } from "./enum/EnumXRTrackingMode";

// input
export { XRInputDevice } from "./input/XRInputDevice";
export { XRViewer } from "./input/XRViewer";
export { XRController } from "./input/XRController";
export { XRHand } from "./input/XRHand";
export { XRGamepad } from "./input/XRGamepad";

// interface
export type { IXRPlatform } from "./interface/IXRPlatform";

// component
export { XRPoseDriver } from "./component/XRPoseDriver";
