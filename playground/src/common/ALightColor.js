'use strict';

import { NodeAbility } from '@alipay/o3-core';
import { vec3 } from '@alipay/o3-math';

export default class ALightColor extends NodeAbility {
  constructor(node, LightType) {
    super(node);
    this.time = 0;
    this.ALight = this.node.findAbilityByType(LightType);
  }

  update(deltaTime) {
    this.time += deltaTime / 500;
    if(this.time > Math.PI * 6) {
      this.time = this.time - Math.PI * 6;
    }
    this.ALight.color = this.getColor();
    this.ALight.intensity = this.getIntensity();
  }

  getColor() {
    let color;
    if(this.time % (Math.PI * 6) < Math.PI * 2) {
      color = vec3.fromValues(1, 0.4, 0.2);
    } else if(this.time % (Math.PI * 6) < Math.PI * 4) {
      color = vec3.fromValues(0.2, 1, 0.4);
    } else {
      color = vec3.fromValues(0.4, 0.2, 1);
    }
    return color;
  }

  getIntensity() {
    return (-Math.cos(this.time) + 1) / 5;
  }
}
