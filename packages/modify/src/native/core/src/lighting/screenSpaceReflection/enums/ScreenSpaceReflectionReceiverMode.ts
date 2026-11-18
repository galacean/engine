/** How a material participates in the camera-owned screen-space reflection pass. */
export enum ScreenSpaceReflectionReceiverMode {
  /** Resolve from the camera receiver policy and material/render-queue capabilities. */
  Auto = 3,
  /** Do not receive SSR. The material can still appear in another receiver's Scene Color/Depth. */
  Disabled = 0,
  /** Write an opaque receiver and let the camera composite SSR over the Environment/IBL lobe. */
  OpaqueComposite = 1,
  /** Write a transparent receiver and sample the published premultiplied SSR texture in Forward. */
  TransparentSampleOnly = 2
}
