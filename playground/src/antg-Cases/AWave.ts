"use strict";

import { NodeAbility } from "@alipay/o3-core";
import { AGeometryRenderer } from "@alipay/o3-geometry";

export default class AGeometryScale extends NodeAbility {
  public mtl: any;
  public _time: any;

  constructor(node) {
    super(node);
    this.mtl = node.findAbilityByType(AGeometryRenderer).getMaterial();
    this._time = 0;
  }

  update(deltaTime) {
    this._time += deltaTime / 1000;
    this.mtl.setValue("u_time", this._time * 30);
  }
}
