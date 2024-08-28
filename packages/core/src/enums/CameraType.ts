/**
 * @internal
 */
export enum CameraType {
  Normal = 0x0,
  XRCenterCamera = 0x1,
  XRLeftCamera = 0x2,
  XRRightCamera = 0x4,
  UIOverlay = 0x8,
  XRCamera = CameraType.XRCenterCamera | CameraType.XRLeftCamera | CameraType.XRRightCamera
}
