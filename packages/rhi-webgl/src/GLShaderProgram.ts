import {Logger} from '@alipay/o3-base';
import {RenderTechnique} from "@alipay/o3-material";

interface UniformCache {
  [key: string]: WebGLUniformLocation | null
}

interface AttributeCache {
  [key: string]: GLint
}

let programList: Array<GLShaderProgram> = [];

function addLineNum(str) {

  const lines = str.split('\n');
  const limitLength = (lines.length + 1).toString().length + 6;
  let prefix;
  return lines.map((line, index) => {

    prefix = `0:${index + 1}`;
    if (prefix.length >= limitLength)
      return prefix.substring(0, limitLength) + line;

    for (let i = 0; i < limitLength - prefix.length; i++)
      prefix += ' ';

    return prefix + line;

  }).join('\n');

}

/**
 * GL的Shader+Program的包装，用于对象的绘制. 对应glTF中的一个program对象
 * @class
 * @private
 */
export class GLShaderProgram {

  /**
   * 从缓存中读取program,如果没有则新建
   * @param {RenderTechnique} tech
   * @param {WebGLRenderingContext} gl
   * @return {GLShaderProgram}
   * */
  static requireProgram(tech: RenderTechnique, gl: WebGLRenderingContext): GLShaderProgram {
    let program: GLShaderProgram = null;

    programList.some(p => {
      if (p._vertexShaderSource === tech.vertexShader && p._fragmentShaderSource === tech.fragmentShader) {
        program = p;
        return true;
      }
    });

    if (!program) {
      program = new GLShaderProgram(gl);
      program.createFromSource(
        tech.vertexShader,
        tech.fragmentShader,
        tech.attribLocSet
      );
      programList.push(program);

    }

    return program;

  }

  /**
   * 从缓存中释放program
   * @param {GLShaderProgram} program
   * */
  static releaseProgram(program: GLShaderProgram) {

    let index = programList.indexOf(program);
    if (index !== -1) {
      programList.splice(index, 1);
    }

  }

  private _gl: WebGLRenderingContext;
  private _vertexShader: WebGLShader;
  private _fragmentShader: WebGLShader;
  private _vertexShaderSource: string;
  private _fragmentShaderSource: string;
  private _program: WebGLProgram;
  private _attributeCache: AttributeCache;
  private _uniformCache: UniformCache;

  constructor(gl: WebGLRenderingContext) {

    this._gl = gl;

    // {WebGLShader}
    this._vertexShader = null;

    // {WebGLShader}
    this._fragmentShader = null;

    // shader source
    this._vertexShaderSource = null;
    this._fragmentShaderSource = null;

    // {WebGLProgram}
    this._program = null;

    // location cache
    this._attributeCache = {};
    this._uniformCache = {};

  }

  /**
   * WebGLProgram对象
   * @member {WebGLProgram}
   * @readonly
   */
  get program() {

    return this._program;

  }

  /**
   * 使用源代码编译、链接Shader Program
   * @param {string} vertexSource 顶点 Shader 代码
   * @param {string} fragmentSource 片元 Shader 代码
   */
  createFromSource(vertexSource, fragmentSource, attribLocSet) {

    const gl = this._gl;

    // 编译两个Shader
    const vertexShader = this._compileShader(gl.VERTEX_SHADER, vertexSource);
    if (!vertexShader) {

      return false;

    }

    const fragmentShader = this._compileShader(gl.FRAGMENT_SHADER, fragmentSource);
    if (!fragmentShader) {

      return false;

    }

    // 链接Program
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    if (attribLocSet) {

      for (const attribName in attribLocSet) {

        gl.bindAttribLocation(program, attribLocSet[attribName], attribName);

      }

    }
    gl.linkProgram(program);
    gl.validateProgram(program);

    if (gl.isContextLost()) {

      Logger.error('Contex lost while linking program.');
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return null;

    }

    // debug开启才进行消耗性能的能力检测
    if (Logger.isEnabled) {

      if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {

        Logger.error('Could not link WebGL program. \n' + gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return false;

      }
    }


    // 更新内部变量
    this._vertexShader = vertexShader;
    this._fragmentShader = fragmentShader;
    this._vertexShaderSource = vertexSource;
    this._fragmentShaderSource = fragmentSource;
    this._program = program;
    return true;

  }


  /**
   * 编译Shader
   * @param {GLenum} shaderType
   * @param {string} shaderSource
   * @private
   */
  private _compileShader(shaderType, shaderSource) {

    const gl = this._gl;
    const shader = gl.createShader(shaderType);
    gl.shaderSource(shader, shaderSource);
    gl.compileShader(shader);

    if (gl.isContextLost()) {

      Logger.error('Contex lost while compiling shader.');
      gl.deleteShader(shader);
      return null;

    }

    // debug开启才进行消耗性能的能力检测
    if (Logger.isEnabled) {

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {

        Logger.error(`Could not compile WebGL shader.\n${addLineNum(shaderSource)}\n${gl.getShaderInfoLog(shader)}`);
        // Logger.error( gl.getShaderInfoLog( shader ) );

        gl.deleteShader(shader);
        return null;

      }

    }

    return shader;

  }

  /**
   * getAttribLocation读取速度比较慢，增加缓存机制
   * */
  getAttribLocation(glProgram: WebGLProgram, name: string): GLint {
    if (this._attributeCache.hasOwnProperty(name)) {
      return this._attributeCache[name];
    } else {
      return this._attributeCache[name] = this._gl.getAttribLocation(glProgram, name);
    }

  }

  /**
   * getUniformLocation读取速度比较慢，增加缓存机制
   * */
  getUniformLocation(glProgram: WebGLProgram, name: string): WebGLUniformLocation | null {

    if (this._uniformCache.hasOwnProperty(name)) {
      return this._uniformCache[name];
    } else {
      return this._uniformCache[name] = this._gl.getUniformLocation(glProgram, name);
    }

  }

  /**
   * 释放GL资源对象
   */
  finalize() {

    const gl = this._gl;
    if (this._vertexShader) {

      gl.deleteShader(this._vertexShader);

    }

    if (this._fragmentShader) {

      gl.deleteShader(this._fragmentShader);

    }

    if (this._program) {

      gl.deleteProgram(this._program);

    }

    this._vertexShader = null;
    this._fragmentShader = null;
    this._vertexShaderSource = null;
    this._fragmentShaderSource = null;
    this._program = null;
    this._attributeCache = {};
    this._uniformCache = {};
    GLShaderProgram.releaseProgram(this);

  }

}
