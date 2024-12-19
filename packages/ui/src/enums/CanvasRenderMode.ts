/**
 * Render mode for ui canvas.
 */
export enum CanvasRenderMode {
  /**
   * The UI canvas will be rendered directly onto the screen and adapted to screen space,
   * overlaying other rendering elements in the same scene.
   * @remarks if the `engine.canvas` size change, the UI canvas will automatically adapt.
   */
  ScreenSpaceOverlay = 0,
  /**
   * The UI canvas is placed at a specified distance in front of the camera and adapted to screen space,
   * with all objects rendered by the camera.
   * @remarks if the camera's properties or the `engine.canvas` size change, the UI canvas will automatically adapt.
   * @remarks if set `ScreenSpaceCamera` but no corresponding camera is assigned, the actual rendering mode defaults to `ScreenSpaceOverlay`.
   */
  ScreenSpaceCamera = 1,
  /**
   * The UI canvas is placed in the 3D world space and rendered by every camera in the same scene.
   */
  WorldSpace = 2
}
