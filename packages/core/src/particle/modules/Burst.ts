import { deepClone } from "../../clone/CloneManager";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";

/**
 * A burst is a particle emission event, where a number of particles are all emitted at the same time
 */
export class Burst {
  public time: number;
  @deepClone
  public count: ParticleCompositeCurve;

  /**
   * Create burst object.
   * @param time - Time to emit the burst
   * @param count - Count of particles to emit
   */
  constructor(time: number, count: ParticleCompositeCurve) {
    this.time = time;
    this.count = count;
  }
}
