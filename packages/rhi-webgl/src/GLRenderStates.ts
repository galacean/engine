/**
 * @private
 */
export class GLRenderStates {
  private _gl: WebGLRenderingContext;
  private _parameters = {};
  /**
   * @param {WebGLRenderingContext} gl
   */
  constructor(gl: WebGLRenderingContext) {
    this._gl = gl;
    this._parameters = {}; // current gl state parameters

    /** cache */
    this._parameters[gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS] = gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS);
    this._parameters[gl.MAX_VERTEX_UNIFORM_VECTORS] = gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS);
    this._parameters[gl.MAX_VERTEX_ATTRIBS] = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
    this._parameters[gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS] = gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS);
    this._parameters[gl.MAX_TEXTURE_SIZE] = gl.getParameter(gl.MAX_TEXTURE_SIZE);

    // init blend state same as BlendState default value.
    gl.blendFuncSeparate(gl.ONE, gl.ZERO, gl.ONE, gl.ZERO);
    gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
    gl.colorMask(true, true, true, true);
    gl.blendColor(0, 0, 0, 0);
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);

    // init depth state same as DepthState default value.
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);

    // init stencil state same as StencilState default value.
    gl.disable(gl.STENCIL_TEST);
    gl.stencilFuncSeparate(gl.FRONT, gl.ALWAYS, 0, 0xff);
    gl.stencilFuncSeparate(gl.BACK, gl.ALWAYS, 0, 0xff);
    gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.KEEP);
    gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.KEEP);
    gl.stencilMask(0xff);

    // init raster state same as RasterState default value.
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(0, 0);
  }

  /**
   * Get a parameter.
   */
  getParameter(pname) {
    return this._parameters[pname];
  }
}
