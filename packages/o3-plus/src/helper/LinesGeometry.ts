import * as r3 from "@alipay/o3";

export class LinesGeometry extends r3.BufferGeometry {
  private points: Array<[number, number, number]> = [];

  constructor(props: { points: Array<[number, number, number]> }) {
    super();
    this.mode = r3.DrawMode.LINES;

    const { points } = props;
    this.points = points;

    const vertexCount = points.length;
    this.initialize(vertexCount);
  }

  initialize(vertexCount) {
    console.log(vertexCount);
    super.initialize(
      [{ semantic: "POSITION", size: 3, type: r3.DataType.FLOAT, normalized: false }],
      vertexCount,
      r3.BufferUsage.DYNAMIC_DRAW
    );

    this.points.forEach((value, index) => {
      this.setValue("POSITION", index, Float32Array.from(value));
    });
  }

  update(points: Array<[number, number, number]>) {
    this.points = points;
    this.initialize(points.length);
  }
}
