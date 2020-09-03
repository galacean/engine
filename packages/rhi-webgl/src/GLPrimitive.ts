import { GLCapabilityType, Logger, UpdateType, Primitive, VertexElement } from "@alipay/o3-core";
import { GLAsset } from "./GLAsset";
import { GLTechnique } from "./GLTechnique";
import { WebGLRenderer } from "./WebGLRenderer";

type WebGLBufferMap = {
  [semantic: string]: WebGLBuffer;
};

/**
 * Primtive 相关的 GL 资源管理，主要是 WebGLBuffer 对象
 * @private
 */
export class GLPrimitive extends GLAsset {
  protected readonly _primitive;
  protected _glIndexBuffer: WebGLBuffer;
  protected _glVertBuffer: WebGLBufferMap;
  protected attribLocArray: number[];
  protected readonly canUseInstancedArrays: boolean;

  constructor(rhi: WebGLRenderer, primitive: Primitive) {
    super(rhi, primitive);
    this._primitive = primitive;
    this._glVertBuffer = {};
    this.attribLocArray = [];
    this.canUseInstancedArrays = this.rhi.canIUse(GLCapabilityType.instancedArrays);
  }

  /** 创建并初始化 IBO */
  protected initIBO() {
    const gl = this.rhi.gl;
    const { indexBuffers, indexArrayBuffers, indexBufferIndex } = this._primitive;
    if (indexBuffers) {
      this._glIndexBuffer = gl.createBuffer();
      const indexBuffer = indexArrayBuffers[indexBufferIndex];
      const indexUsage = indexBuffers[indexBufferIndex].usage;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._glIndexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexBuffer, indexUsage);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    }
  }

  /** 创建并初始化 VBO */
  protected initVBO() {
    // const gl = this.rhi.gl;
    // const { vertexArrayBuffers } = this._primitive;
    // /** vertex buffers*/
    // this._glVertBuffers = [];
    // for (let i = 0, len = vertexArrayBuffers.length; i < len; i++) {
    //   this._glVertBuffers[i] = gl.createBuffer();
    //   const usage = this._getBufferUsage(i);
    //   gl.bindBuffer(gl.ARRAY_BUFFER, this._glVertBuffers[i]);
    //   gl.bufferData(gl.ARRAY_BUFFER, vertexArrayBuffers[i], usage);
    //   gl.bindBuffer(gl.ARRAY_BUFFER, null);
    // }
  }

  // private _getBufferUsage(index) {
  //   const attributes = this._primitive.attributes;
  //   const vertexBuffers = this._primitive.vertexBuffers;
  //   let matchedSemantic;
  //   const semanticList = Object.keys(attributes);
  //   for (let i = 0; i < semanticList.length; i += 1) {
  //     const semantic = semanticList[i];
  //     const attribute = attributes[semantic];
  //     const { vertexBufferIndex } = attribute;
  //     if (index === vertexBufferIndex) {
  //       matchedSemantic = attribute.semantic;
  //     }
  //   }
  //   const buffer = vertexBuffers.find((item) => item.semanticList.includes(matchedSemantic));
  //   return buffer.bufferUsage;
  // }

  /**
   * 更新 VBO
   * @param {number} bufferIndex - 第几个 vbo
   * @param {number} byteOffset - 更新 buffer 的偏移字节
   * @param {number} byteLength - 更新 buffer 的字节长度
   */
  protected updateVertexBuffer(bufferIndex = 0, updateRange) {
    // const gl = this.rhi.gl;
    // const primitive = this._primitive;
    // const vertBufferObject = this._glVertBuffers[bufferIndex];
    // const vertexBuffer = primitive.vertexArrayBuffers[bufferIndex];
    // const { byteOffset, byteLength, bufferByteOffset } = updateRange;
    // gl.bindBuffer(gl.ARRAY_BUFFER, vertBufferObject);
    // const activeVertexBuffer = new Int8Array(vertexBuffer, byteOffset, byteLength);
    // gl.bufferSubData(gl.ARRAY_BUFFER, bufferByteOffset, activeVertexBuffer);
    // gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  /**
   * 更新 VBO
   * @param {number} bufferIndex - 第几个 vbo
   * @param {number} byteOffset - 更新 buffer 的偏移字节
   * @param {number} byteLength - 更新 buffer 的字节长度
   */
  protected updateIndexBuffer(updateRange) {
    // const gl = this.rhi.gl;
    // const primitive = this._primitive;
    // const indexBufferIndex = primitive.indexBufferIndex;
    // const indexArrayBuffers = primitive.indexArrayBuffers;
    // const indexBuffer = indexArrayBuffers[indexBufferIndex];
    // const indexBufferObject = this._glIndexBuffer;
    // const { byteOffset, byteLength, bufferByteOffset } = updateRange;
    // gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBufferObject);
    // const activeIndexBuffer = new Int8Array(indexBuffer, byteOffset, byteLength);
    // gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, bufferByteOffset, activeIndexBuffer);
    // gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
  }

  /**
   * 绑定 Buffer 和 attribute
   * */
  protected bindBufferAndAttrib(tech: GLTechnique) {
    const gl = this.rhi.gl;
    const primitive = this._primitive;

    this.attribLocArray = [];
    const techAttributes = tech.attributes;
    const attributes = primitive.attributes;

    let vbo: WebGLBuffer;
    let lastBoundVbo: WebGLBuffer;
    const vboMap = this._glVertBuffer;

    for (const name in techAttributes) {
      const loc = techAttributes[name].location;
      if (loc === -1) continue;

      const semantic = techAttributes[name].semantic;
      const att = attributes[semantic];
      if (att) {
        vbo = vboMap[att.semantic];
        // prevent binding the vbo which already bound at the last loop, e.g. a buffer with multiple attributes.
        if (lastBoundVbo !== vbo) {
          lastBoundVbo = vbo;
          gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        }

        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, att.elementInfo.size, att.elementInfo.type, att.normalized, att.stride, att.offset);
        if (this.canUseInstancedArrays) {
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
    const vertexBuffers = primitive.vertexBuffers;
    const indexBuffers = primitive.indexBuffers;
    for (let i = 0, len = vertexBuffers.length; i < len; i++) {
      const vertexBuffer = vertexBuffers[i];
      const { semanticList } = vertexBuffer;
      for (let j = 0; j < semanticList.length; j++) {
        const semantic = semanticList[j];
        this._glVertBuffer[semantic] = vertexBuffer._glBuffer;
      }
    }
    const { indexBufferIndex } = this._primitive;
    if (indexBuffers) {
      const indexBuffer = indexBuffers[indexBufferIndex];
      this._glIndexBuffer = indexBuffer._glBuffer;
    }
  }

  private _handleVertexBufferUpdate(attribute: VertexElement) {
    const { updateType, vertexBufferIndex, updateRange } = attribute;
    switch (updateType) {
      case UpdateType.NO_UPDATE:
        break;
      case UpdateType.UPDATE_ALL:
        if (!this._glVertBuffers?.length) {
          this.initVBO();
        }
        attribute.updateType = UpdateType.NO_UPDATE;
        break;
      case UpdateType.UPDATE_RANGE:
        if (!this._glVertBuffers?.length) {
          this.initVBO();
        }
        this.updateVertexBuffer(vertexBufferIndex, updateRange);
        attribute.updateType = UpdateType.NO_UPDATE;
        attribute.resetUpdateRange();
        break;
      case UpdateType.RESIZE:
        this.initVBO();
        attribute.updateType = UpdateType.NO_UPDATE;
        break;
    }
  }

  private _handleIndexBufferUpdate() {
    const primitive = this._primitive;
    const { indexBuffers, indexBufferIndex } = primitive;
    const indexBuffer = indexBuffers[indexBufferIndex];
    if (indexBuffer) {
      const { updateRange, updateType } = indexBuffer;
      switch (updateType) {
        case UpdateType.NO_UPDATE:
          break;
        case UpdateType.UPDATE_ALL:
          if (!this._glIndexBuffer) {
            this.initIBO();
          }
          indexBuffer.updateType = UpdateType.NO_UPDATE;
          break;
        case UpdateType.UPDATE_RANGE:
          if (!this._glIndexBuffer) {
            this.initIBO();
          }
          this.updateIndexBuffer(updateRange);
          indexBuffer.updateType = UpdateType.NO_UPDATE;
          indexBuffer.resetUpdateRange();
          break;
        case UpdateType.RESIZE:
          this.initIBO();
          indexBuffer.updateType = UpdateType.NO_UPDATE;
          indexBuffer.resetUpdateRange();
          break;
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
    /** draw */
    const indexBufferObject = this._glIndexBuffer;
    const { isInstanced, indexBuffers, indexBufferIndex } = primitive;
    const indexBuffer = indexBuffers[indexBufferIndex];
    if (!isInstanced) {
      if (indexBufferObject) {
        const { indexCount, indexType } = indexBuffer;
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBufferObject);
        gl.drawElements(primitive.mode, indexCount, indexType, primitive.indexOffset);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
      } else {
        gl.drawArrays(primitive.mode, primitive.vertexOffset, primitive.vertexCount);
      }
    } else {
      if (this.canUseInstancedArrays) {
        if (indexBufferObject) {
          const { indexCount, indexType } = indexBuffer;
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBufferObject);
          gl.drawElementsInstanced(
            primitive.mode,
            indexCount,
            indexType,
            primitive.indexOffset,
            primitive.instancedCount
          );
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
        } else {
          gl.drawArraysInstanced(
            primitive.mode,
            primitive.vertexOffset,
            primitive.vertexCount,
            primitive.instancedCount
          );
        }
      } else {
        Logger.error("ANGLE_instanced_arrays extension is not supported");
      }
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
    const primitive = this._primitive;
    //-- 释放顶点缓冲
    if (primitive.vertexBuffers.length > 0) {
      for (let i = 0; i < primitive.vertexBuffers.length; i += 1) {
        const vertexBuffer = primitive.vertexBuffers[i];
        vertexBuffer.destroy();
      }
      this._glVertBuffer = {};
    }

    //-- 释放 index buffer
    if (primitive.indexBuffers.length > 0) {
      const { indexBufferIndex } = primitive;
      const indexBuffer = primitive.indexBuffers[indexBufferIndex];
      indexBuffer.destroy();
      this._glIndexBuffer = null;
    }
  }
}
