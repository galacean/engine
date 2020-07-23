import { DataType } from "@alipay/o3-base";
import { IndexBufferGeometry } from "@alipay/o3-geometry";

/**
 * SphereGeometry 球体创建类
 * @extends IndexBufferGeometry
 */
export class SphereGeometry extends IndexBufferGeometry {
  private _parameters;
  private _thetaEnd;

  /**
   * @constructor
   * @param {number} radius 半径
   * @param {number} horizontalSegments 水平分段数
   * @param {number} verticalSegments 垂直分段数
   * @param {number} alphaStart 水平开始角度
   * @param {number} alphaRange 水平角度范围
   * @param {number} thetaStart 垂直开始角度
   * @param {number} thetaRange 垂直角度范围
   */
  constructor(
    radius?: number,
    horizontalSegments?: number,
    verticalSegments?: number,
    alphaStart?: number,
    alphaRange?: number,
    thetaStart?: number,
    thetaRange?: number
  ) {
    super();
    this._parameters = {
      radius: radius || 1,
      horizontalSegments: Math.max(3, Math.floor(horizontalSegments) || 8),
      verticalSegments: Math.max(2, Math.floor(verticalSegments) || 6),
      alphaStart: alphaStart || 0,
      alphaRange: alphaRange || Math.PI * 2,
      thetaStart: thetaStart || 0,
      thetaRange: thetaRange || Math.PI
    };
    this._thetaEnd = this._parameters.thetaStart + this._parameters.thetaRange;
    this.initialize();
  }

  /**
   * 构造球体数据
   * @private
   */
  initialize() {
    const vertexCount = (this._parameters.verticalSegments + 1) * (this._parameters.horizontalSegments + 1);
    // commented planeCount & shereVertexPlaneCount since never been used.
    // const planeCount = this._parameters.verticalSegments * ( this._parameters.horizontalSegments );
    // let shereVertexPlaneCount = 0;
    // if( this._parameters.thetaStart === 0 ) {

    //   shereVertexPlaneCount += this._parameters.horizontalSegments;

    // }
    // if( this._thetaEnd === Math.PI ) {

    //   shereVertexPlaneCount += this._parameters.horizontalSegments;

    // }

    // 生成经纬线上的几何体顶点的数据
    let index = 0;
    const grid = [];
    const vertexValues = [];
    const indexValues = [];
    // const positions = [];
    for (let iy = 0; iy <= this._parameters.verticalSegments; iy++) {
      const verticesRow = [];
      const v = iy / this._parameters.verticalSegments;
      for (let ix = 0; ix <= this._parameters.horizontalSegments; ix++) {
        const u = ix / this._parameters.horizontalSegments;
        let posX =
          -this._parameters.radius *
          Math.cos(this._parameters.alphaStart + u * this._parameters.alphaRange) *
          Math.sin(this._parameters.thetaStart + v * this._parameters.thetaRange);
        let posY = this._parameters.radius * Math.cos(this._parameters.thetaStart + v * this._parameters.thetaRange);
        let posZ =
          this._parameters.radius *
          Math.sin(this._parameters.alphaStart + u * this._parameters.alphaRange) *
          Math.sin(this._parameters.thetaStart + v * this._parameters.thetaRange);
        posX = Math.abs(posX) < 1e-6 ? 0 : posX;
        posY = Math.abs(posY) < 1e-6 ? 0 : posY;
        posZ = Math.abs(posZ) < 1e-6 ? 0 : posZ;

        vertexValues.push({
          POSITION: [posX, posY, posZ],
          NORMAL: [posX, posY, posZ],
          TEXCOORD_0: [u, 1 - v]
        });
        verticesRow.push(index++);
      }
      grid.push(verticesRow);
    }

    // 生成所有三角形顶点序号
    for (let iy = 0; iy < this._parameters.verticalSegments; iy++) {
      for (let ix = 0; ix < this._parameters.horizontalSegments; ix++) {
        const a = grid[iy][ix + 1];
        const b = grid[iy][ix];
        const c = grid[iy + 1][ix];
        const d = grid[iy + 1][ix + 1];

        if (iy !== 0 || this._parameters.thetaStart > 0) indexValues.push(a, b, d);
        if (iy !== this._parameters.verticalSegments - 1 || this._thetaEnd < Math.PI) indexValues.push(b, c, d);
      }
    }

    super.initialize(
      [
        { semantic: "POSITION", size: 3, type: DataType.FLOAT, normalized: false },
        { semantic: "NORMAL", size: 3, type: DataType.FLOAT, normalized: true },
        { semantic: "TEXCOORD_0", size: 2, type: DataType.FLOAT, normalized: true }
      ],
      vertexCount,
      indexValues
    );
    this.setAllVertexValues(vertexValues);
  }
}
