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
  /** Adapt to the side with a larger ratio. */
  ExpandAdaptation,
  /** Adapt to the side with smaller ratio. */
  ShrinkAdaptation
}
