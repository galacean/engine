import { GeometryShape } from "./GeometryShape";
import { Engine } from "../Engine";
import { PrimitiveTopology } from "../graphic/enums/PrimitiveTopology";

interface CircleGeometryOptions {
  radius?: number;
  segments?: number;
  thetaStart?: number;
  thetaLength?: number;
}
export class CircleGeometry extends GeometryShape {
  /**
   * 顶点
   */
  private radius: number = 1;
  private segments: number = 16;
  private thetaStart: number = 0;
  private thetaLength: number = Math.PI * 2;

  /**
   * constructor
   * @param radius 半径
   */
  constructor(options: CircleGeometryOptions = {}, engine?: Engine) {
    super();

    this.radius = options.radius || this.radius;
    this.segments = options.segments || this.segments;
    this.thetaStart = options.thetaStart || this.thetaStart;
    this.thetaLength = options.thetaLength || this.thetaLength;
    const { segments, radius } = this;

    // init with center point
    const vertices: Float32Array = new Float32Array((segments + 2) * 8);
    // POSITION NORMAL TEXCOORD_0
    vertices.set([0, 0, 0, 0, 0, 1, 0.5, 0.5]);

    let index = 8;
    for (let s = 0; s <= segments; s++) {
      let segment = this.thetaStart + (s / segments) * this.thetaLength;
      const x = radius * Math.cos(segment);
      const y = radius * Math.sin(segment);

      // POSITION
      vertices[index++] = x;
      vertices[index++] = y;
      vertices[index++] = 0;
      // NORMAL
      vertices[index++] = 0;
      vertices[index++] = 0;
      vertices[index++] = 1;
      // TEXCOORD_0
      vertices[index++] = (x / radius + 1) * 0.5;
      vertices[index++] = (y / radius + 1) * 0.5;
    }

    const indices: Uint16Array = new Uint16Array(segments * 3);
    index = 0;
    for (let i = 1; i <= segments; i++) {
      indices[index++] = i;
      indices[index++] = i + 1;
      indices[index++] = 0;
    }

    this._initialize(engine, vertices, indices);
  }
}
