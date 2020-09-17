import { Engine } from "../Engine";
import { VertexElementFormat } from "../graphic/enums/VertexElementFormat";
import { VertexElement } from "../graphic/VertexElement";
import { GeometryShape } from "./GeometryShape";
import { PrimitiveTopology } from "../graphic/enums/PrimitiveTopology";

/**
 * 覆盖整个屏幕的一个矩形
 * @private
 */
export class ScreenQuadGeometry extends GeometryShape {
  constructor(engine?: Engine) {
    super();
    this.primitiveTopology = PrimitiveTopology.TriangleFan;

    const vertices: Float32Array = new Float32Array([-1, -1, 0, 0, 0, 1, -1, 0, 1, 0, 1, 1, 0, 1, 1, -1, 1, 0, 0, 1]);

    const indices: Uint16Array = new Uint16Array([0, 1, 2, 3]);

    this._initialize(engine, vertices, indices);
    this._primitive.drawCount = indices.length; //TODO:临时添加,待底层结构调整删除
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
