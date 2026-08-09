import { ShaderPosition } from "./ShaderPosition";

/** Mutable half-open source range used by the parser. @internal */
export class ShaderRange {
  public start: ShaderPosition;
  public end: ShaderPosition;

  /** Replaces the range boundaries. @internal */
  set(start: ShaderPosition, end: ShaderPosition): void {
    this.start = start;
    this.end = end;
  }
}
