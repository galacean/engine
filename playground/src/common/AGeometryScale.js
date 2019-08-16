'use strict';

import { NodeAbility } from '@alipay/r3-core';

export default class AGeometryScale extends NodeAbility {
  constructor(node, props) {
    super(node);
    this.geometry = props.cubeGeometry;
    this.size = props.size || 1;
    this.range = props.range || 0.3;
    this.indexValues = [
      0,2,1,3,1,2,0,4,2,6,2,4,5,1,7,3,7,1,6,7,2,3,2,7,0,1,4,5,4,1,4,5,6,7,6,5
    ];
    this._time = 0;
  }

  update(deltaTime) {
    this._time += deltaTime / 1000;
    this.setValues();
  }

  getSize() {
    return Math.sin(this._time * 3) * this.range + this.size;
  }

  getPos() {
    const size = this.getSize();
    const pos = [
      [-size, -this.size, -this.size],
      [size, -this.size, -this.size],
      [-size, this.size, -this.size],
      [size, this.size, -this.size],
      [-size, -this.size, this.size],
      [size, -this.size, this.size],
      [-size, this.size, this.size],
      [size, this.size, this.size]
    ];
    return pos;
  }
  setValues() {
    const geometry = this.geometry;
    const pos = this.getPos();
    this.indexValues.forEach((vertexIndex, i) => {
      geometry.setValue('POSITION', i, pos[vertexIndex]);
    });
  }
}
