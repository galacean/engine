import { GLCapabilityType, Logger, UpdateType, Primitive, VertexElement } from "@alipay/o3-core";
import { GLAsset } from "./GLAsset";
import { GLTechnique } from "./GLTechnique";
import { WebGLRenderer } from "./WebGLRenderer";

/**
 * Primtive 相关的 GL 资源管理，主要是 WebGLBuffer 对象
 * @private
 */
export class GLPrimitive extends GLAsset {
  protected readonly _primitive;
  protected _glIndexBuffer: WebGLBuffer;
  protected _glVertBuffers: WebGLBuffer[];
  protected attribLocArray: number[];
  protected readonly canUseInstancedArrays: boolean;

  constructor(rhi: WebGLRenderer, primitive: Primitive) {
    super(rhi, primitive);
    this._primitive = primitive;
    this._glVertBuffers = [];
    this.attribLocArray = [];
    this.canUseInstancedArrays = this.rhi.canIUse(GLCapabilityType.instancedArrays);
  }

  /** 创建并初始化 IBO */
  protected initIBO() {
    if (this._glIndexBuffer) {
      return;
    }
    const gl = this.rhi.gl;
    const { indexBuffer, dataCache } = this._primitive;
    if (indexBuffer) {
      console.log("real init ibo");
      this._glIndexBuffer = gl.createBuffer();
      const { _glBufferUsage } = indexBuffer;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._glIndexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, dataCache.index, _glBufferUsage);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    }
  }

  /** 创建并初始化 VBO */
  protected initVBO() {
    if (this._glVertBuffers.length > 1) {
      return;
    }
    console.log("real init vbo");
    const gl = this.rhi.gl;
    const { vertexBuffers, dataCache } = this._primitive;
    for (let i = 0, len = vertexBuffers.length; i < len; i++) {
      this._glVertBuffers[i] = gl.createBuffer();
      const vertexBuffer = vertexBuffers[i];
      const { _glBufferUsage } = vertexBuffer;
      gl.bindBuffer(gl.ARRAY_BUFFER, this._glVertBuffers[i]);
      gl.bufferData(gl.ARRAY_BUFFER, dataCache[i], _glBufferUsage);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
  }

  /**
   * 更新 VBO
   */
  protected updateVertexBuffer(index, updateRange) {
    debugger;
    const primitive = this._primitive;
    const { vertexBuffers, dataCache } = primitive;
    const { offset, end } = updateRange;
    const length = end - offset;
    const data = dataCache[index];
    const vertexBuffer = vertexBuffers[index];
    vertexBuffer.setData(data, 0, offset, length);
  }

  /**
   * 更新 VBO
   */
  protected updateIndexBuffer(updateRange) {
    const { indexBuffer, dataCache } = this._primitive;
    const data = dataCache.index;
    const { offset, end } = updateRange;
    const length = end - offset;
    indexBuffer.setData(data, 0, offset, length);
  }

  /**
   * 绑定 Buffer 和 attribute
   * */
  protected bindBufferAndAttrib(tech: GLTechnique) {
    const gl = this.rhi.gl;
    const primitive = this._primitive;
    const { semanticIndexMap } = primitive;

    this.attribLocArray = [];
    const techAttributes = tech.attributes;
    const attributes = primitive.attributes;

    let vbo: WebGLBuffer;
    let lastBoundVbo: WebGLBuffer;
    const vbos = this._glVertBuffers;

    for (const name in techAttributes) {
      const loc = techAttributes[name].location;
      if (loc === -1) continue;

      const semantic = techAttributes[name].semantic;
      const att = attributes[semantic];
      if (att) {
        const bufferIndex = semanticIndexMap[semantic];
        vbo = vbos[bufferIndex];
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
      case undefined:
        this.initVBO();
        updateTypeCache[bufferIndex] = UpdateType.NO_UPDATE;
        break;
      case UpdateType.UPDATE_RANGE:
        this.initVBO();
        this.updateVertexBuffer(bufferIndex, updateRange);
        updateTypeCache[bufferIndex] = UpdateType.NO_UPDATE;
        updateRangeCache[bufferIndex].offset = -1;
        updateRangeCache[bufferIndex].end = -1;
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
        case undefined:
          this.initIBO();
          updateTypeCache.index = UpdateType.NO_UPDATE;
          break;
        case UpdateType.UPDATE_RANGE:
          this.initIBO();
          this.updateIndexBuffer(updateRange);
          updateTypeCache.index = UpdateType.NO_UPDATE;
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
    const indexBufferObject = this._glIndexBuffer;
    const { isInstanced, indexBuffer } = primitive;
    if (!isInstanced) {
      if (indexBufferObject) {
        const { _glIndexType } = indexBuffer;
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBufferObject);
        gl.drawElements(primitive.mode, primitive.indexCount, _glIndexType, primitive.indexOffset);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
      } else {
        gl.drawArrays(primitive.mode, primitive.vertexOffset, primitive.vertexCount);
      }
    } else {
      if (this.canUseInstancedArrays) {
        if (indexBufferObject) {
          const { _glIndexType } = indexBuffer;
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBufferObject);
          gl.drawElementsInstanced(
            primitive.mode,
            primitive.indexCount,
            _glIndexType,
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
