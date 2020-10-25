import { Vector3 } from "@alipay/o3-math";
import { FrontFace } from "../base/Constant";
import { Engine } from "../Engine";
import { ShapeGeometry } from "./ShapeGeometry";

/**
 * SphereGeometry 球体创建类
 */
export class CylinderGeometry extends ShapeGeometry {
  public FrontFace;
  public index;
  public indexArray;
  public halfHeight;
  private _parameters;
  private _vertices;
  private _indices;

  /**
   * @param  engine - 所属引擎
   * @param  radiusTop - 顶部圆柱的半径。 默认值为1。
   * @param  radiusBottom - 底部圆柱的半径。 默认值为1。
   * @param  height - 圆柱的高度 。 默认值为1。
   * @param  radialSegments - 圆柱体圆周周围的分割面数。 默认值为8
   * @param  heightSegments - 沿圆柱高度的面的行数。 默认值为1。
   * @param  openEnded - 一个布尔值，指示圆柱的末端是打开还是加盖。 默认值为false，表示上限。
   * @param  thetaStart - 第一段的起始角度，默认= 0（三点钟位置）。
   * @param  thetaLength - 圆形扇区的中心角，通常称为theta。 默认值为2 * Pi，这样可以获得完整的柱面。
   */
  constructor(
    engine: Engine,
    radiusTop: number = 1,
    radiusBottom: number = 1,
    height: number = 1,
    radialSegments: number = 8,
    heightSegments: number = 1,
    openEnded: boolean = false,
    thetaStart: number = 0,
    thetaLength: number = 2 * Math.PI,
    frontFace: FrontFace = FrontFace.CCW
  ) {
    super(engine);
    this.FrontFace = frontFace;
    this._parameters = {
      radiusTop: radiusTop,
      radiusBottom: radiusBottom,
      height: height,
      radialSegments: radialSegments,
      heightSegments: heightSegments,
      openEnded: openEnded,
      thetaStart: thetaStart,
      thetaLength: thetaLength
    };

    this._vertices = [];
    this._indices = [];

    this.index = 0;
    this.indexArray = [];
    this.halfHeight = this._parameters.height / 2;

    this.generateTorso();

    if (this._parameters.openEnded === false) {
      if (this._parameters.radiusTop > 0) this.generateCap(true);
      if (this._parameters.radiusBottom > 0) this.generateCap(false);
    }

    this._initialize(engine, Float32Array.from(this._vertices), Uint16Array.from(this._indices));
  }

  generateTorso() {
    const { radialSegments, heightSegments, radiusBottom, radiusTop, height } = this._parameters;
    let x, y;
    const normal: Vector3 = new Vector3();
    const slope = (radiusBottom - radiusTop) / height;
    for (y = 0; y <= heightSegments; y++) {
      const indexRow = [];
      const v = y / heightSegments;
      const radius = v * (radiusBottom - radiusTop) + radiusTop;
      for (x = 0; x <= radialSegments; x++) {
        const u = x / radialSegments;
        const theta = u * this._parameters.thetaLength + this._parameters.thetaStart;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        // vertex
        const vertX = radius * sinTheta;
        const vertY = -v * height + this.halfHeight;
        const vertZ = radius * cosTheta;
        this._vertices.push(vertX, vertY, vertZ);

        // normal
        normal.setValue(sinTheta, slope, cosTheta);
        normal.normalize();
        this._vertices.push(normal.x, normal.y, normal.z);

        // uv
        if (this.FrontFace === FrontFace.CCW) {
          this._vertices.push(u, v);
        } else {
          this._vertices.push(1 - u, v);
        }

        indexRow.push(this.index++);
      }

      this.indexArray.push(indexRow);
    }

    for (x = 0; x < radialSegments; x++) {
      for (y = 0; y < heightSegments; y++) {
        var a = this.indexArray[y][x];
        var b = this.indexArray[y + 1][x];
        var c = this.indexArray[y + 1][x + 1];
        var d = this.indexArray[y][x + 1];

        // faces
        this._indices.push(a, b, d);
        this._indices.push(b, c, d);
      }
    }
  }

  generateCap(isTop) {
    const { radialSegments } = this._parameters;
    let x;
    const radius = isTop === true ? this._parameters.radiusTop : this._parameters.radiusBottom;
    const sign = isTop === true ? 1 : -1;
    const centerIndexStart = this.index;

    for (x = 1; x <= radialSegments; x++) {
      // vertex
      this._vertices.push(0, this.halfHeight * sign, 0);

      // normal
      this._vertices.push(0, sign, 0);

      // uv
      this._vertices.push(0.5, 0.5);

      // increase index
      this.index++;
    }
    const centerIndexEnd = this.index;

    for (x = 0; x <= radialSegments; x++) {
      const u = x / radialSegments;
      const theta = u * this._parameters.thetaLength + this._parameters.thetaStart;
      const cosTheta = Math.cos(theta);
      const sinTheta = Math.sin(theta);

      // vertex
      const vertexX = radius * sinTheta;
      const vertexY = this.halfHeight * sign;
      const vertexZ = radius * cosTheta;
      this._vertices.push(vertexX, vertexY, vertexZ);

      // normal
      this._vertices.push(0, sign, 0);

      // uv
      const uvX = cosTheta * 0.5 + 0.5;
      const uvY = sinTheta * 0.5 * sign + 0.5;
      this._vertices.push(uvX, uvY);

      // increase index
      this.index++;
    }

    for (x = 0; x < radialSegments; x++) {
      var c = centerIndexStart + x;
      var i = centerIndexEnd + x;
      if (isTop === true) {
        // face top
        this._indices.push(i, i + 1, c);
      } else {
        // face bottom
        this._indices.push(i + 1, i, c);
      }
    }
  }
}
