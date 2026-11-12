/** Development options for rendering the published spatial plan; never persisted as layout parameters. */
export interface PlanningRuntimeOptions {
  /** Vertical FOV used by the scene and its read-only viewpoint context. */
  readonly verticalFieldOfView: number;
  /** Full-HD pixel budget for the 3D preview, independent of the display's Retina scale. */
  readonly maxRenderPixels: number;
  /** Prepare the candidate's actual shader variants before publication. False is diagnostic first-use mode. */
  readonly precompileShaders: boolean;
}

/** Shared runtime defaults. Shader/resource registration remains mandatory in both modes. */
export const PLANNING_RUNTIME_OPTIONS: Readonly<PlanningRuntimeOptions> = Object.freeze({
  verticalFieldOfView: 50,
  maxRenderPixels: 1920 * 1080,
  precompileShaders: true
});
