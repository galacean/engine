import { Logger, UpdateType, GLCapabilityType } from "@alipay/o3-base";
import { Primitive } from "@alipay/o3-primitive";
import { GLRenderHardware } from "./GLRenderHardware";
import { GLTechnique } from "./GLTechnique";
import { GLAsset } from "./GLAsset";
import { GLBufferRenderer } from "./GLBufferRenderer";

/**
 * Primtive 相关的 GL 资源管理，主要是 WebGLBuffer 对象
 * @private
 */
export class GLPrimitive extends GLAsset {
  protected readonly _primitive;
  protected _glIndexBuffer: WebGLBuffer;
  protected _glVertBuffers: WebGLBuffer[];
  protected attribLocArray: number[];
  protected _renderer: GLBufferRenderer;

  constructor(rhi: GLRenderHardware, primitive: Primitive) {
    super(rhi, primitive);
    this._primitive = primitive;
    this.attribLocArray = [];
    this._renderer = new GLBufferRenderer(this.rhi);
  }

  /** 创建并初始化 IBO、VBO */
  protected initBuffers() {
    const gl = this.rhi.gl;
    const { indexBuffer, vertexBuffers, usage } = this._primitive;

    /** index buffer */
    if (indexBuffer) {
      this._glIndexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._glIndexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexBuffer, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    }

    /** vertex buffers*/
    this._glVertBuffers = [];
    for (let i = 0, len = vertexBuffers.length; i < len; i++) {
      this._glVertBuffers[i] = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this._glVertBuffers[i]);
      gl.bufferData(gl.ARRAY_BUFFER, vertexBuffers[i], usage);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
  }

  /**
   * 更新 VBO
   * @param {number} bufferIndex - 第几个 vbo
   * @param {number} byteOffset - 更新 buffer 的偏移字节
   * @param {number} byteLength - 更新 buffer 的字节长度
   */
  protected updateVertexBuffer(bufferIndex = 0, byteOffset = -1, byteLength = 0) {
    const gl = this.rhi.gl;
    const primitive = this._primitive;
    const vertexBuffer = primitive.vertexBuffers[bufferIndex];
    const vertBufferObject = this._glVertBuffers[bufferIndex];

    gl.bindBuffer(gl.ARRAY_BUFFER, vertBufferObject);
    const activeVertexBuffer = new Int8Array(vertexBuffer, byteOffset, byteLength);
    gl.bufferSubData(gl.ARRAY_BUFFER, byteOffset, activeVertexBuffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  /**
   * 更新 IBO
   * // todo: 更新部分
   * */
  protected updateIndexBuffer() {
    const gl = this.rhi.gl;
    const indexBuffer = this._primitive.indexBuffer;

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._glIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexBuffer, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
  }

  /**
   * 绑定 Buffer 和 attribute
   * */
  protected bindBufferAndAttrib(tech: GLTechnique) {
    const gl = this.rhi.gl;
    const primitive = this._primitive;

    this.attribLocArray = [];
    const techAttributes = tech.attributes;
    const attributes = primitive.vertexAttributes;
    const vbos = this._glVertBuffers;
    let vbo: WebGLBuffer;
    let lastBoundVbo: WebGLBuffer;

    for (const name in techAttributes) {
      const loc = techAttributes[name].location;
      if (loc === -1) continue;

      const semantic = techAttributes[name].semantic;
      const att = attributes[semantic];
      if (att) {
        vbo = vbos[att.vertexBufferIndex];
        // prevent binding the vbo which already bound at the last loop, e.g. a buffer with multiple attributes.
        if (lastBoundVbo !== vbo) {
          lastBoundVbo = vbo;
          gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        }

        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, att.size, att.type, att.normalized, att.stride, att.offset);
        // For instanced attributes, divisor needs to be set.
        // For firefox, need to set back to 0 if non-instanced drawn after instanced. Else won't render
        if (this.rhi.canIUse(GLCapabilityType.instancedArrays)) {
          gl.vertexAttribDivisor(loc, att.instanced);
        }
        this.attribLocArray.push(loc);
      } else {
        Logger.warn("vertex attribute not found: " + name);
      }
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  /**
   * 初始化或更新 BufferObject
   * */
  protected prepareBuffers() {
    const primitive = this._primitive;

    /** init BO or update VBO */
    switch (primitive.updateType) {
      case UpdateType.NO_UPDATE:
        break;
      case UpdateType.UPDATE_ALL:
        this.initBuffers();
        primitive.updateType = UpdateType.NO_UPDATE;
        break;
      case UpdateType.UPDATE_RANGE:
        this.updateVertexBuffer(0, primitive.updateRange.byteOffset, primitive.updateRange.byteLength);
        primitive.updateType = UpdateType.NO_UPDATE;
        primitive.resetUpdateRange();
        break;
    }

    /** update IBO */
    if (primitive.indexNeedUpdate) {
      primitive.indexNeedUpdate = false;
      if (this._glIndexBuffer) {
        this.updateIndexBuffer();
      }
    }
  }

  /**
   * 执行绘制操作
   * @param {GLTechnique} tech
   */
  draw(tech: GLTechnique) {
    const gl = this.rhi.gl;
    const primitive = this._primitive;

    /** prepare BO */
    this.prepareBuffers();
    /** 绑定 Buffer 和 attribute */
    this.bindBufferAndAttrib(tech);

    /** render */
    if (primitive.isInstanced) {
      this._renderer.renderInstances(primitive, this._glIndexBuffer);
    } else {
      this._renderer.render(primitive, this._glIndexBuffer);
    }

    /** unbind */
    this.disableAttrib();
  }

  /** disableVertexAttribArray */
  protected disableAttrib() {
    const gl = this.rhi.gl;
    for (let i = 0, l = this.attribLocArray.length; i < l; i++) {
      gl.disableVertexAttribArray(this.attribLocArray[i]);
    }
  }

  /**
   * 释放 GL 资源
   */
  finalize() {
    const gl = this.rhi.gl;
    const primitive = this._primitive;
    //-- 释放顶点缓冲
    if (this._glVertBuffers) {
      for (let i = 0; i < this._glVertBuffers.length; i++) {
        gl.deleteBuffer(this._glVertBuffers[i]);
      }
      primitive.updateType = UpdateType.UPDATE_ALL;
      this._glVertBuffers = null;
    }

    //-- 释放 index buffer
    if (this._glIndexBuffer) {
      gl.deleteBuffer(this._glIndexBuffer);
      this._glIndexBuffer = null;
    }
  }
}
