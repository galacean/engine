'use strict';

import { NodeAbility } from '@alipay/o3-core';
import { vec3 } from '@alipay/o3-math';

export default class AMove extends NodeAbility {
  constructor(node, props) {
    super(node);
    this.time = 0;
    this.y = props.y || 0;
    this.range = props.range || 10.0;
  }

  update(deltaTime) {
    this.time += deltaTime / 1000;
    let x = Math.cos(this.time) * this.range;
    let y = Math.sin(this.time) * this.range * 0.2 + this.y;
    let z = Math.cos(this.time) * this.range;
    this.node.position = vec3.fromValues(x, y, z);
  }
}
