export const enum DiagnosticSeverity {
  /**
   * Reports an error.
   */
  Error = 1,
  /**
   * Reports a warning.
   */
  Warning = 2,
  /**
   * Reports an information.
   */
  Information = 3,
  /**
   * Reports a hint.
   */
  Hint = 4
}

/**
 * The shader pass property name which reference the fragment shader main function
 * @internal
 */
export const FRAG_FN_NAME = "FragmentShader";
/**
 * The shader pass property name which reference the vertex shader main function
 * @internal
 */
export const VERT_FN_NAME = "VertexShader";
/**
 * Render queue
 * @internal
 */
export const RENDER_QUEUE = "RenderQueueType";
