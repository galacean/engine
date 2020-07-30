import { Vector3, MathUtil } from "./index";

// 防止万向锁
const ESP = MathUtil.ZeroTolerance;

// 球面坐标
export class Spherical {
  public radius;
  public phi;
  public theta;

  constructor(radius?, phi?, theta?) {
    this.radius = radius !== undefined ? radius : 1.0;
    this.phi = phi !== undefined ? phi : 0;
    this.theta = theta !== undefined ? theta : 0;
  }

  set(radius, phi, theta) {
    this.radius = radius;
    this.phi = phi;
    this.theta = theta;

    return this;
  }

  makeSafe() {
    this.phi = MathUtil.clamp(this.phi, ESP, Math.PI - ESP);
    return this;
  }

  setFromVec3(v3: Vector3) {
    this.radius = v3.length();
    if (this.radius === 0) {
      this.theta = 0;
      this.phi = 0;
    } else {
      this.theta = Math.atan2(v3.x, v3.z);
      this.phi = Math.acos(MathUtil.clamp(v3.y / this.radius, -1, 1));
    }

    return this;
  }

  setToVec3(v3: Vector3) {
    const sinPhiRadius = Math.sin(this.phi) * this.radius;

    v3.x = sinPhiRadius * Math.sin(this.theta);
    v3.y = Math.cos(this.phi) * this.radius;
    v3.z = sinPhiRadius * Math.cos(this.theta);

    return this;
  }
}
