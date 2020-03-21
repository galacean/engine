/**
 * 插件抹平
 * */
export interface WebGL1Extension {
  UNSIGNED_INT_24_8: number;
  createVertexArray(): WebGLVertexArrayObject | null;
  deleteVertexArray(vertexArray: WebGLVertexArrayObject | null): void;
  isVertexArray(vertexArray: WebGLVertexArrayObject | null): GLboolean;
  bindVertexArray(array: WebGLVertexArrayObject | null): void;
  drawArraysInstanced(mode: GLenum, first: GLint, count: GLsizei, instanceCount: GLsizei): void;
  drawElementsInstanced(mode: GLenum, count: GLsizei, type: GLenum, offset: GLintptr, instanceCount: GLsizei): void;
  vertexAttribDivisor(index: GLuint, divisor: GLuint): void;
}
