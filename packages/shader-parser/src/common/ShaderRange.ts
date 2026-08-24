import { ShaderPosition } from "./ShaderPosition";

/**
 * Mutable half-open source range used by the parser.
 * @internal
 */
export class ShaderRange {
  /** Inclusive range start. */
  public start: ShaderPosition;
  /** Exclusive range end. */
  public end: ShaderPosition;

  /**
   * Replaces the range boundaries.
   * @param start - Inclusive range start.
   * @param end - Exclusive range end.
   * @internal
   */
  set(start: ShaderPosition, end: ShaderPosition): void {
    this.start = start;
    this.end = end;
  }
}
