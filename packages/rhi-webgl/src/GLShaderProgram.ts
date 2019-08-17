import { Logger } from '@alipay/o3-base';

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

  private _gl: WebGLRenderingContext;
  private _vertexShader: WebGLShader;
  private _fragmentShader: WebGLShader;
  private _program: WebGLProgram;

  constructor(gl: WebGLRenderingContext) {

    this._gl = gl;

    // {WebGLShader}
    this._vertexShader = null;

    // {WebGLShader}
    this._fragmentShader = null;

    // {WebGLProgram}
    this._program = null;

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

    if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {

      Logger.error('Could not link WebGL program. \n' + gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return false;

    }

    // 更新内部变量
    this._vertexShader = vertexShader;
    this._fragmentShader = fragmentShader;
    this._program = program;
    return true;

  }


  /**
   * 编译Shader
   * @param {GLenum} shaderType
   * @param {string} shaderSource
   * @private
   */
  _compileShader(shaderType, shaderSource) {

    const gl = this._gl;
    const shader = gl.createShader(shaderType);
    gl.shaderSource(shader, shaderSource);
    gl.compileShader(shader);

    if (gl.isContextLost()) {

      Logger.error('Contex lost while compiling shader.');
      gl.deleteShader(shader);
      return null;

    }

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {

      Logger.error(`Could not compile WebGL shader.\n${addLineNum(shaderSource)}\n${gl.getShaderInfoLog(shader)}`);
      // Logger.error( gl.getShaderInfoLog( shader ) );

      gl.deleteShader(shader);
      return null;

    }
    return shader;

  }

  /**
   * 释放GL资源对象
   */
  finalize() {

    const gl = this._gl;
    if (this._vertexShader) {

      gl.deleteShader(this._vertexShader);
      this._vertexShader = null;

    }

    if (this._fragmentShader) {

      gl.deleteShader(this._fragmentShader);
      this._fragmentShader = null;

    }

    if (this._program) {

      gl.deleteProgram(this._program);
      this._program = null;

    }

  }

}

