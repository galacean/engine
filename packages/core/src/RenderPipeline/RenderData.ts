import { IPoolElement } from "../utils/ObjectPool";
import { SubRenderElement } from "./SubRenderElement";

export class RenderData implements IPoolElement {
  priority: number;
  distanceForSort: number;
  subRenderElements = Array<SubRenderElement>();

  set(priority: number, distanceForSort: number): void {
    this.priority = priority;
    this.distanceForSort = distanceForSort;
    this.subRenderElements.length = 0;
  }

  addSubRenderElement(element: SubRenderElement): void {
    this.subRenderElements.push(element);
  }

  dispose(): void {
    this.subRenderElements.length = 0;
    this.subRenderElements = null;
  }
}
