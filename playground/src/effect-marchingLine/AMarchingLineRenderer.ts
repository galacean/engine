"use strict";

import { DataType, BufferUsage, DrawMode } from "@alipay/o3-base";
import { AGeometryRenderer, BufferGeometry } from "@alipay/o3-geometry";

export class AMarchingLineRenderer extends AGeometryRenderer {
  public _lines: any;
  public _maxPointNumber: any;
  public _maxLineNum: any;

  constructor(node, props) {
    super(node);

    this._lines = [];

    this._maxPointNumber = props.maxPointNumber || 10000;
    this._maxLineNum = props.maxLineNum || 20;
    this.setMaterial(props.material);

    this._initGeometry();
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
    let allPoints = [];

    this._lines.forEach(l => {
      allPoints = allPoints.concat(l.points);
    });

    let count = allPoints.length;
    if (allPoints.length + this._lines.length > this._maxPointNumber) {
      return;
    }

    this._lines.forEach(line => {
      let point = line.march(allPoints);
      if (point) {
        this.geometry.setValue("POSITION", count++, point);
      }
    });
  }

  addLine(line) {
    if (this._lines.length < this._maxLineNum) {
      this._lines.push(line);
    }
  }
}
