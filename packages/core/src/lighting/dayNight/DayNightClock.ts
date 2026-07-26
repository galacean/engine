/**
 * Simulation clock used by {@link DayNightSystem}.
 *
 * @remarks
 * `timeScale` is expressed as simulated seconds per real second. For example,
 * `timeScale = 60` advances the clock by one simulated minute every real second.
 */
export class DayNightClock {
  /** Simulated seconds advanced per real second. */
  timeScale = 60;
  /** Whether automatic time advancement is paused. */
  paused = false;

  private _timeHours: number;

  /** Current local time in hours, wrapped to [0, 24). */
  get timeHours(): number {
    return this._timeHours;
  }

  set timeHours(value: number) {
    if (!Number.isFinite(value)) {
      throw new Error("DayNightClock timeHours must be finite.");
    }
    this._timeHours = wrapHours(value);
  }

  /** Current local time normalized to [0, 1). */
  get normalizedTime(): number {
    return this._timeHours / 24;
  }

  /**
   * Create a day/night clock.
   * @param timeHours - Initial local time in hours
   */
  constructor(timeHours = 12) {
    this.timeHours = timeHours;
  }

  /**
   * Advance the simulation clock.
   * @param deltaTime - Real elapsed time in seconds
   * @returns Whether the clock advanced
   */
  update(deltaTime: number): boolean {
    if (this.paused || deltaTime <= 0 || this.timeScale === 0) {
      return false;
    }
    if (!Number.isFinite(deltaTime) || !Number.isFinite(this.timeScale)) {
      throw new Error("DayNightClock deltaTime and timeScale must be finite.");
    }
    this.timeHours += (deltaTime * this.timeScale) / 3600;
    return true;
  }
}

function wrapHours(value: number): number {
  return ((value % 24) + 24) % 24;
}
