import { IPoolElement } from "../utils/ObjectPool";
import { SubRenderElement } from "./SubRenderElement";
import { RenderDataUsage } from "./enums/RenderDataUsage";

export class RenderData implements IPoolElement {
  priority: number;
  distanceForSort: number;
  usage: RenderDataUsage;
  subRenderElements = Array<SubRenderElement>();

  set(priority: number, distanceForSort: number, usage: RenderDataUsage = RenderDataUsage.Mesh): void {
    this.priority = priority;
    this.distanceForSort = distanceForSort;
    this.usage = usage;
    this.subRenderElements.length = 0;
  }

  addSubRenderElement(element: SubRenderElement): void {
    this.subRenderElements.push(element);
  }

  dispose(): void {
    this.usage = null;
    this.subRenderElements.length = 0;
    this.subRenderElements = null;
  }
}
