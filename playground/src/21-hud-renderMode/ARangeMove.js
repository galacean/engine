import { vec3 } from '@alipay/r3-math'
import { NodeAbility } from "@alipay/r3-core";
import { Logger } from "@alipay/r3-base";
/**
 * 指定范围内的往返运动
 */
export class ARangeMove extends NodeAbility {

  constructor(node) {
    super(node);

    this._minRange = vec3.create();
    this._maxRange = vec3.create();
    this._moveDelta = vec3.create();
  }

  setRangeMove(minRange, maxRange, moveDelta) {
    if (minRange[0] > maxRange[0] || minRange[1] > maxRange[1] || minRange[2] > maxRange[2]) {
      Logger.error('Wrong move range!');
      return;
    }

    if ((minRange[0] === maxRange[0] && Math.abs(moveDelta[0]) > 0)
      || (minRange[1] === maxRange[1] && Math.abs(moveDelta[1]) > 0)
      || (minRange[2] === maxRange[2] && Math.abs(moveDelta[2]) > 0)) {
      Logger.error('Can not move in range!');
      return;
    }
    this._minRange = minRange;
    this._maxRange = maxRange;
    this._moveDelta = moveDelta;
  }

  update(deltaTime) {
    let newPos = vec3.create();
    vec3.add(newPos, this.node.position, this._moveDelta);

    if (this._moveDelta[0] !== 0 && (newPos[0] <= this._minRange[0] || newPos[0] >= this._maxRange[0])) {
      newPos[0] = Math.min(this._maxRange[0], Math.max(this._minRange[0], newPos[0]));
      this._moveDelta[0] = -this._moveDelta[0];
    }

    if (this._moveDelta[1] !== 0 && (newPos[1] <= this._minRange[1] || newPos[1] >= this._maxRange[1])) {
      newPos[1] = Math.min(this._maxRange[1], Math.max(this._minRange[1], newPos[1]));
      this._moveDelta[1] = -this._moveDelta[1];
    }

    if (this._moveDelta[2] !== 0 && (newPos[2] <= this._minRange[2] || newPos[2] >= this._maxRange[2])) {
      newPos[2] = Math.min(this._maxRange[2], Math.max(this._minRange[2], newPos[2]));
      this._moveDelta[2] = -this._moveDelta[2];
    }

    this.node.position = newPos;
  }
}

