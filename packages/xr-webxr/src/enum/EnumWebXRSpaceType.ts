export enum EnumWebXRSpaceType {
  // Always required for inline sessions | xr-spatial-tracking
  Local = "local",
  // Always required | xr-spatial-tracking
  LocalFloor = "local-floor",
  // Always required | xr-spatial-tracking
  Unbounded = "unbounded",
  // Always required |         —---
  Viewer = "viewer",
  // Always required | xr-spatial-tracking
  BoundedFloor = "bounded-floor"
}
