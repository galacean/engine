import { Material } from "@alipay/o3-material";
import { ACamera } from "@alipay/o3-core";
import { RenderTargetConfig } from "@alipay/o3-material/types/type";

export interface ProbeConfig {
  /** 需要渲染的相机,默认为 activeCameras[0] */
  camera?: ACamera;
  /** 需要渲染的列表 */
  renderList?: Material[];
  /** renderAll 可以渲染场景中所有符合条件的物体，不需要填写 renderList，但可能增加性能消耗 */
  renderAll?: boolean;
}

export interface PerturbationProbeConfig extends ProbeConfig, RenderTargetConfig {}

export interface ReflectionProbeConfig extends ProbeConfig, RenderTargetConfig {
  /** 可以设置探针的位置，默认为原点 [0,0,0] */
  position?;
}
