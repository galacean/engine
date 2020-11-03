import { Entity } from "@oasis-engine/core";
import DrawCallHook from "./hooks/DrawCallHook";
import ShaderHook from "./hooks/ShaderHook";
import TextureHook from "./hooks/TextureHook";

declare global {
  interface Performance {
    memory: any;
  }
}

/**
 * @class Core
 */
export default class Core {
  private gl: WebGLRenderingContext | WebGL2RenderingContext;
  private drawCallHook: DrawCallHook;
  private textureHook: TextureHook;
  private shaderHook: ShaderHook;
  private samplingFrames: number = 60;
  private samplingIndex: number = 0;
  private now: number;

  constructor(gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.gl = gl;
    this.hook(gl);
  }

  private hook(gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.drawCallHook = new DrawCallHook(gl);
    this.textureHook = new TextureHook(gl);
    this.shaderHook = new ShaderHook(gl);
  }

  public reset() {
    this.drawCallHook && this.drawCallHook.reset();
  }

  public release() {
    this.drawCallHook && this.drawCallHook.release();
    this.textureHook && this.textureHook.release();
    this.shaderHook && this.shaderHook.release();
  }

  public update() {
    let now = performance.now();
    let delta = now - this.now;
    this.now = now;

    if (this.samplingIndex !== this.samplingFrames) {
      this.reset();
      this.samplingIndex++;
      return;
    }

    this.samplingIndex = 0;

    let data = {
      fps: delta ? (1000 / delta) >> 0 : 0,
      memory: performance.memory && (performance.memory.usedJSHeapSize / 1048576) >> 0,
      drawCall: this.drawCallHook.drawCall,
      triangles: this.drawCallHook.triangles,
      //@ts-ignorets-ignore
      nodes: Entity._entitys.length,
      lines: this.drawCallHook.lines,
      points: this.drawCallHook.points,
      textures: this.textureHook.textures,
      shaders: this.shaderHook.shaders,
      webglContext:
        window.hasOwnProperty("WebGL2RenderingContext") && this.gl instanceof WebGL2RenderingContext ? "2.0" : "1.0"
    };

    this.reset();

    return data;
  }
}
