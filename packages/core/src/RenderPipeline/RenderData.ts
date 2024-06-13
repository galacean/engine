import { IPoolElement } from "../utils/ObjectPool";
import { SubRenderData } from "./SubRenderData";
import { ForceUploadShaderDataFlag } from "./enums/ForceUploadShaderDataFlag";
import { RenderDataUsage } from "./enums/RenderDataUsage";

export class RenderData implements IPoolElement {
  priority: number;
  distanceForSort: number;
  usage: RenderDataUsage;
  uploadFlag: ForceUploadShaderDataFlag;
  subRenderDataArray = Array<SubRenderData>();

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
    this.subRenderDataArray.length = 0;
  }

  addSubRenderData(data: SubRenderData): void {
    this.subRenderDataArray.push(data);
  }

  dispose(): void {
    this.usage = null;
    this.uploadFlag = null;
    this.subRenderDataArray.length = 0;
    this.subRenderDataArray = null;
  }
}
