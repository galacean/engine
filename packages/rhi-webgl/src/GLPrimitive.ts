import { GLCapabilityType, Logger, UpdateType, Primitive, BufferUtil, VertexElement } from "@alipay/o3-core";
import { GLAsset } from "./GLAsset";
import { GLTechnique } from "./GLTechnique";
import { WebGLRenderer } from "./WebGLRenderer";

/**
 * Primtive 相关的 GL 资源管理，主要是 WebGLBuffer 对象
 * @private
 */
export class GLPrimitive extends GLAsset {
  protected readonly _primitive;
  protected attribLocArray: number[];
  protected readonly canUseInstancedArrays: boolean;

  constructor(rhi: WebGLRenderer, primitive: Primitive) {
    super(rhi, primitive);
    this._primitive = primitive;
    this.canUseInstancedArrays = this.rhi.canIUse(GLCapabilityType.instancedArrays);
  }

  protected initVBO(bufferIndex) {
    const primitive = this._primitive;
    const { vertexBuffers, dataCache } = primitive;
    const data = dataCache[bufferIndex];
    const vertexBuffer = vertexBuffers[bufferIndex];
    vertexBuffer.setData(data);
  }

  protected initIBO() {
    const primitive = this._primitive;
    const { indexBuffer, dataCache } = primitive;
    const data = dataCache.index;
    indexBuffer.setData(data);
  }

  /**
   * 更新 VBO
   */
  protected updateVertexBuffer(index, updateRange) {
    const primitive = this._primitive;
    const { vertexBuffers, dataCache } = primitive;
    const { offset, end } = updateRange;
    const length = end - offset;
    const data = dataCache[index];
    const vertexBuffer = vertexBuffers[index];
    if (offset === -1) {
      console.log("update vertex total");
      vertexBuffer.setData(data);
    } else {
      console.log("update vertex range", offset, length);
      vertexBuffer.setData(data, 0, offset, length);
    }
  }

  /**
   * 更新 IBO
   */
  protected updateIndexBuffer(updateRange) {
    console.log("update index");
    const { indexBuffer, dataCache } = this._primitive;
    const data = dataCache.index;
    const { offset, end } = updateRange;
    const length = end - offset;
    if (offset === -1) {
      console.log("update index 0");
      indexBuffer.setData(data);
    } else {
      console.log("update index");
      indexBuffer.setData(data, 0, offset, length);
    }
  }

  /**
   * 绑定 Buffer 和 attribute
   * */
  protected bindBufferAndAttrib(tech: GLTechnique) {
    const gl = this.rhi.gl;
    const primitive = this._primitive;
    const { semanticIndexMap, vertexBuffers } = primitive;

    this.attribLocArray = [];
    const techAttributes = tech.attributes;
    const attributes = primitive.attributes;

    let vbo: WebGLBuffer;
    let lastBoundVbo: WebGLBuffer;

    for (const name in techAttributes) {
      const loc = techAttributes[name].location;
      if (loc === -1) continue;

      const semantic = techAttributes[name].semantic;
      const att = attributes[semantic];
      if (att) {
        const bufferIndex = semanticIndexMap[semantic];
        const vertexBuffer = vertexBuffers[bufferIndex];
        vbo = vertexBuffer._nativeBuffer;
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
    const attributes = this._primitive.attributes;
    const semanticList = Object.keys(attributes);
    for (let i = 0; i < semanticList.length; i += 1) {
      const semantic = semanticList[i];
      const attribute = attributes[semantic];
      this._handleUpdateVertex(attribute);
    }
    this._handleIndexUpdate();
  }

  private _handleUpdateVertex(attribute: VertexElement) {
    const primitive = this._primitive;
    const { semantic } = attribute;
    const { semanticIndexMap, updateTypeCache, updateRangeCache } = primitive;
    const bufferIndex = semanticIndexMap[semantic];
    const updateType = updateTypeCache[bufferIndex];
    const updateRange = updateRangeCache[bufferIndex];
    switch (updateType) {
      case UpdateType.NO_UPDATE:
        break;
      case UpdateType.INIT:
        this.initVBO(bufferIndex);
        this._primitive.updateTypeCache[bufferIndex] = UpdateType.NO_UPDATE;
        break;
      case UpdateType.UPDATE_RANGE:
        this.updateVertexBuffer(bufferIndex, updateRange);
        this._primitive.updateTypeCache[bufferIndex] = UpdateType.NO_UPDATE;
        this._primitive.updateRangeCache[bufferIndex].offset = -1;
        this._primitive.updateRangeCache[bufferIndex].end = -1;
        break;
    }
  }

  private _handleIndexUpdate() {
    const primitive = this._primitive;
    const { indexBuffer } = primitive;
    const { updateTypeCache, updateRangeCache } = primitive;
    const updateType = updateTypeCache.index;
    const updateRange = updateRangeCache.index;
    if (indexBuffer) {
      switch (updateType) {
        case UpdateType.NO_UPDATE:
          break;
        case UpdateType.INIT:
          this.initIBO();
          this._primitive.updateTypeCache.index = UpdateType.NO_UPDATE;
          break;
        case UpdateType.UPDATE_RANGE:
          this.updateIndexBuffer(updateRange);
          this._primitive.updateTypeCache.index = UpdateType.NO_UPDATE;
          this._primitive.updateRangeCache.index.offset = -1;
          this._primitive.updateRangeCache.index.end = -1;
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
    const {
      mode,
      indexCount,
      indexBuffer,
      indexOffset,
      vertexCount,
      isInstanced,
      vertexOffset,
      instancedCount
    } = primitive;
    const { _glIndexType, _nativeBuffer } = indexBuffer;
    if (!isInstanced) {
      if (indexBuffer) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, _nativeBuffer);
        gl.drawElements(mode, indexCount, _glIndexType, indexOffset);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
      } else {
        gl.drawArrays(mode, vertexOffset, vertexCount);
      }
    } else {
      if (this.canUseInstancedArrays) {
        if (indexBuffer) {
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, _nativeBuffer);
          gl.drawElementsInstanced(mode, indexCount, _glIndexType, indexOffset, instancedCount);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
        } else {
          gl.drawArraysInstanced(mode, vertexOffset, vertexCount, instancedCount);
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
      this._glVertBuffers = [];
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
