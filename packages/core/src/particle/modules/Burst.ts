import { deepClone } from "../../clone/CloneManager";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";

/**
 * A burst is a particle emission event, where a number of particles are all emitted at the same time
 */
export class Burst {
  public time: number;
  @deepClone
  public count: ParticleCompositeCurve;
  public cycles: number;
  public repeatInterval: number;

  /**
   * Create burst object.
   * @param time - Time to emit the burst
   * @param count - Count of particles to emit
   * @param cycles - Number of times to repeat the burst
   * @param repeatInterval - Time interval between each repeated burst
   */
  constructor(time: number, count: ParticleCompositeCurve, cycles: number = 1, repeatInterval: number = 0.01) {
    this.time = time;
    this.count = count;
    this.cycles = cycles;
    this.repeatInterval = repeatInterval;
  }
}
