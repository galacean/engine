import { IPoolElement } from "@galacean/engine";
import { ShaderPosition } from "./ShaderPosition";

export class ShaderRange implements IPoolElement {
  public start: ShaderPosition;
  public end: ShaderPosition;

  set(start: ShaderPosition, end: ShaderPosition) {
    this.start = start;
    this.end = end;
  }

  dispose(): void {
    this.start.dispose();
    this.end.dispose();
  }
}
