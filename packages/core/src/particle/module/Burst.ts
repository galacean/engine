import { IClone } from "@oasis-engine/design";

/**
 * A burst is a particle emission event, where a number of particles are all emitted at the same time
 */
export class Burst implements IClone {
  private _time: number;
  private _minCount: number;
  private _maxCount: number;

  /**
   * The time that each burst occurs.
   */
  get time(): number {
    return this._time;
  }

  /**
   * The minimum number of particles to emit.
   */
  get minCount(): number {
    return this._minCount;
  }

  /**
   * The maximum number of particles to emit.
   */
  get maxCount(): number {
    return this._maxCount;
  }

  /**
   * Create burst object.
   * @param time - Time to emit the burst.
   * @param minCount - Minimum number of particles to emit.
   * @param maxCount - Maximum number of particles to emit.
   */
  constructor(time: number, minCount: number, maxCount: number) {
    this._time = time;
    this._minCount = minCount;
    this._maxCount = maxCount;
  }

  /**
   * clone to
   * @param  destBurst - The dest
   */
  cloneTo(destBurst: Burst): void {
    destBurst._time = this._time;
    destBurst._minCount = this._minCount;
    destBurst._maxCount = this._maxCount;
  }

  /**
   * clone
   * @return The copy
   */
  clone(): Burst {
    const destBurst: Burst = new Burst(this._time, this._minCount, this._maxCount);
    this.cloneTo(destBurst);
    return destBurst;
  }
}
