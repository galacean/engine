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

/** The shader pass property name which reference the fragment shader main function */
export const FRAG_FN_NAME = "FragmentShader";
/** The shader pass property name which reference the vertex shader main function */
export const VERT_FN_NAME = "VertexShader";
