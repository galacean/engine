/**
 * Random number generator based on the xorshift128+ algorithm.
 * https://vigna.di.unimi.it/ftp/papers/xorshiftplus.pdf
 */
export class Rand {
  private _state0: number;
  private _state1: number;

  /**
   * Create a random number generator.
   * @param seed0 - Seed 0 used to initialize the generator
   * @param seed1 - Seed 1 used to initialize the generator
   */
  constructor(seed0: number, seed1: number) {
    this.reset(seed0, seed1);
  }

  /**
   * Generate a random number.
   * @returns - A random number
   */
  random(): number {
    return this._advanceState() / 0xffffffff; // 2^32 - 1
  }

  /**
   * Reset the generator by new seeds.
   * @param seed0 - Random seed0
   * @param seed1 - Random seed1
   */
  reset(seed0: number, seed1: number): void {
    this._state0 = seed0 >>> 0;
    this._state1 = seed1 >>> 0;
  }

  private _advanceState(): number {
    let x = this._state0;
    const y = this._state1;
    this._state0 = y;
    x ^= x << 23;
    x ^= x >>> 17;
    x ^= y ^ (y >>> 26);
    this._state1 = x;
    return (this._state0 + this._state1) >>> 0;
  }
}
