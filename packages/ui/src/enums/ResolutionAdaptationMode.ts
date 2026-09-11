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
   * Uniformly scale by min(visibleWidth / referenceWidth, visibleHeight / referenceHeight).
   * The full reference rectangle fits inside the visible area; the UICanvas rectangle expands on the other axis.
   */
  ExpandAdaptation,
  /**
   * Uniformly scale by max(visibleWidth / referenceWidth, visibleHeight / referenceHeight).
   * The reference rectangle covers the visible area; any overflow lies off-screen.
   */
  ShrinkAdaptation
}
