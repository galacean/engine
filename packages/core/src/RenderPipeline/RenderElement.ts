import { IPoolElement } from "../utils/ObjectPool";
import { RenderQueueFlags } from "./BasicRenderPipeline";
import { SubRenderElement } from "./SubRenderElement";

export class RenderElement implements IPoolElement {
  priority: number;
  distanceForSort: number;
  subRenderElements = Array<SubRenderElement>();
  renderQueueFlags: RenderQueueFlags;

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
  }
}
