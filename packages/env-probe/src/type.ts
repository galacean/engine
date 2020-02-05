import { Material } from "@alipay/o3-material";
import { ACamera } from "@alipay/o3-core";
import { RenderTargetConfig } from "@alipay/o3-material/types/type";
import { Vec4 } from "@alipay/o3-math/types/type";

export interface ProbeConfig extends RenderTargetConfig {
  /** 需要渲染的相机,默认为 activeCameras[0] */
  camera?: ACamera;
  /** 需要渲染的列表,优先级 excludeRenderList > renderAll > renderList */
  renderList?: Material[];
  /** renderAll 可以渲染场景中所有符合条件的物体，不需要填写 renderList，但可能增加性能消耗 */
  renderAll?: boolean;
  /** 排除渲染某些物体，适用于 renderAll:true 的情况下想排除某些物体 */
  excludeRenderList?: Material[];
  /** 裁剪面*/
  clipPlanes?: Vec4[];
}

export interface PerturbationProbeConfig extends ProbeConfig {}

export interface ReflectionProbeConfig extends ProbeConfig {
  /** 分辨率，一般默认的 1024 够用了 */
  size?: number;
  /** 可以设置探针的位置，默认为原点 [0,0,0] */
  position?;
}
