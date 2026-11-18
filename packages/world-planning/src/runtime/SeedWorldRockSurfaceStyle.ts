/** Artist-facing top-surface controls used only by grass-enabled surfaces. */
export interface SeedWorldRockGrassTransitionStyle {
  readonly topSlope: number;
  readonly topSoftness: number;
  /** Multiplier applied to the authored grass clump's wind-swept edge clearance. */
  readonly edgeInsetScale: number;
}

export const SEED_WORLD_DEFAULT_ROCK_GRASS_TRANSITION_STYLE: SeedWorldRockGrassTransitionStyle = Object.freeze({
  topSlope: 0.52,
  topSoftness: 0.18,
  edgeInsetScale: 1
});
