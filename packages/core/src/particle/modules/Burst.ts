import { IClone } from "@galacean/engine-design";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";

/**
 * A burst is a particle emission event, where a number of particles are all emitted at the same time
 */
export class Burst implements IClone {
  /**
   * Create burst object.
   * @param time - Time to emit the burst
   * @param count - Count of particles to emit
   */
  constructor(
    public time: number,
    public count: ParticleCompositeCurve
  ) {}

  /**
   * clone to
   * @param  destBurst - The dest
   */
  cloneTo(destBurst: Burst): void {
    destBurst.time = this.time;
    destBurst.count = this.count;
  }

  /**
   * clone
   * @return The copy
   */
  clone(): Burst {
    const destBurst = new Burst(this.time, this.count);
    this.cloneTo(destBurst);
    return destBurst;
  }
}
