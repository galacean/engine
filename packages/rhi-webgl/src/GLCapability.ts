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
    if (!this.rhi.isWebGL2) {
      this.compatibleAllInterface();
    }
  }

  /**
   * 查询能否使用某些 GL 能力
   * */
  public canIUse(capabilityType: GLCapabilityType): boolean {
    return this.capabilityList.get(capabilityType);
  }

  /**
   *  初始化能力
   * */
  private init() {
    const cap = this.capabilityList;
    const { isWebGL2 } = this.rhi;
    let requireExtension = this.rhi.requireExtension.bind(this.rhi);

    const {
      standardDerivatives,
      shaderTextureLod,
      elementIndexUint,
      depthTexture,
      vertexArrayObject,
      multipleSample,
      drawBuffers
    } = GLCapabilityType;

    cap.set(standardDerivatives, isWebGL2 || !!requireExtension(standardDerivatives));
    cap.set(shaderTextureLod, isWebGL2 || !!requireExtension(shaderTextureLod));
    cap.set(elementIndexUint, isWebGL2 || !!requireExtension(elementIndexUint));
    cap.set(depthTexture, isWebGL2 || !!requireExtension(depthTexture));
    cap.set(vertexArrayObject, isWebGL2 || !!requireExtension(vertexArrayObject));
    cap.set(multipleSample, isWebGL2);
    cap.set(drawBuffers, isWebGL2 || !!requireExtension(drawBuffers));
  }

  /**
   * 如果不是 WebGL2 环境,但是有插件能补充该能力，则抹平该差异
   * @example
   * compatible(GLCapabilityType.depthTexture,{
   *    UNSIGNED_INT_24_8: "UNSIGNED_INT_24_8_WEBGL"
   * })
   * 满足条件时， gl.UNSIGNED_INT_24_8 = ext.UNSIGNED_INT_24_8_WEBGL
   * */
  private compatibleInterface(capabilityType: GLCapabilityType, flatItem: { [glKey: string]: extensionKey }) {
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
  private compatibleAllInterface() {
    // 需要兼容的能力
    const { depthTexture, vertexArrayObject, drawBuffers } = GLCapabilityType;

    this.compatibleInterface(depthTexture, {
      UNSIGNED_INT_24_8: "UNSIGNED_INT_24_8_WEBGL"
    });
    this.compatibleInterface(vertexArrayObject, {
      createVertexArray: "createVertexArrayOES",
      deleteVertexArray: "deleteVertexArrayOES",
      isVertexArray: "isVertexArrayOES",
      bindVertexArray: "bindVertexArrayOES"
    });

    const items = {};
    for (let i = 0; i < this.rhi.requireExtension(drawBuffers).MAX_DRAW_BUFFERS_WEBGL; i++) {
      i != 0 && (items[`COLOR_ATTACHMENT${i}`] = `COLOR_ATTACHMENT${i}_WEBGL`);
      items[`DRAW_BUFFER0${i}`] = `DRAW_BUFFER${i}_WEBGL`;
    }
    this.compatibleInterface(drawBuffers, {
      drawBuffers: "drawBuffersWEBGL",
      ...items
    });
  }
}
