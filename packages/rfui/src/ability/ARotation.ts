"use strict";
import { Component } from "@alipay/o3-core";
import { MathUtil, quat } from "@alipay/o3-math";

export default class ARotation extends Component {
  public axis;
  public deg;
  public dDeg;

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
    const rotationQua = this.node.transform.rotationQuaternion;
    quat.setAxisAngle(rotationQua, this.axis, MathUtil.toRadian(this.deg));
    this.node.transform.rotationQuaternion = rotationQua;
  }
}
