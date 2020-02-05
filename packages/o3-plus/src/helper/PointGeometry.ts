import * as r3 from "@alipay/o3";

export class PointGeometry extends r3.BufferGeometry {
  constructor(private position: Array<number>) {
    super();

    this.mode = r3.DrawMode.POINTS;
    this.initialize();
  }

  initialize() {
    super.initialize(
      [{ name: "a_position", semantic: "POSITION", size: 3, type: r3.DataType.FLOAT, normalized: false }],
      1,
      r3.BufferUsage.DYNAMIC_DRAW
    );

    this.setValue("POSITION", 0, this.position);
  }

  update(position: Array<number>) {
    this.position = position;
    this.initialize();
  }
}
