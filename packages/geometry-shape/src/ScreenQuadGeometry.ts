import { DataType, DrawMode } from "@alipay/o3-core";
import { BufferGeometry } from "@alipay/o3-geometry";

/**
 * 覆盖整个屏幕的一个矩形
 * @private
 */
export class ScreenQuadGeometry extends BufferGeometry {
  constructor() {
    super();
    this.initialize();
  }

  /**
   * 初始化，构造两个三角形组成的矩形
   */
  initialize() {
    super.initialize(
      [
        { name: "a_position", semantic: "POSITION", size: 2, type: DataType.FLOAT, normalized: false },
        { name: "a_uv", semantic: "TEXCOORD_0", size: 2, type: DataType.FLOAT, normalized: false }
      ],
      4
    );

    this.setValue("POSITION", 0, Float32Array.from([-1, -1]));
    this.setValue("TEXCOORD_0", 0, Float32Array.from([0, 0]));

    this.setValue("POSITION", 1, Float32Array.from([1, -1]));
    this.setValue("TEXCOORD_0", 1, Float32Array.from([1, 0]));

    this.setValue("POSITION", 2, Float32Array.from([1, 1]));
    this.setValue("TEXCOORD_0", 2, Float32Array.from([1, 1]));

    this.setValue("POSITION", 3, Float32Array.from([-1, 1]));
    this.setValue("TEXCOORD_0", 3, Float32Array.from([0, 1]));

    this.primitive.mode = DrawMode.TRIANGLE_FAN;
  }
}
