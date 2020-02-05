/**
 * 一组GL渲染状态控制，对应glTF里面的“technique.states”对象
 * @class
 * @private
 */
class RenderStateBlock {
  private _enable;
  private _disable;
  private _functions;

  constructor() {
    this._enable = []; // GLenum array
    this._disable = [];
    this._functions = {}; // dict object: [func name]=>args
  }

  /**
   * 使用glTF 1.0格式的数据创建
   * @param {object} cfg glTF格式的数据
   */
  createFromGLTF(cfg) {
    this._enable = cfg.enable;
    this._disable = cfg.disable;
    this._functions = cfg.functions;
  }

  /**
   * 将状态设置到GL/RenderStateManager
   * @param {RenderStateManager} stateManager
   */
  apply(stateManager) {
    //-- enable
    const enable = this._enable;
    if (enable) {
      for (const glState of enable) {
        stateManager.enable(glState);
      }
    }

    const disable = this._disable;
    if (disable) {
      for (const glState of disable) {
        stateManager.disable(glState);
      }
    }

    //-- functions
    const functions = this._functions;
    if (functions) {
      for (const name in functions) {
        const args = functions[name];
        const func = stateManager[name];
        func.apply(stateManager, args);
      } // end of for
    } // end of if
  }
}

export default RenderStateBlock;
