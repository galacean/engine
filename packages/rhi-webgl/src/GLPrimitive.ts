import { GLCapabilityType, Logger, Primitive, UpdateType } from "@alipay/o3-core";
import { GLAsset } from "./GLAsset";
import { GLTechnique } from "./GLTechnique";
import { WebGLRenderer } from "./WebGLRenderer";

/**
 * Primtive 相关的 GL 资源管理，主要是 WebGLBuffer 对象
 * @private
 */
export class GLPrimitive extends GLAsset {
  protected readonly _primitive: Primitive;
  protected attribLocArray: number[];
  protected readonly canUseInstancedArrays: boolean;

  constructor(rhi: WebGLRenderer, primitive: Primitive) {
    super(rhi, primitive);
    this._primitive = primitive;
    this.canUseInstancedArrays = this.rhi.canIUse(GLCapabilityType.instancedArrays);
  }

  /**
   * 更新 VBO
   */
  protected updateVertexBuffer(index: number, updateRange: any) {
    const primitive = this._primitive;
    const { vertexBuffers, dataCache } = primitive;
    const { bufferOffset, offset, end } = updateRange;
    const data = dataCache[index];
    const vertexBuffer = vertexBuffers[index];
    if (offset === -1) {
      vertexBuffer.setData(data);
    } else {
      vertexBuffer.setData(data, bufferOffset, offset, end - offset);
    }
  }

  /**
   * 更新 IBO
   */
  protected updateIndexBuffer(updateRange: any) {
    const { indexBuffer, dataCache } = this._primitive;
    const data = dataCache.index;
    const { bufferOffset, offset, end } = updateRange;
    if (offset === -1) {
      indexBuffer.setData(data);
    } else {
      indexBuffer.setData(data, bufferOffset, offset, end - offset);
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
    const vertexBuffer = this._primitive.vertexBuffers;
    for (let i: number = 0, n: number = vertexBuffer.length; i < n; i++) {
      this._handleUpdateVertex(i);
    }
    this._handleIndexUpdate();
  }

  private _handleUpdateVertex(bufferIndex: number) {
    const { updateTypeCache, updateRangeCache } = this._primitive;
    const updateType = updateTypeCache[bufferIndex];
    switch (updateType) {
      case UpdateType.NO_UPDATE:
        break;
      case UpdateType.UPDATE_RANGE:
        const updateRange = updateRangeCache[bufferIndex];
        this.updateVertexBuffer(bufferIndex, updateRange);
        this._primitive.updateTypeCache[bufferIndex] = UpdateType.NO_UPDATE;
        updateRange.bufferOffset = -1;
        updateRange.offset = -1;
        updateRange.end = -1;
        break;
    }
  }

  private _handleIndexUpdate() {
    const { indexBuffer, updateTypeCache, updateRangeCache } = this._primitive;
    const updateType = updateTypeCache.index;
    const updateRange = updateRangeCache.index;
    if (indexBuffer) {
      switch (updateType) {
        case UpdateType.NO_UPDATE:
          break;
        case UpdateType.UPDATE_RANGE:
          this.updateIndexBuffer(updateRange);
          updateTypeCache.index = UpdateType.NO_UPDATE;
          updateRangeCache.index.bufferOffset = -1;
          updateRangeCache.index.offset = -1;
          updateRangeCache.index.end = -1;
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
    const vertexBuffers = primitive.vertexBuffers;
    const indexBuffer = primitive.indexBuffer;

    if (vertexBuffers.length > 0) {
      for (let i = 0; i < vertexBuffers.length; i++) {
        const vertexBuffer = vertexBuffers[i];
        vertexBuffer.destroy();
      }
    }

    if (indexBuffer) {
      indexBuffer.destroy();
      primitive.indexBuffer = null;
    }
  }
}
