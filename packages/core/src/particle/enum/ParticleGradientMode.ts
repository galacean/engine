/**
 * The particle gradient mode.
 */
export enum ParticleGradientMode {
  /** Use a single color for the MinMaxGradient. */
  Color,
  /** Use a single color gradient for the MinMaxGradient. */
  Gradient,
  /** Use a random value between 2 colors for the MinMaxGradient. */
  TwoColors,
  /** Use a random value between 2 color gradients for the MinMaxGradient. */
  TwoGradients
}
