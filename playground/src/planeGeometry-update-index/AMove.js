import { NodeAbility } from '@alipay/o3-core';

export default class AMove extends NodeAbility {
  constructor(node, props) {
    super(node);
    this._time = 0;
    this.range = 0.005;
    this.velocity = 10;
  }

  update(deltaTime) {
    this._time += deltaTime / 1000;
    this._deltaTime = deltaTime / 1000;
    this.setValues();
  }

  setValues() {
    let positionY = this.node.position[1];
    let positionZ = this.node.position[2];
    positionZ += this._deltaTime * this.velocity;
    if(positionZ > 100) {
      positionZ = -10;
    }
    const deltaP = this._time * 2 * Math.random();
    positionY += (Math.sin(deltaP) * this.range);
    this.node.position = [this.node.position[0], positionY,positionZ];
  }
}
