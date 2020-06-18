import { DataType } from "@alipay/o3-base";
import { IndexBufferGeometry } from "@alipay/o3-geometry";

/**
 * PlaneGeometry 四边形
 * @extends BufferGeometry
 */
export class PlaneGeometry extends IndexBufferGeometry {
  public _width: any;
  public _height: any;
  public _widthSegments: any;
  public _heightSegments: any;

  /**
   * @constructor
   * @param {number} width 宽度
   * @param {number} height 高度
   */
  constructor(width, height, widthSegments?, heightSegments?) {
    super();
    this._width = width;
    this._height = height;
    this._widthSegments = widthSegments || 1;
    this._heightSegments = heightSegments || 1;

    this.initialize();
  }

  initialize() {
    let halfWidth = this._width / 2;
    let halfHeight = this._height / 2;

    let segWidth = this._width / this._widthSegments;
    let segHeight = this._height / this._heightSegments;

    let vertexValues = [];
    let indexValues = [];

    let w = this._widthSegments;
    let h = this._heightSegments;

    let posX = -halfWidth;
    let posY = -halfHeight;
    let posZ = 0;
    for (let x = 0; x <= w; x++) {
      for (let y = 0; y <= h; y++) {
        vertexValues.push({
          POSITION: [posX, posY, posZ],
          NORMAL: [0, 0, 1],
          TEXCOORD_0: [x / w, 1 - y / h]
        });
        posY += segHeight;
      }
      posX += segWidth;
      posY = -halfHeight;
    }

    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let a = y + (h + 1) * x;
        let b = y + (h + 1) * (x + 1);
        let c = y + 1 + (h + 1) * (x + 1);
        let d = y + 1 + (h + 1) * x;

        indexValues.push(a, b, d);
        indexValues.push(b, c, d);
      }
    }

    super.initialize(
      [
        { semantic: "POSITION", size: 3, type: DataType.FLOAT, normalized: false },
        { semantic: "NORMAL", size: 3, type: DataType.FLOAT, normalized: true },
        { semantic: "TEXCOORD_0", size: 2, type: DataType.FLOAT, normalized: true }
      ],
      (w + 1) * (h + 1),
      indexValues
    );

    this.setAllVertexValues(vertexValues);
  }
}
