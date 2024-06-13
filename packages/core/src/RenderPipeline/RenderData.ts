import { IPoolElement } from "../utils/ObjectPool";
import { SubRenderElement } from "./SubRenderElement";
import { ForceUploadShaderDataFlag } from "./enums/ForceUploadShaderDataFlag";
import { RenderDataUsage } from "./enums/RenderDataUsage";

export class RenderData implements IPoolElement {
  priority: number;
  distanceForSort: number;
  usage: RenderDataUsage;
  uploadFlag: ForceUploadShaderDataFlag;
  // subRenderDataArray = Array<SubRenderData>();
  subRenderElements = Array<SubRenderElement>();

  set(
    priority: number,
    distanceForSort: number,
    usage: RenderDataUsage = RenderDataUsage.Mesh,
    uploadFlag: ForceUploadShaderDataFlag = ForceUploadShaderDataFlag.None
  ): void {
    this.priority = priority;
    this.distanceForSort = distanceForSort;
    this.usage = usage;
    this.uploadFlag = uploadFlag;
    this.subRenderElements.length = 0;
  }

  addSubRenderElement(element: SubRenderElement): void {
    this.subRenderElements.push(element);
  }

  dispose(): void {
    this.usage = null;
    this.uploadFlag = null;
    this.subRenderElements.length = 0;
    this.subRenderElements = null;
  }
}
