import { DataType } from "@alipay/o3-core";
import { BufferGeometry } from "@alipay/o3-geometry";

/**
 * CubeGeometry 长方体创建类
 * @extends BufferGeometry
 */
export class CuboidGeometry extends BufferGeometry {
  private _parameters;
  private _verts;
  private _normals;
  private _uvs;
  private _indexs;
  /**
   * @constructor
   * @param {number} width 宽
   * @param {number} height 高
   * @param {number} depth 长
   */
  constructor(width?: number, height?: number, depth?: number) {
    super();
    this._parameters = {
      width: width || 1,
      height: height || 1,
      depth: depth || 1
    };

    // 几何体顶点位置数据
    this._verts = [
      [-1, -1, -1],
      [1, -1, -1],
      [-1, 1, -1],
      [1, 1, -1],
      [-1, -1, 1],
      [1, -1, 1],
      [-1, 1, 1],
      [1, 1, 1]
    ];

    // 三角形顶点序号数据
    this._indexs = [
      7,
      5,
      1,
      3,
      7,
      1,

      2,
      0,
      4,
      6,
      2,
      4,

      2,
      6,
      7,
      3,
      2,
      7,

      4,
      0,
      1,
      5,
      4,
      1,

      6,
      4,
      5,
      7,
      6,
      5,

      3,
      1,
      0,
      2,
      3,
      0
    ];

    // 法线数据
    this._normals = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1]
    ];

    // uv 坐标数据
    this._uvs = [
      [0, 1],
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [1, 0]
    ];
    this.initialize();
  }

  /**
   * 构造长方体数据
   * @private
   */
  initialize() {
    super.initialize(
      [
        { semantic: "POSITION", size: 3, type: DataType.FLOAT, normalized: false },
        { semantic: "NORMAL", size: 3, type: DataType.FLOAT, normalized: true },
        { semantic: "TEXCOORD_0", size: 2, type: DataType.FLOAT, normalized: true }
      ],
      36
    );

    const widthHalf = this._parameters.width / 2;
    const heightHalf = this._parameters.height / 2;
    const depthHalf = this._parameters.depth / 2;
    this._indexs.forEach((vertIndex, i) => {
      const vert = this._verts[vertIndex];
      const pos = [vert[0] * widthHalf, vert[1] * heightHalf, vert[2] * depthHalf];
      const normalIndex = Math.floor(i / 6);
      const uvIndex = Math.ceil(i % 6);
      this.setVertexValues(i, {
        POSITION: pos,
        NORMAL: this._normals[normalIndex],
        TEXCOORD_0: this._uvs[uvIndex]
      });
    });
  }
}
