import {vec3, MathUtil} from './index';

// 防止万向锁
const ESP = MathUtil.EPSILON;

// 球面坐标
export class Spherical {

    public radius;
    public phi;
    public theta;

    constructor(radius?, phi?, theta?) {

        this.radius = (radius !== undefined) ? radius : 1.0;
        this.phi = (phi !== undefined) ? phi : 0;
        this.theta = (theta !== undefined) ? theta : 0;

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

    setFromVec3(v3) {

        this.radius = vec3.len(v3);
        if (this.radius === 0) {

            this.theta = 0;
            this.phi = 0;

        } else {

            this.theta = Math.atan2(v3[0], v3[2]);
            this.phi = Math.acos(MathUtil.clamp(v3[1] / this.radius, -1, 1));

        }

        return this;

    }

    setToVec3(v3) {

        const sinPhiRadius = Math.sin(this.phi) * this.radius;

        v3[0] = sinPhiRadius * Math.sin(this.theta);
        v3[1] = Math.cos(this.phi) * this.radius;
        v3[2] = sinPhiRadius * Math.cos(this.theta);

        return this;

    }

}