import { getVertexDataTypeSize, getVertexDataTypeDataView } from './Constant';
import { BufferGeometry } from './BufferGeometry';

/**
 * IndexBufferGeometry 几何体创建类，当很多顶点共享，且该共享顶点在不同三角形内的数据完全相同时使用，可以节省大量空间
 * @extends BufferGeometry
 */
export class IndexBufferGeometry extends BufferGeometry {

  /**
   * @constructor
   * @param {String} name 名称
   */
  constructor(name?) {

    super(name);
    this.primitive.indexNeedUpdate = false;

  }

  /**
   * 初始化
   * @param {Attribute[]} attributes 顶点属性数组
   * @param {number} vertexCount 几何体顶点总个数
   * @param {Array} indexValues 顶点序号数组
   * @param {number} usage 数据绘制类型，默认为静态类型 STATIC_DRAW，需要更新数据时使用动态类型 DYNAMIC_DRAW
   */
  initialize(attributes, vertexCount: number, indexValues?, usage?) {

    super.initialize(attributes, vertexCount, usage);
    this.primitive.indexCount = indexValues.length;
    const stride = getVertexDataTypeSize(this.primitive.indexType);
    this.primitive.indexBuffer = new ArrayBuffer(indexValues.length * stride);
    this._setAllIndex(indexValues);

  }

  /**
   * 设置所有三角形顶点对应的几何体顶点序号
   * @param {Array} values 顶点序号数组
   * @private
   */
  _setAllIndex(values) {

    const constructor = getVertexDataTypeDataView(this.primitive.indexType);
    const view = new constructor(this.primitive.indexBuffer);
    view.set(values);

  }

  setAllIndex(values) {

    this._setAllIndex(values);
    this.primitive.indexNeedUpdate = true;

  }

  /**
   * 获取所有三角形顶点对应的几何体顶点序号
   * @returns {TypedArray} 几何体顶点序号集
   */
  getAllIndex() {

    const constructor = getVertexDataTypeDataView(this.primitive.indexType);
    return new constructor(this.primitive.indexBuffer);

  }

  /**
   * 获取三角形顶点序号的几何体顶点序号
   * @param {number} index 三角形顶点序号
   * @returns {TypedArray} 几何体顶点序号
   */
  getIndex(index) {

    const constructor = getVertexDataTypeDataView(this.primitive.indexType);
    const stride = getVertexDataTypeSize(this.primitive.indexType);
    const byteOffset = stride * index;
    const length = getVertexDataTypeSize(this.primitive.indexType);
    return new constructor(this.primitive.indexBuffer, byteOffset, length);

  }

}
