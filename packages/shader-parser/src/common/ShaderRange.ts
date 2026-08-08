import { ShaderPosition } from "./ShaderPosition";

export class ShaderRange {
  public start: ShaderPosition;
  public end: ShaderPosition;

  set(start: ShaderPosition, end: ShaderPosition) {
    this.start = start;
    this.end = end;
  }
}
