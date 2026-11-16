/**
 * WebGL state shared with an XR session.
 */
export interface IXRGraphicsBinding {
  readonly isWebGL2: boolean;
  readonly gl: WebGLRenderingContext | WebGL2RenderingContext;

  /** @internal */
  _mainFrameBuffer: WebGLFramebuffer | null;
  /** @internal */
  _mainFrameWidth: number;
  /** @internal */
  _mainFrameHeight: number;
}
