import { IPoolElement } from "../utils/ObjectPool";
import { RenderData } from "./RenderData";
import { SubRenderElement } from "./SubRenderElement";

export class RenderElement implements IPoolElement {
  data: RenderData;
  subRenderElements = Array<SubRenderElement>();

  set(data: RenderData): void {
    this.data = data;
    this.subRenderElements.length = 0;
  }

  addSubRenderElement(element: SubRenderElement): void {
    this.subRenderElements.push(element);
  }

  dispose(): void {
    this.data = null;
    this.subRenderElements.length = 0;
    this.subRenderElements = null;
  }
}
