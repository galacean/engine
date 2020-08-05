import { DataType, DrawMode } from "@alipay/o3-core";
import { BufferGeometry, InterleavedBuffer } from "@alipay/o3-geometry";
import { BufferAttribute } from "@alipay/o3-primitive";
import { vec2 } from "@alipay/o3-math";

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
    const position = new BufferAttribute({
      semantic: "POSITION",
      size: 3,
      type: DataType.FLOAT,
      normalized: false
    });
    const uv = new BufferAttribute({
      semantic: "TEXCOORD_0",
      size: 2,
      type: DataType.FLOAT,
      normalized: true
    });

    const buffer = new InterleavedBuffer([position, uv], 4);
    this.addVertexBufferParam(buffer);

    this.setVertexBufferDataByIndex("POSITION", 0, [-1, -1]);
    this.setVertexBufferDataByIndex("TEXCOORD_0", 0, [0, 0]);

    this.setVertexBufferDataByIndex("POSITION", 1, [1, -1]);
    this.setVertexBufferDataByIndex("TEXCOORD_0", 1, [1, 0]);

    this.setVertexBufferDataByIndex("POSITION", 2, [1, 1]);
    this.setVertexBufferDataByIndex("TEXCOORD_0", 2, [1, 1]);

    this.setVertexBufferDataByIndex("POSITION", 1, [-1, 1]);
    this.setVertexBufferDataByIndex("TEXCOORD_0", 1, [0, 1]);

    this.primitive.mode = DrawMode.TRIANGLE_FAN;
  }
}
