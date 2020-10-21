import { Engine } from "../Engine";
import { PrimitiveTopology } from "../graphic/enums/PrimitiveTopology";
import { VertexElementFormat } from "../graphic/enums/VertexElementFormat";
import { VertexElement } from "../graphic/VertexElement";
import { ShapeGeometry } from "./ShapeGeometry";

/**
 * 覆盖整个屏幕的一个矩形
 * @private
 */
export class ScreenQuadGeometry extends ShapeGeometry {
  constructor(engine: Engine) {
    super(engine);
    const vertices: Float32Array = new Float32Array([-1, -1, 0, 0, 0, 1, -1, 0, 1, 0, 1, 1, 0, 1, 1, -1, 1, 0, 0, 1]);

    const indices: Uint16Array = new Uint16Array([0, 1, 2, 3]);

    this._initialize(engine, vertices, indices);
    this.subGeometry.topology = PrimitiveTopology.TriangleFan;
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
