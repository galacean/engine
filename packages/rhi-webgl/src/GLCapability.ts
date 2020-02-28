import { GLRenderHardware } from "./GLRenderHardware";
import { GLCapabilityType } from "@alipay/o3-base";

type extensionKey = string;

/**
 * GL 能力统一管理
 * */
export class GLCapability {
  _rhi: GLRenderHardware;
  capabilityList: Map<GLCapabilityType, boolean>;

  get rhi() {
    return this._rhi;
  }

  constructor(rhi: GLRenderHardware) {
    this._rhi = rhi;
    this.capabilityList = new Map();

    this.init();
    // 抹平接口差异
    this.compatibleAll();
  }

  /**
   * 查询能否使用某些 GL 能力
   * */
  public canIUse(capabilityType: GLCapabilityType): boolean {
    return this.capabilityList.get(capabilityType);
  }

  private init() {
    const cap = this.capabilityList;
    const rhi = this.rhi;
    const { standardDerivatives, shaderTextureLod, elementIndexUint, depthTexture } = GLCapabilityType;

    cap.set(standardDerivatives, rhi.isWebGL2 || !!rhi.requireExtension(standardDerivatives));
    cap.set(shaderTextureLod, rhi.isWebGL2 || !!rhi.requireExtension(shaderTextureLod));
    cap.set(elementIndexUint, rhi.isWebGL2 || !!rhi.requireExtension(elementIndexUint));
    cap.set(depthTexture, rhi.isWebGL2 || !!rhi.requireExtension(depthTexture));
  }

  /**
   * 如果不是 WebGL2 环境,但是有插件能补充该能力，则抹平该差异
   * @example
   * compatible(GLCapabilityType.depthTexture,{
   *    UNSIGNED_INT_24_8: "UNSIGNED_INT_24_8_WEBGL"
   * })
   * 满足条件时， gl.UNSIGNED_INT_24_8 = ext.UNSIGNED_INT_24_8_WEBGL
   * */
  private compatible(capabilityType: GLCapabilityType, flatItem: { [glKey: string]: extensionKey }) {
    const rhi = this.rhi;
    const gl = rhi.gl;
    let ext = null;

    /** 如果不是 WebGL2 环境,但是有插件能补充该能力，则抹平该差异 */
    if (!rhi.isWebGL2 && (ext = rhi.requireExtension(capabilityType))) {
      for (let glKey in flatItem) {
        const extensionKey = flatItem[glKey];
        const extensionVal = ext[extensionKey];

        if (extensionVal instanceof Function) {
          gl[glKey] = extensionVal.bind(ext);
        } else {
          gl[glKey] = extensionVal;
        }
      }
    }
  }

  /** 兼容 WebGL 1和 WebGL 2,抹平接口差异 */
  private compatibleAll() {
    // 需要兼容的能力
    const { depthTexture } = GLCapabilityType;

    this.compatible(depthTexture, {
      UNSIGNED_INT_24_8: "UNSIGNED_INT_24_8_WEBGL"
    });
  }
}
