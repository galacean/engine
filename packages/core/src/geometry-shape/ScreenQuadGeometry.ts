import { Engine } from "../Engine";
import { VertexElementFormat } from "../geometry/graphic/enums/VertexElementFormat";
import { VertexElement } from "../geometry/graphic/VertexElement";
import { GeometryShape } from "./GeometryShape";
import { PrimitiveTopology } from "../geometry/graphic/enums/PrimitiveTopology";

/**
 * 覆盖整个屏幕的一个矩形
 * @private
 */
export class ScreenQuadGeometry extends GeometryShape {
  constructor(engine?: Engine) {
    super();
    this.primitiveTopology = PrimitiveTopology.TRIANGLE_FAN;

    const vertices: Float32Array = new Float32Array([-1, -1, 0, 0, 0, 1, -1, 0, 1, 0, 1, 1, 0, 1, 1, -1, 1, 0, 0, 1]);

    const indices: Uint16Array = new Uint16Array([0, 1, 2, 3]);

    this._initialize(engine, vertices, indices);
  }

  _initialize(engine: Engine, vertices: Float32Array, indices: Uint16Array) {
    engine = engine || Engine._getDefaultEngine();

    const vertexStride = 20;
    const vertexElements = [
      new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
      new VertexElement("TEXCOORD_0", 12, VertexElementFormat.Vector2, 0)
    ];

    this._initBuffer(engine, vertices, indices, vertexStride, vertexElements);
  }
}
