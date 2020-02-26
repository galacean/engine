import { NodeAbility } from "@alipay/o3-core";
import { vec3 } from "@alipay/o3-math";

export class MoveAbility extends NodeAbility {
  constructor(node, props) {
    super(node);
    this.time = 0;
    this.radius = props.radius || 5;
    this.onX =
      props.onX ||
      (time => {
        return Math.cos(time) * this.radius;
      });
    this.onY =
      props.onY ||
      (time => {
        return Math.cos(time) * this.radius;
      });
    this.onZ =
      props.onZ ||
      (time => {
        return Math.sin(time) * this.radius;
      });
  }

  update(deltaTime) {
    this.time += deltaTime / 1000;
    let x = this.onX(this.time);
    let y = this.onY(this.time);
    let z = this.onZ(this.time);
    this.node.position = vec3.fromValues(x, y, z);
  }
}
