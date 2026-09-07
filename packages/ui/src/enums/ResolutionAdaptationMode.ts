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
   * Uniformly scale by min(viewportWidth / referenceWidth, viewportHeight / referenceHeight).
   * The full reference rectangle fits inside the viewport; the UICanvas rectangle expands on the other axis.
   */
  ExpandAdaptation,
  /**
   * Uniformly scale by max(viewportWidth / referenceWidth, viewportHeight / referenceHeight).
   * The reference rectangle covers the viewport; its overflow stays outside the visible canvas area.
   */
  ShrinkAdaptation
}
