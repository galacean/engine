import { Logger } from "@alipay/o3-base";
import { AssetObject } from "@alipay/o3-core";
import { Primitive } from "@alipay/o3-primitive";
import { VertexBuffer, IndexBuffer } from "./index";

let geometryCount = 0;

/**
 * BufferGeometry 几何体创建类
 * @extends AssetObject
 */
export class BufferGeometryNew extends AssetObject {
  primitive: Primitive;
  attributes: {};
  private _indexBufferIndex: number;
  private _vertexBuffers: VertexBuffer[];
  private _indexBuffers: IndexBuffer[];

  get indexBufferIndex() {
    return this._indexBufferIndex;
  }

  set indexBufferIndex(value: number) {
    this._indexBufferIndex = value;
    this.primitive.indexBufferIndex = value;
    this.primitive.indexNeedUpdate = true;
  }

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

  /**
   * @constructor
   * @param {string} name 名称
   */
  constructor(name?: string) {
    name = name || "bufferGeometry" + geometryCount++;
    super(name);
    this._indexBufferIndex = 0;
    this._vertexBuffers = [];
    this._indexBuffers = [];
    this.primitive = new Primitive();
  }

  // 添加 vertex buffer
  addVertexBufferParam(vertexBuffer: VertexBuffer) {
    const attrList = vertexBuffer.attributes;
    const attrCount = attrList.length;
    vertexBuffer._initialize(this.primitive.vertexBuffers.length);
    for (let i = 0; i < attrCount; i += 1) {
      const attr = vertexBuffer.attributes[i];
      this.primitive.addAttribute(attr);
    }
    this._vertexBuffers.push(vertexBuffer);
    this.primitive.vertexBuffers = this.primitive.vertexBuffers.concat(vertexBuffer.buffers);
  }

  // 设置 vertex buffer 数据
  setVertexBufferData(
    semantic: string,
    vertexValues: number[] | Float32Array,
    dataStartIndex: number = 0,
    bufferOffset: number = 0,
    dataCount: number = Number.MAX_SAFE_INTEGER
  ) {
    const vertexBuffer = this._getBufferBySemantic(semantic);
    if (vertexBuffer) {
      vertexBuffer.setData(semantic, vertexValues, dataStartIndex, bufferOffset, dataCount);
    }
  }

  // 根据 vertexIndex 设置 buffer数据
  setVertexBufferDataByIndex(semantic: string, vertexIndex: number, value: number[] | Float32Array) {
    const vertexBuffer = this._getBufferBySemantic(semantic);
    if (vertexBuffer) {
      vertexBuffer.setDataByIndex(semantic, vertexIndex, value);
    }
  }

  // 获取buffer数据
  getVertexBufferData(semantic: string) {
    const vertexBuffer = this._getBufferBySemantic(semantic);
    if (vertexBuffer) {
      return vertexBuffer.getData(semantic);
    }
  }

  // 根据顶点序号获取buffer数据
  getVertexBufferDataByIndex(semantic: string, index: number) {
    const vertexBuffer = this._getBufferBySemantic(semantic);
    if (vertexBuffer) {
      return vertexBuffer.getDataByIndex(semantic, index);
    }
  }

  // 添加 index buffer
  addIndexBufferParam(indexBuffer: IndexBuffer) {
    this._indexBuffers.push(indexBuffer);
    this.primitive.indexCount = indexBuffer.indexCount;
    this.primitive.indexBuffers = this.primitive.indexBuffers.concat(indexBuffer.buffer);
    this.primitive.indexBuffer = indexBuffer.buffer;
  }

  // 设置 index buffer 数据
  setIndexBufferData(
    indexValues,
    dataStartIndex: number = 0,
    bufferOffset: number = 0,
    dataCount: number = 4294967295 /*uint.MAX_VALUE*/
  ) {
    const indexBuffer = this._indexBuffers[this._indexBufferIndex];
    if (indexBuffer) {
      indexBuffer.setData(indexValues, dataStartIndex, bufferOffset, dataCount);
      this.primitive.indexNeedUpdate = true;
    }
  }

  setIndexBufferDataByIndex(index: number, value) {
    const indexBuffer = this._indexBuffers[this._indexBufferIndex];
    if (indexBuffer) {
      indexBuffer.setData(index, value);
    }
  }

  // 获取所有三角形顶点对应的几何体顶点序号
  getIndexBufferData() {
    const indexBuffer = this._indexBuffers[this._indexBufferIndex];
    if (indexBuffer) {
      return indexBuffer.getData();
    }
  }

  // 获取三角形顶点序号的几何体顶点序号
  getIndexBufferDataByIndex(index: number) {
    const indexBuffer = this._indexBuffers[this._indexBufferIndex];
    if (indexBuffer) {
      return indexBuffer.getDataByIndex(index);
    }
  }

  /**
   * 释放内部资源对象
   * @private
   */
  _finalize() {
    super._finalize();
    this.primitive.finalize();
    this.primitive = null;
  }

  private _getBufferBySemantic(semantic: string): VertexBuffer | undefined {
    const attributes = this.primitive.attributes;
    const vertexAttrib = attributes[semantic];
    if (vertexAttrib === undefined) {
      Logger.error("UNKNOWN semantic: " + name);
      return;
    }

    const matchBuffer = this._vertexBuffers.filter((vertexBuffer) => vertexBuffer.semanticList.includes(semantic));
    if (matchBuffer.length > 1) {
      Logger.error("Duplicated semantic: " + name);
      return;
    }

    return matchBuffer[0];
  }
}
