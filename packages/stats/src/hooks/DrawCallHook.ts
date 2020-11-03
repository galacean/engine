import { log, errorLog } from "../log";

/**
 * @class DrawCallHook
 */
export default class DrawCallHook {
  public drawCall: number = 0;
  public triangles: number = 0;
  public lines: number = 0;
  public points: number = 0;
  private hooked: boolean;
  private realDrawElements: any;
  private realDrawArrays: any;
  private gl: WebGLRenderingContext | WebGL2RenderingContext;

  constructor(gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.realDrawElements = gl.drawElements;
    this.realDrawArrays = gl.drawArrays;

    gl.drawElements = this.hookedDrawElements.bind(this);
    gl.drawArrays = this.hookedDrawArrays.bind(this);

    this.hooked = true;
    this.gl = gl;

    log(`DrawCall is hooked.`);
  }

  private hookedDrawElements(mode: number, count: number, type: number, offset: number) {
    this.realDrawElements.call(this.gl, mode, count, type, offset);
    this.update(count, mode);
  }

  private hookedDrawArrays(mode: number, first: number, count: number) {
    this.realDrawArrays.call(this.gl, mode, first, count);
    this.update(count, mode);
  }

  private update(count: number, mode: number) {
    const { gl } = this;

    this.drawCall++;

    switch (mode) {
      case gl.TRIANGLES:
        this.triangles += count / 3;
        break;

      case gl.TRIANGLE_STRIP:
      case gl.TRIANGLE_FAN:
        this.triangles += count - 2;
        break;

      case gl.LINES:
        this.lines += count / 2;
        break;

      case gl.LINE_STRIP:
        this.lines += count - 1;
        break;

      case gl.LINE_LOOP:
        this.lines += count;
        break;

      case gl.POINTS:
        this.points += count;
        break;

      default:
        errorLog(`Unknown draw mode: ${mode}`);
        break;
    }
  }

  public reset(): void {
    this.drawCall = 0;
    this.triangles = 0;
    this.lines = 0;
    this.points = 0;
  }

  public release(): void {
    if (this.hooked) {
      this.gl.drawElements = this.realDrawElements;
      this.gl.drawArrays = this.realDrawArrays;
    }

    this.hooked = false;
  }
}
