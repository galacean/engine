import { Logger, UpdateType } from '@alipay/r3-base';
import { AssetObject } from '@alipay/r3-core';
import { Primitive } from '@alipay/r3-primitive';

import { getVertexDataTypeSize, getVertexDataTypeDataView } from './Constant';

let geometryCount = 0;

/**
 * BufferGeometry 几何体创建类
 * @extends AssetObject
 */
export class BufferGeometry extends AssetObject {

  primitive;

  stride: number;

  attributes;
  /**
   * @constructor
   * @param {string} name 名称
   */
  constructor(name?: string) {

    name = name || 'bufferGeometry' + geometryCount++;
    super(name);

    this.primitive = new Primitive();
    this.stride = 0;

  }

  /**
   * 顶点属性
   * @typedef {Object} Attribute
   * @property {string} semantic 语义
   * @property {number} type 数据类型常量
   * @property {string} size 所占空间字节长度
   * @property {boolean} normalized 归一化映射
   */

  /**
   * 初始化
   * @param {Attribute[]} attributes 顶点属性数组
   * @param {number} vertexCount 所有三角形顶点总个数
   * @param {number} usage 数据绘制类型常量，默认为静态类型 STATIC_DRAW，需要更新数据时使用动态类型 DYNAMIC_DRAW
   */
  initialize(attributes, vertexCount, usage?) {

    const attribCount = attributes.length;
    let stride = 0;
    for (let i = 0; i < attribCount; i++) {

      const attribute = attributes[i];
      attributes[i].offset = stride;
      stride += this._getSizeInByte(attribute.size, attribute.type);

    }

    for (let i = 0; i < attribCount; i++) {

      const attribute = attributes[i];
      this.primitive.addAttribute(attribute.semantic, attribute.size, attribute.type, attribute.normalized, stride, attribute.offset, 0);

    }

    this.primitive.vertexBuffers[0] = new ArrayBuffer(vertexCount * stride);
    this.primitive.vertexCount = vertexCount;
    if (usage) {

      this.primitive.usage = usage;

    }
    this.attributes = attributes;
    this.stride = stride;

  }

  /**
   * 获取顶点数
   * @readonly
   * @returns {number} 顶点数
   */
  get vertexCount() {

    return this.primitive.vertexCount;

  }

  /**
   * 设置渲染模式
   * @param {string} mode 渲染模式常量
   */
  set mode(mode) {

    this.primitive.mode = mode;

  }

  /**
   * 获取渲染模式
   * @returns {number} 渲染模式常量
   */
  get mode() {

    return this.primitive.mode;

  }

  /**
   * 批量设置所有顶点的属性数据
   * @param {Array} vertexValues 顶点的属性数据对象列表
   */
  setAllVertexValues(vertexValues) {

    if (Array.isArray(vertexValues)) {

      vertexValues.forEach((values, index) => {

        this.setVertexValues(index, values);

      });

    }

  }

  /**
   * 设置顶点的所有属性数据
   * @param {number} vertexIndex 顶点序号
   * @param {Object} values 顶点的属性数据对象，对象的属性为顶点属性的名称，值为顶点属性的数据
   */
  setVertexValues(vertexIndex, values) {

    if (typeof (values) === 'object') {

      for (const name in values) {

        if (values.hasOwnProperty(name)) {

          const value = values[name];
          this.setValue(name, vertexIndex, value);

        }

      }

    }

  }

  /**
   * 设置顶点的属性数据
   * @param {string} semantic 属性 semantic
   * @param {number} vertexIndex 顶点序号
   * @param {number[]} value 属性值
   */
  setValue(semantic: string, vertexIndex: number, value: number[] | Float32Array) {

    const vertexAttrib = this.primitive.vertexAttributes[semantic];
    if (vertexAttrib == undefined) {

      Logger.error('UNKNOWN semantic: ' + semantic);
      return false;

    }
    if (vertexIndex >= this.primitive.vertexCount) {

      Logger.error('vertexIndex: ' + vertexIndex + ' out of range: ' + this.primitive.vertexCount);
      return false;

    }

    if (value.length !== vertexAttrib.size) {

      Logger.error('value size MUST be equal to vertexAttrib size: ' + value.length);
      return false;

    }
    const constructor = getVertexDataTypeDataView(vertexAttrib.type);
    const byteOffset = vertexAttrib.offset + vertexAttrib.stride * vertexIndex;
    const length = vertexAttrib.size;
    const view = new constructor(this.primitive.vertexBuffers[0], byteOffset, length);

    view.set(value);

    // 数据更新时修改更新状态为 UPDATE_RANGE
    if (this.primitive.updateType === UpdateType.NO_UPDATE) {

      this.primitive.updateType = UpdateType.UPDATE_RANGE;

    }
    // 设置更新范围
    if (this.primitive.updateType === UpdateType.UPDATE_RANGE) {

      const byteLength = this._getSizeInByte(vertexAttrib.size, vertexAttrib.type);
      if (this.primitive.updateRange.byteOffset < 0) {

        this.primitive.updateRange.byteOffset = byteOffset;
        this.primitive.updateRange.byteLength = byteLength;

      } else {

        this._getUpdateRange(byteOffset, byteLength);

      }

    }

    return true;

  }

  /**
   * 获取顶点所有属性的值
   * @param {number} index 顶点序号
   * @returns {Object} 顶点数据集
   */
  getVertexValues(index) {

    const vertexAttributes = this.primitive.vertexAttributes;
    const values = {};
    for (const semantic in vertexAttributes) {

      if (vertexAttributes.hasOwnProperty(semantic)) {

        values[semantic] = this.getValue(semantic, index);

      }

    }
    return values;

  }

  /**
   * 获取顶点属性的值
   * @param {string} name 属性名称
   * @param {number} vertexIndex 顶点序号
   * @returns {TypedArray} 顶点数据
   */
  getValue(name, vertexIndex) {

    const vertexAttrib = this.primitive.vertexAttributes[name];
    if (vertexAttrib === undefined) {

      Logger.error('UNKNOWN name: ' + name);
      return null;

    }
    if (vertexIndex >= this.primitive.vertexCount) {

      Logger.error('vertexIndex: ' + vertexIndex + ' out of range: ' + this.primitive.vertexCount);
      return null;

    }
    const constructor = getVertexDataTypeDataView(vertexAttrib.type);

    return new constructor(this.primitive.vertexBuffers[0], vertexAttrib.offset + vertexAttrib.stride * vertexIndex, vertexAttrib.size);

  }

  /**
   * 获取更新范围
   * @param {number} byteOffset 字节偏移
   * @param {number} byteLength 字节长度
   * @private
   */
  _getUpdateRange(byteOffset, byteLength) {

    const updateRange = this.primitive.updateRange;
    const rangeEnd1 = updateRange.byteOffset + updateRange.byteLength;
    updateRange.byteOffset = Math.min(byteOffset, updateRange.byteOffset);
    const rangeEnd2 = byteOffset + byteLength;
    updateRange.byteLength = rangeEnd1 <= rangeEnd2 ? rangeEnd2 - updateRange.byteOffset : rangeEnd1 - updateRange.byteOffset;

  }

  /**
   * 获取当前类型的数据所占字节数
   * @param {Number} size 所占空间长度
   * @param {Number} type 数据类型常量
   * @private
   */
  _getSizeInByte(size, type) {

    const num = getVertexDataTypeSize(type);
    if (num) {

      return size * num;

    } else {

      Logger.error('UNKNOWN vertex attribute type: ' + type);
      return 0;

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

}
