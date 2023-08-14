/**
 * Random number generator based on the Xorshift+ algorithm.
 */
export class Rand {
  private static _uint32MaxValue = Math.pow(2, 32) - 1;

  private static _toUint32(x: number): number {
    return x >>> 0;
  }

  private _seed: number;
  private _state0: number;
  private _state1: number;

  /**
   * Seed used to initialize the generator.
   */
  get seed(): number {
    return this._seed;
  }

  /**
   * Create a random number generator.
   * @param seed - Seed used to initialize the generator
   */
  constructor(seed: number) {
    this.reset(seed);
  }

  /**
   * Generate a random number.
   * @returns - A random number
   */
  random(): number {
    this._advanceState();
    return Rand._toUint32(this._state0 + this._state1) / Rand._uint32MaxValue;
  }

  /**
   * Reset the generator by a new seed.
   * @param seed - Random seed
   */
  reset(seed: number): void {
    this._seed = seed;

    this._state0 = seed;
    this._state1 = 0;
    for (let i = 0; i < 5; i++) {
      this._advanceState();
    }
  }

  private _advanceState(): void {
    let x = this._state0;
    const y = this._state1;
    this._state0 = y;
    x ^= x << 23;
    x ^= x >>> 17;
    x ^= y ^ (y >>> 26);
    this._state1 = x;
  }
}
