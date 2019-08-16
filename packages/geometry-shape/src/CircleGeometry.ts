import { IndexBufferGeometry } from "@alipay/r3-geometry";
import { BufferUsage, DataType, DrawMode } from "@alipay/r3-base";

interface CircleGeometryOptions {
  radius?: number;
  segments?: number;
  thetaStart?: number;
  thetaLength?: number;
}
export class CircleGeometry extends IndexBufferGeometry {
  /**
   * 顶点
   */
  private vertices: Array<number[]>;
  private normals: Array<number[]>;
  private uvs: Array<number[]>;
  private indices: Array<number>;
  private radius: number = 1;
  private segments: number = 16;
  private thetaStart: number = 0;
  private thetaLength: number = Math.PI * 2;

  /**
   * constructor
   * @param radius 半径
   */
  constructor(options: CircleGeometryOptions = {}) {
    super("name");

    this.mode = DrawMode.TRIANGLES;

    this.update(options);
  }

  update(options: CircleGeometryOptions = {}) {
    this.vertices = [];
    this.normals = [];
    this.uvs = [];
    this.indices = [];
    this.radius = options.radius || this.radius;
    this.segments = options.segments || this.segments;
    this.thetaStart = options.thetaStart || this.thetaStart;
    this.thetaLength = options.thetaLength || this.thetaLength;

    // center point
    this.vertices.push([0, 0, 0]);
    this.normals.push([0, 0, 1]);
    this.uvs.push([0.5, 0.5]);

    for (let s = 0; s <= this.segments; s++) {
      let segment = this.thetaStart + (s / this.segments) * this.thetaLength;
      const x = this.radius * Math.cos(segment);
      const y = this.radius * Math.sin(segment);

      this.vertices.push([x, y, 0]);

      this.normals.push([0, 0, 1]);

      this.uvs.push([(x / this.radius + 1) / 2, (y / this.radius + 1) / 2]);
    }

    for (let i = 1; i <= this.segments; i++) {
      this.indices.push(i, i + 1, 0);
    }

    this.initialize(this.indices.length);
  }

  initialize(vertexCount: number) {
    super.initialize(
      [
        {
          name: "a_position",
          semantic: "POSITION",
          size: 3,
          type: DataType.FLOAT,
          normalized: false
        },
        {
          semantic: "NORMAL",
          size: 3,
          type: DataType.FLOAT,
          normalized: true
        },
        {
          semantic: "TEXCOORD_0",
          size: 2,
          type: DataType.FLOAT,
          normalized: true
        }
      ],
      vertexCount,
      this.indices,
      BufferUsage.STATIC_DRAW
    );
    this.vertices.forEach((value, index) => {
      this.setValue("POSITION", index, Float32Array.from(value));
    });

    this.uvs.forEach((value, index) => {
      this.setValue("TEXCOORD_0", index, Float32Array.from(value));
    });

    this.normals.forEach((value, index) => {
      this.setValue("NORMAL", index, Float32Array.from(value));
    });
  }
}
