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
    if (dataCount !== undefined) {
      data = data.slice(dataIndex, dataCount);
    }
    this.primitive.dataCache[bufferIndex].set(data, offset);
    if (declaration.elements.length > 1) {
      semantic;
    } else {
      this._updateFlag(bufferIndex, offset, byteSize, data.length);
    }
  }

  resizeVertexBuffer(bufferIndex: number, byteSize: number) {
    const buffer = this.primitive.vertexBuffers[bufferIndex];
    buffer.resize(byteSize);
  }

  setIndexBuffer(indexBuffer: IndexBuffer, data: TypedArray) {
    this.primitive.indexBuffer = indexBuffer;
    this.primitive.dataCache.index = data;
  }

  setIndexData(data: TypedArray, offset: number = 0, dataIndex: number = 0, dataCount?: number) {
    const buffer = this.primitive.indexBuffer;
    if (dataCount !== undefined) {
      data = data.slice(dataIndex, dataCount);
    }
    this.primitive.dataCache.index.set(data, offset);
    this._updateFlag("index", offset, buffer.elementByteCount, data.length);
  }

  resizeIndexBuffer(byteSize: number) {
    this.primitive.indexBuffer.resize(byteSize);
  }

  /**
   * 释放内部资源对象
   */
  destroy() {
    this.primitive.destroy();
    this.primitive = null;
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

  private _updateFlag(bufferIndex: number | string, offset: number, byteSize: number, dataLength: number) {
    if (this.primitive.updateTypeCache[bufferIndex] === UpdateType.NO_UPDATE) {
      this.primitive.updateRangeCache[bufferIndex].offset = offset * byteSize;
      this.primitive.updateRangeCache[bufferIndex].end = offset * byteSize + byteSize * dataLength;
      this.primitive.updateTypeCache[bufferIndex] = UpdateType.UPDATE_RANGE;
    } else if (this.primitive.updateTypeCache[bufferIndex] === UpdateType.UPDATE_RANGE) {
      this.primitive.updateRangeCache[bufferIndex].offset = Math.min(
        this.primitive.updateRangeCache[bufferIndex].offset,
        offset * byteSize
      );
      this.primitive.updateRangeCache[bufferIndex].end = Math.max(
        this.primitive.updateRangeCache[bufferIndex].end,
        offset * byteSize + byteSize * dataLength
      );
    }
  }
}
