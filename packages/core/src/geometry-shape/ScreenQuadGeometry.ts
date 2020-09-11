import { DrawMode } from "../base/Constant";
import { Engine } from "../Engine";
import { GeometryShape } from "./GeometryShape";
import { VertexDeclaration } from "../geometry/graphic/VertexDeclaration";
import { VertexElement } from "../geometry/graphic/VertexElement";
import { VertexElementFormat } from "../geometry/graphic/enums/VertexElementFormat";

/**
 * 覆盖整个屏幕的一个矩形
 * @private
 */
export class ScreenQuadGeometry extends GeometryShape {
  constructor(engine?: Engine) {
    super();
    this.mode = DrawMode.TRIANGLE_FAN;

    const vertices: Float32Array = new Float32Array([-1, -1, 0, 0, 0, 1, -1, 0, 1, 0, 1, 1, 0, 1, 1, -1, 1, 0, 0, 1]);

    const indices: Uint16Array = new Uint16Array([0, 1, 2, 3]);

    this._initialize(engine, vertices, indices);
  }

  _initialize(engine: Engine, vertices: Float32Array, indices: Uint16Array) {
    engine = engine || Engine._getDefaultEngine();
    const vertexStride = 20;

    const declaration: VertexDeclaration = new VertexDeclaration([
      new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
      new VertexElement("TEXCOORD_0", 12, VertexElementFormat.Vector2, 0)
    ]);

    this._init(engine, vertices, indices, vertexStride, declaration);
  }
}
