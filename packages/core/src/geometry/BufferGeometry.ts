import { VertexBuffer, IndexBuffer } from "./index";
import { AssetObject } from "../asset/AssetObject";
import { Logger } from "../base/Logger";
import { Primitive } from "../primitive/Primitive";
import { UpdateType, TypedArray } from "../base/Constant";
import { VertexElements } from "./graphic/VertexElement";
import { BufferUtil } from "./graphic/BufferUtil";

let geometryCount = 0;

/**
 * BufferGeometry 几何体创建类
 * @extends AssetObject
 */
export class BufferGeometry extends AssetObject {
  primitive: Primitive;
  private _bufferCount: number;

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
    name = name || "bufferGeometry" + geometryCount++;
    super();
    this._bufferCount = 0;
    this.primitive = new Primitive();
  }

  /**
   * 添加一个VB数据
   */
  addVertexBuffer(vertexBuffer: VertexBuffer, data: TypedArray) {
    const eleCount = vertexBuffer.declaration.elements.length;
    for (let i = 0; i < eleCount; i += 1) {
      const element = vertexBuffer.declaration.elements[i];
      const { semantic } = element;
      this.primitive.semanticIndexMap[semantic] = this._bufferCount;
      this.primitive.addAttribute(element);
    }
    this.primitive.vertexBuffers.push(vertexBuffer);
    this.primitive.dataCache[this._bufferCount] = data;
    this.primitive.updateTypeCache[this._bufferCount] = UpdateType.INIT;
    this.primitive.updateRangeCache[this._bufferCount] = { offset: -1, end: -1, bufferOffset: -1 };
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
      this.primitive.dataCache[bufferIndex].set(data, _offset);
      this._udpateInterleavedFlag(semantic, offset, byteSize, data.length);
    } else {
      this.primitive.dataCache[bufferIndex].set(data, offset);
      this._updateFlag(bufferIndex, offset, bufferOffset, data.length);
    }
  }

  resizeVertexBuffer(semantic: string, data: TypedArray) {
    const bufferIndex = this.primitive.semanticIndexMap[semantic];
    this.primitive.dataCache[bufferIndex] = data;
    const vertexBuffer = this.primitive.vertexBuffers[bufferIndex];
    const { declaration } = vertexBuffer;
    const element = declaration.elements.find((item) => item.semantic === semantic);
    const byteSize = BufferUtil._getVertexDataTypeSize(element.elementInfo.type);
    vertexBuffer.resize(data.length * byteSize);
    this.primitive.updateTypeCache[bufferIndex] = UpdateType.NO_UPDATE;
    this.primitive.updateRangeCache[bufferIndex] = { offset: -1, end: -1, bufferOffset: -1 };
  }

  setIndexBuffer(indexBuffer: IndexBuffer, data: Uint8Array | Uint16Array | Uint32Array) {
    this.primitive.indexBuffer = indexBuffer;
    this.primitive.dataCache.index = data;
    this.primitive.updateTypeCache.index = UpdateType.INIT;
    this.primitive.updateRangeCache.index = { offset: -1, end: -1, bufferOffset: -1 };
  }

  setIndexData(data: TypedArray, offset: number = 0, dataIndex: number = 0, dataCount?: number) {
    if (dataCount !== undefined) {
      data = data.slice(dataIndex, dataCount);
    }
    this.primitive.dataCache.index.set(data, offset);
    this._updateFlag("index", offset, offset, data.length);
  }

  resizeIndexBuffer(data: Uint8Array | Uint16Array | Uint32Array) {
    this.primitive.dataCache.index = data;
    const { indexBuffer } = this.primitive;
    indexBuffer.resize(data.length);
    this.primitive.updateTypeCache.index = UpdateType.NO_UPDATE;
    this.primitive.updateRangeCache.index = { offset: -1, end: -1, bufferOffset: -1 };
  }

  getIndexData() {
    return this.primitive.dataCache.index;
  }

  getVertexData(semantic) {
    const bufferIndex = this.primitive.semanticIndexMap[semantic];
    return this.primitive.dataCache[bufferIndex];
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
    const updateRange = this.primitive.updateRangeCache[bufferIndex];
    const updateTypeCache = this.primitive.updateTypeCache;
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
    if (this.primitive.updateTypeCache[bufferIndex] === UpdateType.NO_UPDATE) {
      this.primitive.updateRangeCache[bufferIndex].offset = (vertexIndex * vertexStride + offset) / byteSize;
      this.primitive.updateRangeCache[bufferIndex].end =
        (vertexIndex * vertexStride + offset + byteSize * dataLength) / byteSize;
      this.primitive.updateTypeCache[bufferIndex] = UpdateType.UPDATE_RANGE;
    } else if (this.primitive.updateTypeCache[bufferIndex] === UpdateType.UPDATE_RANGE) {
      const newRange = this._getUpdateRange(bufferIndex, (vertexIndex * vertexStride + offset) / byteSize, dataLength);
      this.primitive.updateRangeCache[bufferIndex].offset = newRange.offset;
      this.primitive.updateRangeCache[bufferIndex].end = newRange.end;
    }
  }

  private _getUpdateRange(bufferIndex: number, offset: number, length: number) {
    const updateRange = this.primitive.updateRangeCache[bufferIndex];
    const rangeEnd1 = this.primitive.updateRangeCache[bufferIndex].end;
    const _offset = Math.min(offset, updateRange.offset);
    const rangeEnd2 = offset + length;
    const _end = rangeEnd1 <= rangeEnd2 ? rangeEnd2 : rangeEnd1;
    return { offset: _offset, end: _end };
  }
}
