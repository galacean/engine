import { GLPrimitive } from "./GLPrimitive";
import { GLRenderHardware } from "./GLRenderHardware";
import { Primitive } from "@alipay/o3-primitive";
import { GLTechnique } from "./GLTechnique";

/**
 * 基于 VAO 的 GLPrimitive
 * */
export class GLVAOPrimitive extends GLPrimitive {
  private vao: Map<number, WebGLVertexArrayObject>;

  constructor(rhi: GLRenderHardware, primitive: Primitive) {
    super(rhi, primitive);
    this.vao = new Map();
  }

  /** 注册 VAO */
  private registerVAO(tech: GLTechnique) {
    const gl = this.rhi.gl;
    const vao = gl.createVertexArray();

    /** register VAO */
    gl.bindVertexArray(vao);
    if (this._glIndexBuffer) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._glIndexBuffer);
    }
    this.bindBufferAndAttrib(tech);

    /** unbind */
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    this.disableAttrib();

    this.vao.set(tech.cacheID, vao);
  }

  /**
   * 使用 VAO 执行绘制操作
   * @param {GLTechnique} tech
   */
  draw(tech: GLTechnique) {
    const gl = this.rhi.gl;
    const primitive = this._primitive;

    /** prepare BO */
    this.prepareBuffers();

    /** render */
    if (!this.vao.has(tech.cacheID)) {
      this.registerVAO(tech);
    }
    const vao = this.vao.get(tech.cacheID);
    gl.bindVertexArray(vao);

    if (primitive.isInstanced) {
      this._renderer.renderInstances(primitive, this._glIndexBuffer);
    } else {
      this._renderer.render(primitive, this._glIndexBuffer);
    }

    gl.bindVertexArray(null);
  }

  /**
   * 释放 GL 资源
   */
  finalize() {
    super.finalize();
    const gl = this.rhi.gl;
    // 释放 vao
    this.vao.forEach(vao => {
      gl.deleteVertexArray(vao);
    });
  }
}
