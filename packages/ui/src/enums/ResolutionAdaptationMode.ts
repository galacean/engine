/**
 * Resolution adaptation mode.
 * @remarks Only effective in screen space.
 */
export enum ResolutionAdaptationMode {
  /** Adapt based on width.(`referenceResolution.x`) */
  WidthAdaptation,
  /** Adapt based on height.(`referenceResolution.y`) */
  HeightAdaptation,
  /** Adapt based on both width and height.(`referenceResolution`) */
  BothAdaptation,
  /**
   * Uniformly scale by min(visibleWidth / referenceWidth, visibleHeight / referenceHeight). The visible size is the
   * canvas size in `ScreenSpaceOverlay` mode, and the camera projection area derived from `fieldOfView`/
   * `orthographicSize` and `aspectRatio` at the canvas `distance` in `ScreenSpaceCamera` mode, where a manually set
   * `Camera.projectionMatrix` is not reflected.
   * The full reference rectangle fits inside the visible size; the UICanvas rectangle expands on the other axis.
   */
  ExpandAdaptation,
  /**
   * Uniformly scale by max(visibleWidth / referenceWidth, visibleHeight / referenceHeight). The visible size is the
   * canvas size in `ScreenSpaceOverlay` mode, and the camera projection area derived from `fieldOfView`/
   * `orthographicSize` and `aspectRatio` at the canvas `distance` in `ScreenSpaceCamera` mode, where a manually set
   * `Camera.projectionMatrix` is not reflected.
   * The reference rectangle covers the visible size; any overflow lies off-screen.
   */
  ShrinkAdaptation
}
