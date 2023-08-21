// manager
export { XRManager, registerXRFeature, registerXRProvider } from "./XRManager";
export { XRInputManager } from "./input/XRInputManager";

// feature
export { XRMovementTracking } from "./feature/movementTracking/XRMovementTracking";
export { XRPlaneTracking } from "./feature/planeTracking/XRPlaneTracking";

// descriptor
export type { IXRSessionDescriptor } from "./descriptor/IXRSessionDescriptor";
export type { IXRFeatureDescriptor } from "./descriptor/IXRFeatureDescriptor";
export type { IXRPlaneTrackingDescriptor } from "./feature/planeTracking/IXRPlaneTrackingDescriptor";
export type { IXRMovementTrackingDescriptor } from "./feature/movementTracking/IXRMovementTrackingDescriptor";

// enum
export { EnumXRMode } from "./enum/EnumXRMode";
export { EnumXRButton } from "./enum/EnumXRButton";
export { EnumXRFeature } from "./enum/EnumXRFeature";
export { EnumXRInputState } from "./enum/EnumXRInputState";
export { EnumXRInputSource } from "./enum/EnumXRInputSource";
export { XRImageTrackingMode } from "./enum/XRImageTrackingMode";
export { XRPlaneTrackingMode } from "./enum/XRPlaneTrackingMode";

// input
export { XRInputDevice } from "./input/XRInputDevice";
export { XRViewer } from "./input/XRViewer";
export { XRController } from "./input/XRController";
export type { IXRInputProvider } from "./input/IXRInputProvider";

// interface
export type { IXRSession } from "./interface/IXRSession";
export type { IXRPlatform } from "./interface/IXRPlatform";
export type { IXRFeatureProvider } from "./feature/IXRFeatureProvider";

// component
export { XRPoseDriver } from "./component/XRPoseDriver";
