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
  setVertexBufferData(semantic: string, vertexValue) {
    // 根据semantic获取primitive中的attr，能够得到offset,stride,size,vertexBufferIndex
  }

  // 添加 index buffer
  addIndexBufferParam(indexBuffer: IndexBuffer) {
    indexBuffer.index = this.indexBufferCount;
    this.indexBufferCount += 1;
    this.primitive.indexBuffer = this.primitive.indexBuffer.concat(indexBuffer.buffer);
  }

  // 设置 index buffer 数据
  setIndexBufferData(bufferIndex, indexValues) {}

  // index操作
  getIndex() {} // 传了序号获取三角形顶点序号的

  // 数值设置
  setValue() {}
  // 数值获取
  getValue() {}

  set mode(value) {}
  get mode() {
    return;
  }

  _getUpdateRange() {}
  _getSizeInByte() {}

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
