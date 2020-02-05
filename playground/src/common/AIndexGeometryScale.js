'use strict';

import { NodeAbility } from '@alipay/o3-core';

export default class AIndexGeometryScale extends NodeAbility {
  constructor(node, props) {
    super(node);
    this.geometry = props.cubeGeometry;
    this.size = props.size;
    this.time = 0;
    this.radius = 0.3;
  }

  update(deltaTime) {
    this.time += deltaTime / 1000;
    this.setValues();
  }

  getSize() {
    return Math.sin(this.time * 3) * this.radius + this.size;
  }

  getPos() {
    const size = this.getSize();
    const pos = [
      [-this.size, -size, -this.size],
      [this.size, -size, -this.size],
      [-this.size, size, -this.size],
      [this.size, size, -this.size],
      [-this.size, -size, this.size],
      [this.size, -size, this.size],
      [-this.size, size, this.size],
      [this.size, size, this.size]
    ];
    return pos;
  }
  setValues() {
    const geometry = this.geometry;
    const pos = this.getPos();
    for(let i = 0;i < this.geometry.vertexCount; i++) {
      geometry.setValue('POSITION', i, pos[i]);
    }
  }
}
