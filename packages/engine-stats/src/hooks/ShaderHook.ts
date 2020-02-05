import { log, errorLog } from "../log";

/**
 * @class ShaderHook
 */
export default class ShaderHook {
  public shaders: number = 0;
  private realAttachShader: any;
  private realDetachShader: any;
  private hooked: boolean;
  private gl: WebGLRenderingContext;

  constructor(gl: WebGLRenderingContext) {
    this.realAttachShader = gl.attachShader;
    this.realDetachShader = gl.detachShader;

    gl.attachShader = this.hookedAttachShader.bind(this);
    gl.detachShader = this.hookedDetachShader.bind(this);

    this.hooked = true;
    this.gl = gl;

    log(`Shader is hooked.`);
  }

  private hookedAttachShader(program: any, shader: any) {
    this.realAttachShader.call(this.gl, program, shader);

    this.shaders++;

    log(`AttachShader:`, shader, `shaders: ${this.shaders}`);
  }

  private hookedDetachShader(program: any, shader: any) {
    this.realDetachShader.call(this.gl, program, shader);

    this.shaders--;

    log(`DetachShader. shaders: ${this.shaders}`);
  }

  public reset() {
    this.shaders = 0;
  }

  public release() {
    if (this.hooked) {
      this.gl.attachShader = this.realAttachShader;
      this.gl.detachShader = this.realDetachShader;
    }

    this.hooked = false;
  }
}
