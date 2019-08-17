'use strict';

import { NodeAbility } from '@alipay/o3-core';

export default class AIndexUpdate extends NodeAbility {
  constructor(node, props) {
    super(node);
    this.geometry = props.cubeGeometry;
    this.index = this.geometry.getAllIndex().slice(0);
   this._time = 0;
  }

  update(deltaTime) {
    this._time += deltaTime / 1000;
    this.setValues();
  }

  setValues() {
    const geometry = this.geometry;
    let index = Array(this.index.length);
    const count = Math.floor(this._time) % (this.index.length / 3) + 1;
    index = this.index.slice(0).fill(0, count * 3);
    this.geometry.setAllIndex(index);
  }
}
