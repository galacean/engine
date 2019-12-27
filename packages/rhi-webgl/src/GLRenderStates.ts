/**
 * 管理渲染状态，主要功能：设置默认渲染状态，cache当前渲染状态，管理渲染状态stack（供恢复用）
 * @class
 * @private
 */
export class GLRenderStates {
  private _gl: WebGLRenderingContext;
  private _stateStack = [];
  private _parameters = {};

  /**
   * @param {WebGLRenderingContext} gl
   */
  constructor(gl: WebGLRenderingContext) {
    this._gl = gl;
    this._stateStack = []; // stat block stack
    this._parameters = {}; // current gl state parameters

    //-- 初始化，设置所有渲染状态为默认值 ---------------

    //-- cache
    this._parameters[gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS] = gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS);

    //-- enable/disable
    this._parameters[gl.BLEND] = false;
    gl.disable(gl.BLEND);

    this._parameters[gl.CULL_FACE] = true;
    gl.enable(gl.CULL_FACE);

    this._parameters[gl.DEPTH_TEST] = true;
    gl.enable(gl.DEPTH_TEST);

    this._parameters[gl.DITHER] = false;
    gl.disable(gl.DITHER);

    this._parameters[gl.POLYGON_OFFSET_FILL] = false;
    gl.disable(gl.POLYGON_OFFSET_FILL);

    this._parameters[gl.SAMPLE_ALPHA_TO_COVERAGE] = false;
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);

    this._parameters[gl.SAMPLE_COVERAGE] = false;
    gl.disable(gl.SAMPLE_COVERAGE);

    this._parameters[gl.SCISSOR_TEST] = false;
    gl.disable(gl.SCISSOR_TEST);

    this._parameters[gl.STENCIL_TEST] = false;
    gl.disable(gl.STENCIL_TEST);

    //-- colorMask
    this._parameters[gl.COLOR_WRITEMASK] = [true, true, true, true];
    gl.colorMask(true, true, true, true);

    //-- depthMask
    this._parameters[gl.DEPTH_WRITEMASK] = true;
    gl.depthMask(true);

    //-- blendFunc
    this._parameters[gl.BLEND_SRC_RGB] = gl.ONE;
    this._parameters[gl.BLEND_SRC_ALPHA] = gl.ONE;
    this._parameters[gl.BLEND_DST_RGB] = gl.ZERO;
    this._parameters[gl.BLEND_DST_ALPHA] = gl.ZERO;
    gl.blendFunc(gl.ONE, gl.ZERO);

    this._parameters[gl.BLEND_EQUATION_RGB] = gl.FUNC_ADD;
    this._parameters[gl.BLEND_EQUATION_ALPHA] = gl.FUNC_ADD;

    //-- cullFace
    this._parameters[gl.CULL_FACE_MODE] = gl.BACK;
    gl.cullFace(gl.BACK);

    //-- frontFace
    this._parameters[gl.FRONT_FACE] = gl.CCW;
    gl.frontFace(gl.CCW);

    //-- depthFunc
    this._parameters[gl.DEPTH_FUNC] = gl.LESS;
    gl.depthFunc(gl.LESS);

    //-- depthRange
    this._parameters[gl.DEPTH_RANGE] = [0, 1];
    gl.depthRange(0, 1);

    //-- polygonOffset
    this._parameters[gl.POLYGON_OFFSET_FACTOR] = 0;
    this._parameters[gl.POLYGON_OFFSET_UNITS] = 0;
    gl.polygonOffset(0, 0);

    //-- scissor
    this._parameters[gl.SCISSOR_BOX] = [0, 0, gl.canvas.width, gl.canvas.height];

    //-- stencilFunc
    this._parameters[gl.STENCIL_FUNC] = gl.ALWAYS;
    this._parameters[gl.STENCIL_VALUE_MASK] = 0xff;
    this._parameters[gl.STENCIL_REF] = 0;
    gl.stencilFunc(gl.ALWAYS, 0, 0xff);

    // -- stencilMask
    this._parameters[gl.STENCIL_WRITEMASK] = 0xff;
    gl.stencilMask(0xff);

    //-- stencilOp
    this._parameters[gl.STENCIL_FAIL] = gl.KEEP;
    this._parameters[gl.STENCIL_PASS_DEPTH_FAIL] = gl.KEEP;
    this._parameters[gl.STENCIL_PASS_DEPTH_PASS] = gl.KEEP;
  }

  /**
   * 取得渲染状态参数：any gl.getParameter(pname);
   * @param {GLenum} pname
   */
  getParameter(pname) {
    return this._parameters[pname];
  }

  /**
   * 新建一个State Block（渲染单个对象时的一组渲染状态），并放入状态栈
   */
  pushStateBlock(_name) {
    const stateBlock = {
      name: _name,
      states: []
    };
    this._stateStack.push(stateBlock);
  }

  /**
   * 取出栈顶的State Block，并用来恢复当前的渲染状态
   */
  popStateBlock() {
    const stateBlock = this._stateStack.pop();

    //-- 恢复渲染状态
    for (const state of stateBlock.states) {
      const stateFunc = state.func;
      const stateArgs = state.args;
      const parameters = state.parameters;
      stateFunc.apply(this._gl, stateArgs);
      for (const param in parameters) {
        this._parameters[param] = parameters[param];
      }
    }
  }

  /**
   * 取得当前状态栈的顶部对象
   * @return {Object}
   * @private
   */
  _getStateStackTop() {
    const count = this._stateStack.length;
    if (count > 0) {
      return this._stateStack[count - 1];
    } else {
      return null;
    }
  }

  /**
   * 将一个渲染状态放入栈顶的State Block
   * @param {Function} func
   * @param {Array} args
   * @private
   */
  _pushState(_func, _args, _param) {
    const stateBlock = this._getStateStackTop();
    if (stateBlock) {
      stateBlock.states.push({
        func: _func,
        args: _args,
        parameters: _param
      });
    }
  }

  /**
   * 设置渲染状态：void gl.enable(cap);
   * @param {GLenum} cap
   */
  enable(cap) {
    const currentState = this._parameters[cap];
    if (currentState === true) return;

    this._parameters[cap] = true;
    this._gl.enable(cap);

    const pushParam = {};
    pushParam[cap] = false;
    this._pushState(this._gl.disable, [cap], pushParam);
  }

  /**
   * 设置渲染状态：void gl.disable(cap);
   * @param {GLenum} cap
   */
  disable(cap) {
    const currentState = this._parameters[cap];
    if (currentState === false) return;

    this._parameters[cap] = false;
    this._gl.disable(cap);

    const pushParam = {};
    pushParam[cap] = true;
    this._pushState(this._gl.enable, [cap], pushParam);
  }

  /**
   * 设置渲染状态：void gl.blendFunc(sfactor, dfactor);
   * @param {GLenum} sfactor
   * @param {GLenum} dfactor
   */
  blendFunc(sfactor, dfactor) {
    const gl = this._gl;

    const param = this._parameters;
    if (
      param[gl.BLEND_SRC_RGB] === sfactor &&
      param[gl.BLEND_SRC_ALPHA] === sfactor &&
      param[gl.BLEND_DST_RGB] === dfactor &&
      param[gl.BLEND_DST_ALPHA] === dfactor
    )
      return;

    const pushArgs = [
      param[gl.BLEND_SRC_RGB],
      param[gl.BLEND_DST_RGB],
      param[gl.BLEND_SRC_ALPHA],
      param[gl.BLEND_DST_ALPHA]
    ];
    const pushParam = {};
    pushParam[gl.BLEND_SRC_RGB] = param[gl.BLEND_SRC_RGB];
    pushParam[gl.BLEND_DST_RGB] = param[gl.BLEND_DST_RGB];
    pushParam[gl.BLEND_SRC_ALPHA] = param[gl.BLEND_SRC_ALPHA];
    pushParam[gl.BLEND_DST_ALPHA] = param[gl.BLEND_DST_ALPHA];
    this._pushState(gl.blendFuncSeparate, pushArgs, pushParam);

    param[gl.BLEND_SRC_RGB] = sfactor;
    param[gl.BLEND_SRC_ALPHA] = sfactor;
    param[gl.BLEND_DST_RGB] = dfactor;
    param[gl.BLEND_DST_ALPHA] = dfactor;
    gl.blendFunc(sfactor, dfactor);
  }

  /**
   * 设置渲染状态：void gl.blendFuncSeparate(srcRGB, dstRGB, srcAlpha, dstAlpha);
   * @param {GLenum} srcRGB
   * @param {GLenum} dstRGB
   * @param {GLenum} srcAlpha
   * @param {GLenum} dstAlpha
   */
  blendFuncSeparate(srcRGB, dstRGB, srcAlpha, dstAlpha) {
    const gl = this._gl;

    const param = this._parameters;
    if (
      param[gl.BLEND_SRC_RGB] === srcRGB &&
      param[gl.BLEND_SRC_ALPHA] === srcAlpha &&
      param[gl.BLEND_DST_RGB] === dstRGB &&
      param[gl.BLEND_DST_ALPHA] === dstAlpha
    )
      return;

    const pushArgs = [
      param[gl.BLEND_SRC_RGB],
      param[gl.BLEND_DST_RGB],
      param[gl.BLEND_SRC_ALPHA],
      param[gl.BLEND_DST_ALPHA]
    ];
    const pushParam = {};
    pushParam[gl.BLEND_SRC_RGB] = param[gl.BLEND_SRC_RGB];
    pushParam[gl.BLEND_DST_RGB] = param[gl.BLEND_DST_RGB];
    pushParam[gl.BLEND_SRC_ALPHA] = param[gl.BLEND_SRC_ALPHA];
    pushParam[gl.BLEND_DST_ALPHA] = param[gl.BLEND_DST_ALPHA];
    this._pushState(gl.blendFuncSeparate, pushArgs, pushParam);

    param[gl.BLEND_SRC_RGB] = srcRGB;
    param[gl.BLEND_SRC_ALPHA] = srcAlpha;
    param[gl.BLEND_DST_RGB] = dstRGB;
    param[gl.BLEND_DST_ALPHA] = dstAlpha;
    gl.blendFuncSeparate(srcRGB, dstRGB, srcAlpha, dstAlpha);
  }

  /**
   * void gl.blendEquationSeparate(modeRGB, modeAlpha);
   * @param {GLenum} modeRGB
   * @param {GLenum} modeAlpha
   */
  blendEquationSeparate(modeRGB, modeAlpha) {
    const gl = this._gl;
    const param = this._parameters;

    if (param[gl.BLEND_EQUATION_RGB] === modeRGB && param[gl.BLEND_EQUATION_ALPHA] === modeAlpha) return;

    const pushArgs = [param[gl.BLEND_EQUATION_RGB], param[gl.BLEND_EQUATION_ALPHA]];
    const pushParam = {};
    pushParam[gl.BLEND_EQUATION_RGB] = param[gl.BLEND_EQUATION_RGB];
    pushParam[gl.BLEND_EQUATION_ALPHA] = param[gl.BLEND_EQUATION_ALPHA];
    this._pushState(gl.blendEquationSeparate, pushArgs, pushParam);

    param[gl.BLEND_EQUATION_RGB] = modeRGB;
    param[gl.BLEND_EQUATION_ALPHA] = modeAlpha;
    gl.blendEquationSeparate(modeRGB, modeAlpha);
  }

  /**
   * 控制颜色通道释放写入Frame Buffer
   * @param {boolean} red 红色通道是否写入
   * @param {boolean} green 绿色通道是否写入
   * @param {boolean} blue 蓝色通道是否写入
   * @param {boolean} alpha 透明通道是否写入
   */
  colorMask(red: boolean, green: boolean, blue: boolean, alpha: boolean) {
    const gl = this._gl;
    const pushParam = {};
    pushParam[gl.COLOR_WRITEMASK] = this._parameters[gl.COLOR_WRITEMASK];
    this._pushState(gl.colorMask, this._parameters[gl.COLOR_WRITEMASK], pushParam);

    this._parameters[gl.COLOR_WRITEMASK] = [red, green, blue, alpha];
    gl.colorMask(red, green, blue, alpha);
  }

  /**
   * 是否写入深度缓冲
   * @param {boolean} flag
   */
  depthMask(flag) {
    const gl = this._gl;

    if (this._parameters[gl.DEPTH_WRITEMASK] === flag) return;

    const pushParam = {};
    pushParam[gl.DEPTH_WRITEMASK] = this._parameters[gl.DEPTH_WRITEMASK];
    this._pushState(gl.depthMask, [this._parameters[gl.DEPTH_WRITEMASK]], pushParam);

    this._parameters[gl.DEPTH_WRITEMASK] = flag;
    gl.depthMask(flag);
  }

  /**
   * 设置渲染状态：void gl.cullFace(mode);
   * @param {GLenum} mode
   */
  cullFace(mode: GLenum) {
    const gl = this._gl;

    if (this._parameters[gl.CULL_FACE_MODE] === mode) return;

    const pushParam = {};
    pushParam[gl.CULL_FACE_MODE] = this._parameters[gl.CULL_FACE_MODE];
    this._pushState(gl.cullFace, [this._parameters[gl.CULL_FACE_MODE]], pushParam);

    this._parameters[gl.CULL_FACE_MODE] = mode;
    gl.cullFace(mode);
  }

  /**
   * 设置渲染状态：void gl.frontFace(mode);
   * @param {GLenum} mode
   */
  frontFace(mode: GLenum) {
    const gl = this._gl;

    if (this._parameters[gl.FRONT_FACE] === mode) return;

    const pushParam = {};
    pushParam[gl.FRONT_FACE] = this._parameters[gl.FRONT_FACE];
    this._pushState(gl.frontFace, [this._parameters[gl.FRONT_FACE]], pushParam);

    this._parameters[gl.FRONT_FACE] = mode;
    gl.frontFace(mode);
  }

  /**
   * 设置渲染状态：void gl.depthFunc(func);
   * @param {GLenum} func
   */
  depthFunc(func: GLenum) {
    const gl = this._gl;

    if (this._parameters[gl.DEPTH_FUNC] === func) return;

    const pushParam = {};
    pushParam[gl.DEPTH_FUNC] = this._parameters[gl.DEPTH_FUNC];
    this._pushState(gl.depthFunc, [this._parameters[gl.DEPTH_FUNC]], pushParam);

    this._parameters[gl.DEPTH_FUNC] = func;
    gl.depthFunc(func);
  }

  /**
   * 设置渲染状态：void gl.depthRange(zNear, zFar);
   * @param {GLclampf} zNear
   * @param {GLclampf} zFar
   */
  depthRange(zNear, zFar) {
    const gl = this._gl;
    const currentValue = this._parameters[gl.DEPTH_RANGE];

    if (currentValue[0] === zNear && currentValue[1] === zFar) return;

    const pushParam = {};
    pushParam[gl.DEPTH_RANGE] = currentValue;
    this._pushState(gl.depthRange, [this._parameters[gl.DEPTH_RANGE]], pushParam);

    this._parameters[gl.DEPTH_RANGE] = [zNear, zFar];
    gl.depthRange(zNear, zFar);
  }

  /**
   * void gl.polygonOffset(factor, units);
   * @param {GLfloat} factor
   * @param {GLfloat} units
   */
  polygonOffset(factor, units) {
    const gl = this._gl;
    if (this._parameters[gl.POLYGON_OFFSET_FACTOR] === factor && this._parameters[gl.POLYGON_OFFSET_UNITS] === units)
      return;

    const pushParam = {};
    pushParam[gl.POLYGON_OFFSET_FACTOR] = this._parameters[gl.POLYGON_OFFSET_FACTOR];
    pushParam[gl.POLYGON_OFFSET_UNITS] = this._parameters[gl.POLYGON_OFFSET_UNITS];
    this._pushState(
      gl.polygonOffset,
      [this._parameters[gl.POLYGON_OFFSET_FACTOR], this._parameters[gl.POLYGON_OFFSET_UNITS]],
      pushParam
    );

    this._parameters[gl.POLYGON_OFFSET_FACTOR] = factor;
    this._parameters[gl.POLYGON_OFFSET_UNITS] = units;
    gl.polygonOffset(factor, units);
  }

  /**
   * 设置渲染状态：void gl.scissor(x, y, width, height);
   * @param {GLint} x
   * @param {GLint} y
   * @param {GLsizei} width
   * @param {GLsizei} height
   */
  scissor(x, y, width, height) {
    const gl = this._gl;

    const box = this._parameters[gl.SCISSOR_BOX];
    if (box[0] === x && box[1] === y && box[2] === width && box[3] === height) return;

    const pushParam = {};
    pushParam[gl.SCISSOR_BOX] = box;
    this._pushState(gl.scissor, box, pushParam);

    this._parameters[gl.SCISSOR_BOX] = [x, y, width, height];
    gl.scissor(x, y, width, height);
  }

  /**
   * 设置渲染状态：void gl.stencilFunc(func, ref, mask);
   * @param {GLenum} func
   * @param {GLint} ref
   * @param {GLint} mask
   */
  stencilFunc(func: GLenum, ref: GLint, mask: GLint) {
    const gl = this._gl;

    if (
      this._parameters[gl.STENCIL_FUNC] === func &&
      this._parameters[gl.STENCIL_REF] === ref &&
      this._parameters[gl.STENCIL_VALUE_MASK] === mask
    )
      return;

    const pushArgs = [
      this._parameters[gl.STENCIL_FUNC],
      this._parameters[gl.STENCIL_REF],
      this._parameters[gl.STENCIL_VALUE_MASK]
    ];
    const pushParam = {};
    pushParam[gl.STENCIL_FUNC] = pushArgs[0];
    pushParam[gl.STENCIL_REF] = pushArgs[1];
    pushParam[gl.STENCIL_VALUE_MASK] = pushArgs[2];

    this._parameters[gl.STENCIL_FUNC] = func;
    this._parameters[gl.STENCIL_REF] = ref;
    this._parameters[gl.STENCIL_VALUE_MASK] = mask;
    gl.stencilFunc(func, ref, mask);
  }

  /**
   * 设置渲染状态：void gl.stencilOp(fail, zfail, zpass);
   * @param {GLenum} fail
   * @param {GLenum} zfail
   * @param {GLenum} zpass
   */
  stencilOp(fail: GLenum, zfail: GLenum, zpass: GLenum) {
    const gl = this._gl;

    if (
      this._parameters[gl.STENCIL_FAIL] === fail &&
      this._parameters[gl.STENCIL_PASS_DEPTH_FAIL] === zfail &&
      this._parameters[gl.STENCIL_PASS_DEPTH_PASS] === zpass
    )
      return;

    const pushArgs = [
      this._parameters[gl.STENCIL_FAIL],
      this._parameters[gl.STENCIL_PASS_DEPTH_FAIL],
      this._parameters[gl.STENCIL_PASS_DEPTH_PASS]
    ];
    const pushParam = {};
    pushParam[gl.STENCIL_FAIL] = pushArgs[0];
    pushParam[gl.STENCIL_PASS_DEPTH_FAIL] = pushArgs[1];
    pushParam[gl.STENCIL_PASS_DEPTH_PASS] = pushArgs[2];

    this._parameters[gl.STENCIL_FAIL] = fail;
    this._parameters[gl.STENCIL_BACK_PASS_DEPTH_FAIL] = zfail;
    this._parameters[gl.STENCIL_PASS_DEPTH_PASS] = zpass;
    gl.stencilOp(fail, zfail, zpass);
  }
}
