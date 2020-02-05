import { MaskList, RefreshRate } from "@alipay/o3-base";
import { PBRMaterial } from "@alipay/o3-pbr";

interface ProbeConfig {
  renderList?: Array<PBRMaterial>;
  renderMask?: MaskList;
  refreshRate?: RefreshRate;
}

let cacheId = 0;

/**
 * 环境探针类，提供诸如反射折射等需要的功能
 * 目前只支持PBR材质
 * */
export class Probe {
  name: string;
  renderList: Array<PBRMaterial>;
  renderMask: MaskList;
  refreshRate: RefreshRate;

  /**
   *探针基类
   * @param {string} name
   * @param {ProbeConfig} config
   * */
  constructor(name: string, config: ProbeConfig) {
    cacheId++;
    this.name = name || `probe_${cacheId}`;
    this.renderList = config.renderList || [];
    this.renderMask = config.renderMask || MaskList.EVERYTHING;
    this.refreshRate = config.refreshRate || RefreshRate.EVERYFRAME;
  }
}
