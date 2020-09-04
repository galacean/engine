import { Matrix3x3, Matrix, Vector2, Vector3, Vector4 } from "@alipay/o3-math";
import { DataType, RenderTechnique, Material } from "@alipay/o3-core";

import { GLShaderProgram } from "./GLShaderProgram";
import { Logger } from "@alipay/o3-core";
import { GLTexture2D } from "./GLTexture2D";
import { GLTextureCubeMap } from "./GLTextureCubeMap";
import { WebGLRenderer } from "./WebGLRenderer";
import { GLRenderStates } from "./GLRenderStates";
import { GLAsset } from "./GLAsset";

/**
 * GL 层的 Technique 资源管理和渲染调用处理
 * @private
 */
export class GLTechnique extends GLAsset {
  private _tech: RenderTechnique;
  private _activeTextureCount: number;
  private _program: GLShaderProgram;
  private _attributes;
  private _uniforms;

  constructor(rhi: WebGLRenderer, tech: RenderTechnique) {
    super(rhi, tech);
    this._tech = tech;
    this._activeTextureCount = 0;

    const gl: WebGLRenderingContext = rhi.gl;

    //-- 编译shader 或者从缓存中捞program
    this._program = GLShaderProgram.requireProgram(tech, gl);

    const glProgram = this._program.program;

    // 记录Attribute的shader location
    this._attributes = {};
    const attributes = tech.attributes;
    for (const name in attributes) {
      this._attributes[name] = {
        name,
        semantic: attributes[name].semantic,
        location: this._program.getAttribLocation(glProgram, name)
      };
    }

    // 记录Unifrom的shader location
    this._uniforms = {};
    const uniforms = tech.uniforms;
    for (const name in uniforms) {
      const loc = this._program.getUniformLocation(glProgram, name);
      if (loc !== null) {
        this._uniforms[name] = {
          name,
          location: loc
        };
      }
    } // end of for
  }

  /**
   * 释放 GL 资源
   */
  finalize(forceDispose?: boolean) {
    if (this._program && forceDispose) {
      this._program.finalize();
      this._program = null;
    }
  }

  /**
   * Shader Program 对象
   * @member {GLShaderProgram}
   */
  get program(): GLShaderProgram {
    return this._program;
  }

  /**
   * 顶点属性数组
   */
  get attributes() {
    return this._attributes;
  }

  /**
   * Unifrom 参数集合
   */
  get uniforms() {
    return this._uniforms;
  }

  /**
   * 开始渲染时调用，绑定内部 GL Program，并设定 Unifrom
   * @param {Material} mtl
   */
  begin(mtl: Material) {
    const gl = this.rhi.gl;
    const glProgram = this._program.program;

    //-- 重置内部状态变量
    this._activeTextureCount = 0;

    //-- bind program
    gl.useProgram(glProgram);

    //-- upload mtl uniforms
    const uniforms = this._uniforms;
    const assetUniforms = this._tech.uniforms;
    for (const name in assetUniforms) {
      if (uniforms.hasOwnProperty(name)) {
        const value = mtl.getValue(name);
        value != null && this._uploadUniformValue(assetUniforms[name], uniforms[name].location, value);
      }
    }

    //-- change render states
    const stateManager = this.rhi.renderStates;
    if (this._tech.states) {
      stateManager.pushStateBlock(this._tech.name);
      this._applyStates(stateManager);
    }
  }

  /**
   * 结束渲染，回复状态
   */
  end() {
    // 恢复渲染状态
    if (this._tech.states) {
      const stateManager = this.rhi.renderStates;
      stateManager.popStateBlock();
    }
  }

  /**
   * 将状态设置到GL/RenderStateManager
   * @param {GLRenderStates} stateManager
   */
  _applyStates(stateManager: GLRenderStates) {
    const states = this._tech.states;
    //-- enable
    const enable = states.enable;
    if (enable) {
      for (let i = 0, len = enable.length; i < len; i++) {
        stateManager.enable(enable[i]);
      }
    }

    const disable = states.disable;
    if (disable) {
      for (let i = 0, len = disable.length; i < len; i++) {
        stateManager.disable(disable[i]);
      }
    }

    //-- functions
    const functions = states.functions;
    if (functions) {
      for (const name in functions) {
        const args = Array.isArray(functions[name]) ? functions[name] : [functions[name]];
        const func = stateManager[name];
        func.apply(stateManager, args);
      }
    }
  }

  /**
   * 将自己的value设置到shader的uniform值之上
   * @param uniform
   * @param location
   * @param value
   * @private
   */
  private _uploadUniformValue(uniform, location, value) {
    const gl = this.rhi.gl;

    // 设置shader uniform值
    switch (uniform.type) {
      case DataType.FLOAT:
        if (value.length) gl.uniform1fv(location, value);
        else gl.uniform1f(location, value);
        break;
      case DataType.FLOAT_ARRAY:
        gl.uniform1fv(location, value);
        break;
      case DataType.INT:
        if (value.length) gl.uniform1iv(location, value);
        else gl.uniform1i(location, value);
        break;
      case DataType.INT_ARRAY:
        gl.uniform1iv(location, value);
        break;
      case DataType.FLOAT_VEC2:
        gl.uniform2f(location, value.x, value.y);
        break;
      case DataType.FLOAT_VEC2_ARRAY:
        gl.uniform2fv(location, value);
        break;
      case DataType.FLOAT_VEC3:
        gl.uniform3f(location, value.x, value.y, value.z);
        break;
      case DataType.FLOAT_VEC3_ARRAY:
        gl.uniform3fv(location, value);
        break;
      case DataType.FLOAT_VEC4:
        gl.uniform4f(location, value.x, value.y, value.z, value.w);
        break;
      case DataType.FLOAT_VEC4_ARRAY:
        gl.uniform4fv(location, value);
        break;
      case DataType.INT_VEC2:
        gl.uniform2i(location, value.x, value.y);
        break;
      case DataType.INT_VEC2_ARRAY:
        gl.uniform2iv(location, value);
        break;
      case DataType.INT_VEC3:
        gl.uniform3i(location, value.x, value.y, value.z);
        break;
      case DataType.INT_VEC3_ARRAY:
        gl.uniform3iv(location, value);
        break;
      case DataType.INT_VEC4:
        gl.uniform4i(location, value.x, value.y, value.z, value.w);
        break;
      case DataType.INT_VEC4_ARRAY:
        gl.uniform4iv(location, value);
        break;
      case DataType.FLOAT_MAT2:
        gl.uniformMatrix2fv(location, false, value.elements);
        break;
      case DataType.FLOAT_MAT2_ARRAY:
        gl.uniformMatrix2fv(location, false, value);
        break;
      case DataType.FLOAT_MAT3:
        gl.uniformMatrix3fv(location, false, value.elements);
        break;
      case DataType.FLOAT_MAT3_ARRAY:
        gl.uniformMatrix3fv(location, false, value);
        break;
      case DataType.FLOAT_MAT4:
        gl.uniformMatrix4fv(location, false, value.elements);
        break;
      case DataType.FLOAT_MAT4_ARRAY:
        gl.uniformMatrix4fv(location, false, value);
        break;
      case DataType.SAMPLER_2D: {
        const texture = value;
        this._uploadTexture(texture, location, GLTexture2D);
        break;
      }
      case DataType.SAMPLER_CUBE: {
        const texture = value;
        if (texture) {
          this._uploadTexture(texture, location, GLTextureCubeMap);
        }
        break;
      }
      default:
        Logger.warn("UNKNOWN uniform type: " + uniform.type);
        break;
    } // end of switch
  }

  /**
   * 将一个内存中的 Texture2D 对象绑定到 GL
   * @param {Texture} texture
   */
  _uploadTexture(texture, location, type) {
    const assetCache = this.rhi.assetsCache;
    const glTexture = assetCache.requireObject(texture, type);

    if (glTexture) {
      const index = this._activeTextureCount++;
      glTexture.activeBinding(index);
      this.rhi.gl.uniform1i(location, index);
    } // end of if
  }
}
