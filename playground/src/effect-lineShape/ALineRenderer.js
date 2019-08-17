'use strict';

import { DataType, BufferUsage, DrawMode } from '@alipay/o3-base';
import { AGeometryRenderer, BufferGeometry } from '@alipay/o3-geometry';
import { vec3 } from "@alipay/o3-math";

export class ALineRenderer extends AGeometryRenderer {
  constructor(node, props) {
    super(node);

    this._maxLineNumber = props.maxLineNumber || 4000;
    this.setMaterial(props.material);

    this._initGeometry();

    this._linePoints = [];
    this._dirty = false;
  }

  _initGeometry() {
    this.geometry = new BufferGeometry();
    this.geometry.initialize([
      { name: 'a_position', semantic: 'POSITION', size: 3, type: DataType.FLOAT, normalized: false}
    ], this._maxLineNumber * 2, BufferUsage.DYNAMIC_DRAW);
    this.geometry.mode = DrawMode.LINES;
  }

  update() {

    if (this._dirty) {

      let num = this._maxLineNumber * 2;
      for (let i = 0; i < num; i++) {
        let pos = i < this._linePoints.length ? this._linePoints[i] : vec3.fromValues(0, 0, 0);
        this.geometry.setValue('POSITION', i, pos);
      }
      this._linePoints = [];

    }

  }

  drawLine(start, end) {
    this._linePoints.push(start);
    this._linePoints.push(end);
    this._dirty = true;
  }

  drawLines(linePoints) {
    this._linePoints = this._linePoints.concat(linePoints);
    this._dirty = true;
  }
}
