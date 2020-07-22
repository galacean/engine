import { Logger } from "@alipay/o3-base";
import { AssetObject } from "@alipay/o3-core";
import { Primitive } from "@alipay/o3-primitive";
import { VertexBuffer, IndexBuffer } from "./buffer";

let geometryCount = 0;

/**
 * BufferGeometry 几何体创建类
 * @extends AssetObject
 */
export class BufferGeometry extends AssetObject {
  primitive: Primitive;
  attributes: {};
  private vertexBufferCount: number;
  private indexBufferCount: number;

  /**
   * @constructor
   * @param {string} name 名称
   */
  constructor(name?: string) {
    name = name || "bufferGeometry" + geometryCount++;
    super(name);
    this.vertexBufferCount = 0;
    this.indexBufferCount = 0;
    this.primitive = new Primitive();
  }

  // 添加 vertex buffer
  addVertexBufferParam(vertexBuffer: VertexBuffer) {
    const attrList = vertexBuffer.attributes;
    const attrCount = attrList.length;
    vertexBuffer.startBufferIndex = this.vertexBufferCount;
    if (vertexBuffer.isInterleaved) {
      this.vertexBufferCount += 1;
    } else {
      this.vertexBufferCount += attrCount;
    }
    for (let i = 0; i < attrCount; i += 1) {
      const attr = vertexBuffer.attributes[i];
      this.primitive.addAttribute(attr);
    }
    this.primitive.vertexBuffer = this.primitive.vertexBuffer.concat(vertexBuffer.buffers);
  }

  // 设置 vertex buffer 数据
  setVertexBufferData(
    semantic: string,
    vertexValues,
    bufferOffset: number = 0,
    dataStartIndex: number = 0,
    dataCount: number = Number.MAX_SAFE_INTEGER
  ) {
    const attributes = this.primitive.attributes;
    const vertexAttrib = attributes[semantic];
    if (vertexAttrib === undefined) {
      Logger.error("UNKNOWN semantic: " + name);
      return null;
    }
    const { vertexBufferIndex, interleaved } = vertexAttrib;
  }

  // 根据 vertexIndex 设置 buffer数据
  setVertexBufferDataByIndex(semantic: string, vertexIndex: number, value: number[] | Float32Array) {}

  // 获取buffer数据
  getVertexBufferData(semantic: string) {}
  getVertexBufferDataByIndex(semantic: string, index: number) {}

  // 添加 index buffer
  addIndexBufferParam(indexBuffer: IndexBuffer) {
    indexBuffer.index = this.indexBufferCount;
    this.indexBufferCount += 1;
    this.primitive.indexBuffers = this.primitive.indexBuffers.concat(indexBuffer.buffer);
  }

  // 设置 index buffer 数据
  setIndexBufferData(
    bufferIndex,
    indexValues,
    bufferOffset: number = 0,
    dataStartIndex: number = 0,
    dataCount: number = 4294967295 /*uint.MAX_VALUE*/
  ) {}

  // 获取所有三角形顶点对应的几何体顶点序号
  getIndexBufferData() {}

  // 获取三角形顶点序号的几何体顶点序号
  getIndexBufferDataByIndex(index: number) {}

  // 设置绘制模式
  set mode(value) {}
  get mode() {
    return;
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
}
