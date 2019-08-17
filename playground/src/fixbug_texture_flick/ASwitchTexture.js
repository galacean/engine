'use strict';

import { NodeAbility } from '@alipay/o3-core';

export default class ASwitchTexture extends NodeAbility {
  constructor(node, {textures, mtl, uniformName, time}) {
    super(node);

    this.mtl = mtl;
    this.textures = textures;
    this.uniformName = uniformName;
    this.length = textures.length;
    this.time = time;
    this.timeCounter = 0;
    this.pointer = 0;
  }


  update(deltaTime) {
    this.timeCounter += deltaTime;
    if(this.timeCounter > this.time) {
      this.pointer = this.pointer % this.length;
      this.mtl.setValue(this.uniformName, this.textures[this.pointer]);
      this.timeCounter = this.timeCounter % this.time;
      this.pointer ++;
    }
  }
}
