'use strict';

import { NodeAbility } from '@alipay/o3-core';

export default class ARotation extends NodeAbility {
  constructor(node) {
    super(node);

    this.axis = new Float32Array([0, 1, 0]);
    this.deg = 0;
    this.dDeg = 16;
  }

  setAxis(x, y, z) {
    this.axis[0] = x;
    this.axis[1] = y;
    this.axis[2] = z;
  }

  setDdeg(dDeg) {
    this.dDeg = dDeg;
  }

  update(deltaTime) {
    this.deg += this.dDeg * (deltaTime / 1000);
    this._ownerNode.setRotationAxisAngle(this.axis, this.deg);
  }
}
