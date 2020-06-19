"use strict";

import { DataType, BufferUsage, DrawMode } from "@alipay/o3-base";
import { AGeometryRenderer, BufferGeometry } from "@alipay/o3-geometry";
import { vec3 } from "@alipay/o3-math";

export class APointRenderer extends AGeometryRenderer {
  public _maxPointNumber: any;
  public _index: any;

  constructor(node, props) {
    super(node);

    this._maxPointNumber = props.maxPointNumber || 1000;

    this.setMaterial(props.material);

    this._initGeometry();

    this._index = 0;
  }

  _initGeometry() {
    this.geometry = new BufferGeometry();
    this.geometry.initialize(
      [{ name: "a_position", semantic: "POSITION", size: 3, type: DataType.FLOAT, normalized: false }],
      this._maxPointNumber,
      BufferUsage.DYNAMIC_DRAW
    );
    this.geometry.mode = DrawMode.POINTS;
  }

  update(deltaTime) {
    // 每帧index清空一下
    this._index = 0;
  }

  clear() {
    let pos = vec3.create();
    for (let i = 0; i < this._maxPointNumber; i++) {
      this.geometry.setValue("POSITION", this._index++, pos);
    }
  }

  drawPoint(point) {
    this.geometry.setValue("POSITION", this._index++, point);
  }
}
