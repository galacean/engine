/**
 * WebGL模式。
 */
export enum WebGLMode {
  /** 自动，如果设备支持优先选择WebGL2.0，不支持 WebGL2.0 会回滚至WebGL1.0 */
  Auto = 0,
  /** 使用 WebGL2.0 */
  WebGL2 = 1,
  /** 使用 WebGL1.0 */
  WebGL1 = 2
}

/**
 * WebGLRenderer的参数选项。
 */
export interface WebGLRendererOptions extends WebGLContextAttributes {
  /** WebGL API 模式。*/
  webGLMode?: WebGLMode;
}

/**
 * WebGL渲染器实现，包含了WebGL1.0/和WebGL2.0。
 */
export class WebGLRenderer implements HardwareRenderer {
  constructor(options: WebGLRendererOptions) {}
}
