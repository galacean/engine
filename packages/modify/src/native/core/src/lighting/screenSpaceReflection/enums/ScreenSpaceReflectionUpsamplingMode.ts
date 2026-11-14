/** Reconstruction of a reduced-resolution SSR texture. Full resolution bypasses reconstruction. */
export enum ScreenSpaceReflectionUpsamplingMode {
  /** Sample the trace directly with bilinear filtering. Cheapest, but can blend across receiver edges. */
  Bilinear,
  /** Reconstruct using receiver depth, normal and roughness without a preliminary blur. */
  Bilateral,
  /** Blur horizontally and vertically before geometry-aware reconstruction (legacy behavior). */
  GaussianBilateral
}
