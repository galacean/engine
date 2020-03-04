import { Logger, UpdateType, DataType, GLCapabilityType } from "@alipay/o3-base";
import { Primitive } from "@alipay/o3-primitive";
import { GLRenderHardware } from "./GLRenderHardware";
import { GLTechnique } from "./GLTechnique";
import { GLAsset } from "./GLAsset";

/**
 * Primtive 相关的 GL 资源管理，主要是 WebGLBuffer 对象
 * @private
 */
export class GLPrimitive extends GLAsset {
  private readonly _primitive;
  private _glIndexBuffer: WebGLBuffer;
  private _glVertBuffers: WebGLBuffer[];
  private updateType: UpdateType;

  constructor(rhi: GLRenderHardware, primitive: Primitive) {
    super(rhi, primitive);
    this._primitive = primitive;
    this.updateType = primitive.updateType;

    const gl = rhi.gl;

    //-- create index buffer
    const indexBuffer = primitive.indexBuffer;
    if (indexBuffer) {
      const indexBufferObject = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBufferObject);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexBuffer, gl.STATIC_DRAW);
      this._glIndexBuffer = indexBufferObject;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    }
  }

  /**
   * 创建 VertexBuffers 数据
   * @private
   */
  _createVertextBuffer() {
    const gl = this.rhi.gl;
    const primitive = this._primitive;
    const vertBuffers = primitive.vertexBuffers;
    const usage = primitive.usage;
    this._glVertBuffers = [];
    for (let i = 0, len = vertBuffers.length; i < len; i++) {
      const vertBufferObject = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vertBufferObject);
      gl.bufferData(gl.ARRAY_BUFFER, vertBuffers[i], usage);
      this._glVertBuffers.push(vertBufferObject);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
  }

  /**
   * 更新 VertexBuffers 数据
   * @private
   */
  _updateVertexBuffers() {
    const gl = this.rhi.gl;
    const primitive = this._primitive;
    const vertexBuffer = primitive.vertexBuffers[0];
    const vertBufferObject = this._glVertBuffers[0];
    const byteOffset = primitive.updateRange.byteOffset;
    const byteLength = primitive.updateRange.byteLength;
    gl.bindBuffer(gl.ARRAY_BUFFER, vertBufferObject);
    const activeVertexBuffer = new Int8Array(vertexBuffer, byteOffset, byteLength);
    gl.bufferSubData(gl.ARRAY_BUFFER, byteOffset, activeVertexBuffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  /**
   * 执行绘制操作
   * @param {GLTechnique} tech
   */
  draw(tech: GLTechnique) {
    if (this._primitive.indexType === DataType.UNSIGNED_INT && !this.rhi.canIUse(GLCapabilityType.elementIndexUint)) {
      console.warn("primitive have UNSIGN_INT index and not supported by this device", this);
      return;
    }

    const gl = this.rhi.gl;
    const primitive = this._primitive;

    switch (this.updateType) {
      case UpdateType.NO_UPDATE:
        break;
      case UpdateType.UPDATE_ALL:
        this._createVertextBuffer();
        this.updateType = UpdateType.NO_UPDATE;
        break;
      case UpdateType.UPDATE_RANGE:
        this._updateVertexBuffers();
        this.updateType = UpdateType.NO_UPDATE;
        primitive.resetUpdateRange();
        break;
    }

    if (primitive.indexNeedUpdate) {
      primitive.indexNeedUpdate = false;
      const indexBuffer = primitive.indexBuffer;
      if (indexBuffer) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._glIndexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexBuffer, gl.DYNAMIC_DRAW);
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    }

    //-- bind vertex attributes
    const locArray = [];
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
        // gl.bindBuffer( gl.ARRAY_BUFFER, vbo );

        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, att.size, att.type, att.normalized, att.stride, att.offset);
        locArray.push(loc);
      } else {
        Logger.warn("vertex attribute not found: " + name);
      }
    } // end of for

    if (this._glIndexBuffer) {
      //-- bind index buffer
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._glIndexBuffer);

      //-- draw call
      gl.drawElements(primitive.mode, primitive.indexCount, primitive.indexType, primitive.indexOffset);

      //-- clear states
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    } else {
      //-- draw array
      gl.drawArrays(primitive.mode, primitive.vertexOffset, primitive.vertexCount);
    } // end of else

    //-- clear states
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    for (let i = 0, l = locArray.length; i < l; i++) {
      gl.disableVertexAttribArray(locArray[i]);
    } // end of for
  }

  /**
   * 释放 GL 资源
   */
  finalize() {
    const gl = this.rhi.gl;
    //-- 释放顶点缓冲
    if (this._glVertBuffers) {
      for (let i = 0; i < this._glVertBuffers.length; i++) {
        gl.deleteBuffer(this._glVertBuffers[i]);
      }
      this._glVertBuffers = null;
    }

    //-- 释放 index buffer
    if (this._glIndexBuffer) {
      gl.deleteBuffer(this._glIndexBuffer);
      this._glIndexBuffer = null;
    }
  }
}
