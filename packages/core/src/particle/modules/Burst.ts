import { DataObject } from "../../base/DataObject";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";

/**
 * A burst is a particle emission event, where a number of particles are all emitted at the same time
 */
export class Burst extends DataObject {
  public time: number;
  public count: ParticleCompositeCurve;

  private _cycles: number;
  private _repeatInterval: number;

  /**
   * Number of times to repeat the burst.
   */
  get cycles(): number {
    return this._cycles;
  }

  set cycles(value: number) {
    this._cycles = Math.max(value, 1);
  }

  /**
   * Time interval between each repeated burst.
   */
  get repeatInterval(): number {
    return this._repeatInterval;
  }

  set repeatInterval(value: number) {
    this._repeatInterval = Math.max(value, 0.01);
  }

  /**
   * Create a single-shot burst.
   * @param time - Time to emit the burst
   * @param count - Count of particles to emit
   */
  constructor(time: number, count: ParticleCompositeCurve);
  /**
   * Create a repeated burst.
   * @param time - Time to emit the burst
   * @param count - Count of particles to emit
   * @param cycles - Number of times to repeat the burst
   * @param repeatInterval - Time interval between each repeated burst
   */
  constructor(time: number, count: ParticleCompositeCurve, cycles: number, repeatInterval: number);
  constructor(time: number, count: ParticleCompositeCurve, cycles?: number, repeatInterval?: number) {
    super();
    this.time = time;
    this.count = count;
    this._cycles = Math.max(cycles ?? 1, 1);
    this._repeatInterval = Math.max(repeatInterval ?? 0.01, 0.01);
  }
}
