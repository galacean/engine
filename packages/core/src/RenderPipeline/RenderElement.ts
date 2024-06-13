import { IPoolElement } from "../utils/ObjectPool";
import { RenderData } from "./RenderData";

export class RenderElement implements IPoolElement {
  data: RenderData;

  set(data: RenderData): void {
    this.data = data;
  }

  dispose(): void {
    this.data = null;
  }
}
