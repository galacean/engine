import { Matrix, Vector3 } from "@alipay/o3-math";
import { AssetObject } from "../asset/AssetObject";
import { TypedArray, UpdateType } from "../base/Constant";
import { Primitive } from "../primitive/Primitive";
import { DataMap, UpdateRangeMap, UpdateTypeMap } from "../primitive/type";
import { BufferUtil } from "./graphic/BufferUtil";
import { VertexBufferBinding } from "./graphic/VertexBufferBinding";
import { VertexElements } from "./graphic/VertexElement";
import { IndexBuffer } from "./index";

let geometryCount = 0;

/**
 * BufferGeometry 几何体创建类
 * @extends AssetObject
 */
export class BufferGeometry extends AssetObject {
  primitive: Primitive;
  bounds: any = {};
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
  addVertexBuffer(vertexBuffer: VertexBufferBinding, data: TypedArray) {
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
    const declaration = this.primitive.vertexDeclaration;
    const element = this.primitive.vertexAttributes[semantic];
    const bufferIndex = element.vertexBufferSlot;
    const byteSize = BufferUtil._getVertexDataTypeSize(element._glElementInfo.type);
    const dataOffset = element.offset / byteSize;
    const totalSize = declaration.elements.map((item) => item._glElementInfo.size).reduce((a, b) => a + b);
    const bufferOffset = offset * byteSize + element.offset;

    if (dataCount !== undefined) {
      data = data.slice(dataIndex, dataCount);
    }
    // if (declaration.elements.length > 1) {
    //   const _offset = offset * totalSize + dataOffset;
    //   this.dataCache[bufferIndex].set(data, _offset);
    //   this._udpateInterleavedFlag(semantic, offset, byteSize, data.length);
    // } else {
    this.dataCache[bufferIndex].set(data, offset);
    this._updateFlag(bufferIndex, offset, bufferOffset, data.length);
    // }
  }

  resizeVertexBuffer(semantic: string, data: TypedArray) {
    const element = this.primitive.vertexAttributes[semantic];
    const bufferIndex = element.vertexBufferSlot;
    this.dataCache[bufferIndex] = data;
    const vertexBufferBinding = this.primitive.vertexBufferBindings[bufferIndex];
    const { buffer: vertexBuffer, stride } = vertexBufferBinding;

    const byteSize = BufferUtil._getVertexDataTypeSize(element._glElementInfo.type);
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
    const bufferIndex = this.primitive.vertexAttributes[semantic].vertexBufferSlot;
    return this.dataCache[bufferIndex];
  }

  /**
   * 通过 primitive 计算本地/世界坐标系的 min/max
   * @param - modelMatrix - Local to World矩阵,如果传此值，则计算min/max时将考虑RTS变换，如果不传，则计算local min/max
   * @param - littleEndian - 是否以小端字节序读取，默认true
   * */
  _getMinMax(data: ArrayBuffer | Float32Array, littleEndian = true): any {
    const vertexElement = this.primitive.vertexAttributes["POSITION"];
    const bufferIndex = vertexElement.vertexBufferSlot;
    const stride = this.primitive.vertexBufferBindings[bufferIndex].stride;
    const offset = vertexElement.offset;
    const vertexCount = this.vertexCount;
    let arrayBuffer: TypedArray | ArrayBuffer = this.dataCache[bufferIndex] || data;
    if (!(arrayBuffer instanceof ArrayBuffer)) {
      arrayBuffer = arrayBuffer.buffer;
    }
    const dataView = new DataView(arrayBuffer, offset);

    let min = new Vector3(Infinity, Infinity, Infinity);
    let max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < vertexCount; i++) {
      const base = offset + stride * i;
      const position = new Vector3(
        dataView.getFloat32(base, littleEndian),
        dataView.getFloat32(base + 4, littleEndian),
        dataView.getFloat32(base + 8, littleEndian)
      );
      Vector3.min(min, position, min);
      Vector3.max(max, position, max);
    }

    this.bounds.min = min;
    this.bounds.max = max;
  }

  getMinMax(modelMatrix?: Matrix): any {
    const min = new Vector3();
    const max = new Vector3();
    if (modelMatrix) {
      Vector3.transformCoordinate(this.bounds.min, modelMatrix, min);
      Vector3.transformCoordinate(this.bounds.max, modelMatrix, max);
    } else {
      this.bounds.min.cloneTo(min);
      this.bounds.max.cloneTo(max);
    }
    return {
      min: min,
      max: max
    };
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
    const { vertexBufferBindings: vertexBuffers } = primitive;
    const { bufferOffset, offset, end } = updateRange;
    const data = this.dataCache[index];
    const vertexBuffer = vertexBuffers[index].buffer;
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
    const data = <Uint8Array | Uint16Array | Uint32Array>this.dataCache.index;
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
    const vertexBuffer = this.primitive.vertexBufferBindings;
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
    const vertexElement = this.primitive.vertexAttributes[semantic];
    const bufferIndex = vertexElement.vertexBufferSlot;
    const vertexStride = this.primitive.vertexBufferBindings[bufferIndex].stride;
    const offset = vertexElement.offset;
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
