/**
 * Filling mode of background texture.
 */
export enum BackgroundTextureFillMode {
  /* Maintain the aspect ratio and scale the texture to fit the width of the canvas. */
  AspectFitWidth,
  /* Maintain the aspect ratio and scale the texture to fit the height of the canvas. */
  AspectFitHeight,
  /* Scale the texture fully fills the canvas. */
  Fill
}
