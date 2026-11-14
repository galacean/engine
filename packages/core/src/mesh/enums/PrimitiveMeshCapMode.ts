/**
 * End caps generated for cylinders and truncated cones.
 */
export enum PrimitiveMeshCapMode {
  /**
   * Generate both the top and bottom caps.
   */
  Both = "both",
  /**
   * Generate only the top cap, facing +Y.
   */
  Top = "top",
  /**
   * Generate only the bottom cap, facing -Y.
   */
  Bottom = "bottom",
  /**
   * Leave both ends open.
   */
  None = "none"
}
