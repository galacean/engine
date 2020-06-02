import { GLRenderHardware } from "./GLRenderHardware";
import { GLCapabilityType, GLCompressedTextureInternalFormat } from "@alipay/o3-base";

type extensionKey = string;

/**
 * GL 能力统一管理
 * */
export class GLCapability {
  _rhi: GLRenderHardware;
  capabilityList: Map<GLCapabilityType, boolean>;
  private _maxAnisoLevel: number;

  /**
   * 最大各向异性过滤等级。
   */
  get maxAnisoLevel() {
    if (!this._maxAnisoLevel) {
      const ext = this.rhi.requireExtension(GLCapabilityType.textureFilterAnisotropic);
      this._maxAnisoLevel = ext ? this.rhi.gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 1;
    }
    return this._maxAnisoLevel;
  }

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
   * 查询能否使用某种压缩纹理格式
   * */
  public canIUseCompressedTextureInternalFormat(internalType: GLCompressedTextureInternalFormat): boolean {
    const {
      // astc
      RGBA_ASTC_4X4_KHR,
      RGBA_ASTC_12X12_KHR,
      SRGB8_ALPHA8_ASTC_4X4_KHR,
      SRGB8_ALPHA8_ASTC_12X12_KHR,
      // etc1
      RGB_ETC1_WEBGL,
      // etc
      R11_EAC,
      SRGB8_PUNCHTHROUGH_ALPHA1_ETC2,
      // pvrtc
      RGB_PVRTC_4BPPV1_IMG,
      RGBA_PVRTC_2BPPV1_IMG,
      // s3tc
      RGB_S3TC_DXT1_EXT,
      RGBA_S3TC_DXT5_EXT
    } = GLCompressedTextureInternalFormat;
    if (
      (internalType >= RGBA_ASTC_4X4_KHR && RGBA_ASTC_12X12_KHR <= RGBA_ASTC_12X12_KHR) ||
      (internalType >= SRGB8_ALPHA8_ASTC_4X4_KHR && internalType <= SRGB8_ALPHA8_ASTC_12X12_KHR)
    ) {
      return this.canIUse(GLCapabilityType.astc);
    } else if (internalType === RGB_ETC1_WEBGL) {
      return this.canIUse(GLCapabilityType.etc1);
    } else if (internalType >= R11_EAC && internalType <= SRGB8_PUNCHTHROUGH_ALPHA1_ETC2) {
      return this.canIUse(GLCapabilityType.etc);
    } else if (internalType >= RGB_PVRTC_4BPPV1_IMG && internalType <= RGBA_PVRTC_2BPPV1_IMG) {
      return this.canIUse(GLCapabilityType.pvrtc);
    } else if (internalType >= RGB_S3TC_DXT1_EXT && internalType <= RGBA_S3TC_DXT5_EXT) {
      return this.canIUse(GLCapabilityType.s3tc);
    }
    return false;
  }

  /** 是否能使用更多骨骼关节 */
  public get canIUseMoreJoints() {
    return (
      this.canIUse(GLCapabilityType.textureFloat) &&
      this.rhi.renderStates.getParameter(this.rhi.gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) > 0
    );
  }

  /**
   *  初始化能力
   * */
  private init() {
    const cap = this.capabilityList;
    const { isWebGL2 } = this.rhi;
    const requireExtension = this.rhi.requireExtension.bind(this.rhi);

    const {
      standardDerivatives,
      shaderTextureLod,
      elementIndexUint,
      depthTexture,
      vertexArrayObject,
      instancedArrays,
      multipleSample,
      drawBuffers,

      astc,
      astc_webkit,
      etc,
      etc_webkit,
      etc1,
      etc1_webkit,
      pvrtc,
      pvrtc_webkit,
      s3tc,
      s3tc_webkit,

      textureFloat,
      colorBufferFloat,
      textureFilterAnisotropic
    } = GLCapabilityType;
    cap.set(standardDerivatives, isWebGL2 || !!requireExtension(standardDerivatives));
    cap.set(shaderTextureLod, isWebGL2 || !!requireExtension(shaderTextureLod));
    cap.set(elementIndexUint, isWebGL2 || !!requireExtension(elementIndexUint));
    cap.set(depthTexture, isWebGL2 || !!requireExtension(depthTexture));
    cap.set(vertexArrayObject, isWebGL2 || !!requireExtension(vertexArrayObject));
    cap.set(instancedArrays, isWebGL2 || !!requireExtension(instancedArrays));
    cap.set(multipleSample, isWebGL2);
    cap.set(drawBuffers, isWebGL2 || !!requireExtension(drawBuffers));
    cap.set(textureFloat, isWebGL2 || !!requireExtension(textureFloat));
    cap.set(colorBufferFloat, isWebGL2 && !!requireExtension(colorBufferFloat));
    cap.set(textureFilterAnisotropic, !!requireExtension(textureFilterAnisotropic));

    cap.set(astc, !!(requireExtension(astc) || requireExtension(astc_webkit)));
    cap.set(etc, !!(requireExtension(etc) || requireExtension(etc_webkit)));
    cap.set(etc1, !!(requireExtension(etc1) || requireExtension(etc1_webkit)));
    cap.set(pvrtc, !!(requireExtension(pvrtc) || requireExtension(pvrtc_webkit)));
    cap.set(s3tc, !!(requireExtension(s3tc) || requireExtension(s3tc_webkit)));
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
    const {
      depthTexture,
      vertexArrayObject,
      instancedArrays,
      drawBuffers,
      textureFilterAnisotropic
    } = GLCapabilityType;

    this.compatibleInterface(depthTexture, {
      UNSIGNED_INT_24_8: "UNSIGNED_INT_24_8_WEBGL"
    });
    this.compatibleInterface(vertexArrayObject, {
      createVertexArray: "createVertexArrayOES",
      deleteVertexArray: "deleteVertexArrayOES",
      isVertexArray: "isVertexArrayOES",
      bindVertexArray: "bindVertexArrayOES"
    });
    this.compatibleInterface(instancedArrays, {
      drawArraysInstanced: "drawArraysInstancedANGLE",
      drawElementsInstanced: "drawElementsInstancedANGLE",
      vertexAttribDivisor: "vertexAttribDivisorANGLE"
    });
    const items = {};
    if (this.canIUse(GLCapabilityType.drawBuffers)) {
      for (let i = 0; i < this.rhi.requireExtension(drawBuffers).MAX_DRAW_BUFFERS_WEBGL; i++) {
        i != 0 && (items[`COLOR_ATTACHMENT${i}`] = `COLOR_ATTACHMENT${i}_WEBGL`);
        items[`DRAW_BUFFER0${i}`] = `DRAW_BUFFER${i}_WEBGL`;
      }
      this.compatibleInterface(drawBuffers, {
        drawBuffers: "drawBuffersWEBGL",
        ...items
      });
    }
    this.compatibleInterface(textureFilterAnisotropic, {
      TEXTURE_MAX_ANISOTROPY_EXT: "TEXTURE_MAX_ANISOTROPY_EXT"
    });
  }
}
