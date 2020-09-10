import { AssetObject } from "../asset/AssetObject";
import { TypedArray, UpdateType } from "../base/Constant";
import { Logger } from "../base/Logger";
import { Primitive } from "../primitive/Primitive";
import { DataMap, UpdateRangeMap, UpdateTypeMap } from "../primitive/type";
import { BufferUtil } from "./graphic/BufferUtil";
import { VertexElements } from "./graphic/VertexElement";
import { IndexBuffer, VertexBuffer } from "./index";

let geometryCount = 0;

/**
 * BufferGeometry 几何体创建类
 * @extends AssetObject
 */
export class BufferGeometry extends AssetObject {
  primitive: Primitive;
  private _bufferCount: number;
  private dataCache: DataMap = {};
  private updateTypeCache: UpdateTypeMap = {};
  private updateRangeCache: UpdateRangeMap = {};

  get vertexCount() {
    return this.primitive.vertexCount;
  }

  set vertexCount(value: number) {
    this.primitive.vertexCount = value;
  }

  get instancedCount() {
    return this.primitive.instancedCount;
  }

  set instancedCount(count: number) {
    this.primitive.instancedCount = count;
  }

  set mode(mode) {
    this.primitive.mode = mode;
  }

  get mode() {
    return this.primitive.mode;
  }

  get attributes(): VertexElements {
    return this.primitive.attributes;
  }

  get indexBuffer(): IndexBuffer {
    return this.primitive.indexBuffer;
  }

  set indexCount(v: number) {
    this.primitive.indexCount = v;
  }

  get indexCount(): number {
    return this.primitive.indexCount;
  }

  /**
   * @constructor
   * @param {string} name 名称
   */
  constructor(name?: string) {
    super();
    name = name || "bufferGeometry" + geometryCount++;
    this._bufferCount = 0;
    this.primitive = new Primitive();
  }

  /**
   * 添加一个VB数据
   */
  addVertexBuffer(vertexBuffer: VertexBuffer, data: TypedArray) {
    this.primitive.addVertexBuffer(vertexBuffer);
    this.dataCache[this._bufferCount] = data;
    this.updateTypeCache[this._bufferCount] = UpdateType.INIT;
    this.updateRangeCache[this._bufferCount] = { offset: -1, end: -1, bufferOffset: -1 };
    this._bufferCount++;
  }

  /**
   * 设置顶点数据
   */
  setVertexData(semantic: string, data: TypedArray, offset: number = 0, dataIndex: number = 0, dataCount?: number) {
    const buffer = this.getBufferBySemantic(semantic);
    const { declaration } = buffer;
    const bufferIndex = this.primitive.semanticIndexMap[semantic];
    const element = declaration.elements.find((element) => element.semantic === semantic);
    const byteSize = BufferUtil._getVertexDataTypeSize(element.elementInfo.type);
    const dataOffset = element.offset / byteSize;
    const totalSize = declaration.elements.map((item) => item.elementInfo.size).reduce((a, b) => a + b);
    const bufferOffset = offset * byteSize + element.offset;

    if (dataCount !== undefined) {
      data = data.slice(dataIndex, dataCount);
    }
    if (declaration.elements.length > 1) {
      const _offset = offset * totalSize + dataOffset;
      this.dataCache[bufferIndex].set(data, _offset);
      this._udpateInterleavedFlag(semantic, offset, byteSize, data.length);
    } else {
      this.dataCache[bufferIndex].set(data, offset);
      this._updateFlag(bufferIndex, offset, bufferOffset, data.length);
    }
  }

  resizeVertexBuffer(semantic: string, data: TypedArray) {
    const bufferIndex = this.primitive.semanticIndexMap[semantic];
    this.dataCache[bufferIndex] = data;
    const vertexBuffer = this.primitive.vertexBuffers[bufferIndex];
    const { declaration } = vertexBuffer;
    const element = declaration.elements.find((item) => item.semantic === semantic);
    const byteSize = BufferUtil._getVertexDataTypeSize(element.elementInfo.type);
    vertexBuffer.resize(data.length * byteSize);
    this.updateTypeCache[bufferIndex] = UpdateType.NO_UPDATE;
    this.updateRangeCache[bufferIndex] = { offset: -1, end: -1, bufferOffset: -1 };
  }

  setIndexBuffer(indexBuffer: IndexBuffer, data: Uint8Array | Uint16Array | Uint32Array) {
    this.primitive.indexBuffer = indexBuffer;
    this.dataCache.index = data;
    this.updateTypeCache.index = UpdateType.INIT;
    this.updateRangeCache.index = { offset: -1, end: -1, bufferOffset: -1 };
  }

  setIndexData(data: TypedArray, offset: number = 0, dataIndex: number = 0, dataCount?: number) {
    if (dataCount !== undefined) {
      data = data.slice(dataIndex, dataCount);
    }
    this.dataCache.index.set(data, offset);
    this._updateFlag("index", offset, offset, data.length);
  }

  resizeIndexBuffer(data: Uint8Array | Uint16Array | Uint32Array) {
    this.dataCache.index = data;
    const { indexBuffer } = this.primitive;
    indexBuffer.resize(data.length);
    this.updateTypeCache.index = UpdateType.NO_UPDATE;
    this.updateRangeCache.index = { offset: -1, end: -1, bufferOffset: -1 };
  }

  getIndexData() {
    return this.dataCache.index;
  }

  getVertexData(semantic) {
    const bufferIndex = this.primitive.semanticIndexMap[semantic];
    return this.dataCache[bufferIndex];
  }

  /**
   * 释放内部资源对象
   */
  destroy() {
    this.primitive.destroy();
    this.primitive = null;
  }

  reset() {
    this.primitive.reset();
    this._bufferCount = 0;
  }

  _render(): void {
    this.prepareBuffers();
  }

  /**
   * 更新 VBO
   */
  protected updateVertexBuffer(index: number, updateRange: any) {
    const primitive = this.primitive;
    const { vertexBuffers } = primitive;
    const { bufferOffset, offset, end } = updateRange;
    const data = this.dataCache[index];
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
    const { indexBuffer } = this.primitive;
    const data = this.dataCache.index;
    const { bufferOffset, offset, end } = updateRange;
    if (offset === -1) {
      indexBuffer.setData(data);
    } else {
      indexBuffer.setData(data, bufferOffset, offset, end - offset);
    }
  }

  /**
   * 初始化或更新 BufferObject
   * */
  protected prepareBuffers() {
    const vertexBuffer = this.primitive.vertexBuffers;
    for (let i: number = 0, n: number = vertexBuffer.length; i < n; i++) {
      this._handleUpdateVertex(i);
    }
    this._handleIndexUpdate();
  }

  private _handleUpdateVertex(bufferIndex: number) {
    const updateType = this.updateTypeCache[bufferIndex];
    switch (updateType) {
      case UpdateType.NO_UPDATE:
        break;
      case UpdateType.UPDATE_RANGE:
        const updateRange = this.updateRangeCache[bufferIndex];
        this.updateVertexBuffer(bufferIndex, updateRange);
        this.updateTypeCache[bufferIndex] = UpdateType.NO_UPDATE;
        updateRange.bufferOffset = -1;
        updateRange.offset = -1;
        updateRange.end = -1;
        break;
    }
  }

  private _handleIndexUpdate() {
    const { indexBuffer } = this.primitive;
    const updateType = this.updateTypeCache.index;
    const updateRange = this.updateRangeCache.index;
    if (indexBuffer) {
      switch (updateType) {
        case UpdateType.NO_UPDATE:
          break;
        case UpdateType.UPDATE_RANGE:
          this.updateIndexBuffer(updateRange);
          this.updateTypeCache.index = UpdateType.NO_UPDATE;
          this.updateRangeCache.index.bufferOffset = -1;
          this.updateRangeCache.index.offset = -1;
          this.updateRangeCache.index.end = -1;
          break;
      }
    }
  }

  private getBufferBySemantic(semantic: string): VertexBuffer | undefined {
    const attributes = this.primitive.attributes;
    const vertexAttrib = attributes[semantic];
    if (vertexAttrib === undefined) {
      Logger.error("UNKNOWN semantic: " + name);
      return;
    }

    const matchBuffer = this.primitive.vertexBuffers.filter((vertexBuffer) =>
      vertexBuffer.semanticList.includes(semantic)
    );
    if (matchBuffer.length > 1) {
      Logger.error("Duplicated semantic: " + name);
      return;
    }

    return matchBuffer[0];
  }

  private _updateFlag(bufferIndex: number | string, offset: number, bufferOffset: number, dataLength: number) {
    const updateRange = this.updateRangeCache[bufferIndex];
    const updateTypeCache = this.updateTypeCache;
    if (updateTypeCache[bufferIndex] === UpdateType.NO_UPDATE) {
      updateRange.bufferOffset = bufferOffset;
      updateRange.offset = offset;
      updateRange.end = offset + dataLength;
      updateTypeCache[bufferIndex] = UpdateType.UPDATE_RANGE;
    } else if (updateTypeCache[bufferIndex] === UpdateType.UPDATE_RANGE) {
      updateRange.bufferOffset = Math.min(updateRange.bufferOffset, bufferOffset);
      updateRange.offset = Math.min(updateRange.offset, offset);
      updateRange.end = Math.max(updateRange.end, offset + dataLength);
    }
  }

  private _udpateInterleavedFlag(semantic: string, vertexIndex: number, byteSize: number, dataLength: number) {
    const bufferIndex = this.primitive.semanticIndexMap[semantic];
    const buffer = this.primitive.vertexBuffers[bufferIndex];
    const { declaration } = buffer;
    const vertexElement = declaration.elements.find((item) => item.semantic === semantic);
    const { offset } = vertexElement;
    const { vertexStride } = declaration;
    if (this.updateTypeCache[bufferIndex] === UpdateType.NO_UPDATE) {
      this.updateRangeCache[bufferIndex].offset = (vertexIndex * vertexStride + offset) / byteSize;
      this.updateRangeCache[bufferIndex].end = (vertexIndex * vertexStride + offset + byteSize * dataLength) / byteSize;
      this.updateTypeCache[bufferIndex] = UpdateType.UPDATE_RANGE;
    } else if (this.updateTypeCache[bufferIndex] === UpdateType.UPDATE_RANGE) {
      const newRange = this._getUpdateRange(bufferIndex, (vertexIndex * vertexStride + offset) / byteSize, dataLength);
      this.updateRangeCache[bufferIndex].offset = newRange.offset;
      this.updateRangeCache[bufferIndex].end = newRange.end;
    }
  }

  private _getUpdateRange(bufferIndex: number, offset: number, length: number) {
    const updateRange = this.updateRangeCache[bufferIndex];
    const rangeEnd1 = this.updateRangeCache[bufferIndex].end;
    const _offset = Math.min(offset, updateRange.offset);
    const rangeEnd2 = offset + length;
    const _end = rangeEnd1 <= rangeEnd2 ? rangeEnd2 : rangeEnd1;
    return { offset: _offset, end: _end };
  }
}
