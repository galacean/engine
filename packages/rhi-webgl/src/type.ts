/**
 * 插件抹平
 * */
export interface WebGLExtension {
  UNSIGNED_INT_24_8: GLenum;
  MAX_SAMPLES: GLenum;
  RGBA8: GLenum;
  DEPTH_COMPONENT32F: GLenum;
  READ_FRAMEBUFFER: GLenum;
  DRAW_FRAMEBUFFER: GLenum;

  createVertexArray(): WebGLVertexArrayObject | null;
  deleteVertexArray(vertexArray: WebGLVertexArrayObject | null): void;
  isVertexArray(vertexArray: WebGLVertexArrayObject | null): GLboolean;
  bindVertexArray(array: WebGLVertexArrayObject | null): void;

  renderbufferStorageMultisample(
    target: GLenum,
    samples: GLsizei,
    internalformat: GLenum,
    width: GLsizei,
    height: GLsizei
  ): void;
  blitFramebuffer(
    srcX0: GLint,
    srcY0: GLint,
    srcX1: GLint,
    srcY1: GLint,
    dstX0: GLint,
    dstY0: GLint,
    dstX1: GLint,
    dstY1: GLint,
    mask: GLbitfield,
    filter: GLenum
  ): void;

  drawArraysInstanced(mode: GLenum, first: GLint, count: GLsizei, instanceCount: GLsizei): void;
  drawElementsInstanced(mode: GLenum, count: GLsizei, type: GLenum, offset: GLintptr, instanceCount: GLsizei): void;
  vertexAttribDivisor(index: GLuint, divisor: GLuint): void;
  drawBuffers(buffers: Iterable<GLenum>): void;
}
