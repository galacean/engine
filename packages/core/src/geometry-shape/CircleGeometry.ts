import { DrawMode } from "../base/Constant";
import { GeometryShape } from "./GeometryShape";
import { Engine } from "../Engine";

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
  private vertices: Array<number>;
  private indices: Array<number>;
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

    this.mode = DrawMode.TRIANGLES;

    this.radius = options.radius || this.radius;
    this.segments = options.segments || this.segments;
    this.thetaStart = options.thetaStart || this.thetaStart;
    this.thetaLength = options.thetaLength || this.thetaLength;

    // init with center point
    this.vertices = [0, 0, 0, 0, 0, 1, 0.5, 0.5];

    for (let s = 0; s <= this.segments; s++) {
      let segment = this.thetaStart + (s / this.segments) * this.thetaLength;
      const x = this.radius * Math.cos(segment);
      const y = this.radius * Math.sin(segment);
      this.vertices.concat([x, y, 0, 0, 0, 1, (x / this.radius + 1) / 2, (y / this.radius + 1) / 2]);
    }

    for (let i = 1; i <= this.segments; i++) {
      this.indices.push(i, i + 1, 0);
    }

    this._initialize(engine, Float32Array.from(this.vertices), Uint16Array.from(this.indices));
  }
}
