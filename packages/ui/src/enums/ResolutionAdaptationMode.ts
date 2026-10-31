/**
 * Resolution adaptation in screen space.
 * Scale ratios are available size / `referenceResolution` per axis.
 * Available size comes from the canvas in Overlay mode or the camera's standard projection at `distance`
 * in Camera mode; a custom `Camera.projectionMatrix` is not reflected.
 */
export enum ResolutionAdaptationMode {
  /** Adapt based on width.(`referenceResolution.x`) */
  WidthAdaptation,
  /** Adapt based on height.(`referenceResolution.y`) */
  HeightAdaptation,
  /** Adapt based on both width and height.(`referenceResolution`) */
  BothAdaptation,
  /** Use the smaller scale ratio to fit the reference rectangle; the UICanvas expands on the other axis. */
  ExpandAdaptation,
  /** Use the larger scale ratio to cover the available area; the reference rectangle may overflow. */
  ShrinkAdaptation
}
