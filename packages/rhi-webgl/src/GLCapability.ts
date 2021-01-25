import { WebGLRenderer } from "./WebGLRenderer";
import { GLCapabilityType, GLCompressedTextureInternalFormat } from "@oasis-engine/core";

type extensionKey = string;

/**
 * GL capability.
 */
export class GLCapability {
  private _maxDrawBuffers: number;
  private _maxAnisoLevel: number;
  private _maxAntiAliasing: number;

  _rhi: WebGLRenderer;
  capabilityList: Map<GLCapabilityType, boolean>;

  get maxDrawBuffers() {
    if (!this._maxDrawBuffers) {
      if (this.canIUse(GLCapabilityType.drawBuffers)) {
        this._maxDrawBuffers = this._rhi.gl.getParameter(this._rhi.gl.MAX_DRAW_BUFFERS);
      } else {
        this._maxDrawBuffers = 1;
      }
    }
    return this._maxDrawBuffers;
  }

  /**
   * Max anisoLevel.
   */
  get maxAnisoLevel(): number {
    if (!this._maxAnisoLevel) {
      const ext = this._rhi.requireExtension(GLCapabilityType.textureFilterAnisotropic);
      this._maxAnisoLevel = ext ? this._rhi.gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 1;
    }
    return this._maxAnisoLevel;
  }

  /**
   * Max MSAA count.
   */
  get maxAntiAliasing(): number {
    if (!this._maxAntiAliasing) {
      const gl = this._rhi.gl;
      const canMSAA = this.canIUse(GLCapabilityType.multipleSample);

      this._maxAntiAliasing = canMSAA ? gl.getParameter(gl.MAX_SAMPLES) : 1;
    }
    return this._maxAntiAliasing;
  }

  get rhi() {
    return this._rhi;
  }

  constructor(rhi: WebGLRenderer) {
    this._rhi = rhi;
    this.capabilityList = new Map();

    this.init();
    this.compatibleAllInterface();
  }

  /**
   * Check device capabilities.
   */
  public canIUse(capabilityType: GLCapabilityType): boolean {
    return this.capabilityList.get(capabilityType);
  }

  /**
   * Check if can use some compressed texture format.
   */
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
      SRGB8_ALPHA8_ETC2_EAC,
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
    } else if (internalType >= R11_EAC && internalType <= SRGB8_ALPHA8_ETC2_EAC) {
      return this.canIUse(GLCapabilityType.etc);
    } else if (internalType >= RGB_PVRTC_4BPPV1_IMG && internalType <= RGBA_PVRTC_2BPPV1_IMG) {
      return this.canIUse(GLCapabilityType.pvrtc);
    } else if (internalType >= RGB_S3TC_DXT1_EXT && internalType <= RGBA_S3TC_DXT5_EXT) {
      return this.canIUse(GLCapabilityType.s3tc);
    }
    return false;
  }

  /**
   * If can use more joints.
   */
  public get canIUseMoreJoints() {
    return (
      this.canIUse(GLCapabilityType.textureFloat) &&
      this.rhi.renderStates.getParameter(this.rhi.gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) > 0
    );
  }

  /**
   *  Init capabilities.
   */
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
      textureHalfFloat,
      textureFloatLinear,
      textureHalfFloatLinear,
      WEBGL_colorBufferFloat,
      colorBufferFloat,
      colorBufferHalfFloat,
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
    cap.set(textureHalfFloat, isWebGL2 || !!requireExtension(textureHalfFloat));
    cap.set(textureFloatLinear, !!requireExtension(textureFloatLinear));
    cap.set(textureHalfFloatLinear, isWebGL2 || !!requireExtension(textureHalfFloatLinear));
    cap.set(
      colorBufferFloat,
      (isWebGL2 && !!requireExtension(colorBufferFloat)) || !!requireExtension(WEBGL_colorBufferFloat)
    );
    cap.set(
      colorBufferHalfFloat,
      (isWebGL2 && !!requireExtension(colorBufferFloat)) || !!requireExtension(colorBufferHalfFloat)
    );
    cap.set(textureFilterAnisotropic, !!requireExtension(textureFilterAnisotropic));

    cap.set(astc, !!(requireExtension(astc) || requireExtension(astc_webkit)));
    cap.set(etc, !!(requireExtension(etc) || requireExtension(etc_webkit)));
    cap.set(etc1, !!(requireExtension(etc1) || requireExtension(etc1_webkit)));
    cap.set(pvrtc, !!(requireExtension(pvrtc) || requireExtension(pvrtc_webkit)));
    cap.set(s3tc, !!(requireExtension(s3tc) || requireExtension(s3tc_webkit)));
  }

  /**
   * If there are extensions that can supplement this ability, smooth out the difference.
   * @example
   * compatible(GLCapabilityType.depthTexture,{
   *    UNSIGNED_INT_24_8: "UNSIGNED_INT_24_8_WEBGL"
   * })
   * gl.UNSIGNED_INT_24_8 = ext.UNSIGNED_INT_24_8_WEBGL
   */
  private compatibleInterface(capabilityType: GLCapabilityType, flatItem: { [glKey: string]: extensionKey }) {
    const rhi = this.rhi;
    const gl = rhi.gl;
    let ext = null;

    if ((ext = rhi.requireExtension(capabilityType))) {
      for (let glKey in flatItem) {
        const extensionKey = flatItem[glKey];
        const extensionVal = ext[extensionKey];

        // Mini game hack the native function,use “.bind” to smooth out if is “Funcion”.
        if (extensionVal?.bind) {
          gl[glKey] = extensionVal.bind(ext);
        } else {
          gl[glKey] = extensionVal;
        }
      }
    }
  }

  private compatibleAllInterface() {
    const {
      depthTexture,
      vertexArrayObject,
      instancedArrays,
      drawBuffers,
      textureFilterAnisotropic,
      textureHalfFloat,
      colorBufferHalfFloat,
      WEBGL_colorBufferFloat
    } = GLCapabilityType;
    const { isWebGL2 } = this.rhi;

    if (!isWebGL2) {
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
      this.compatibleInterface(drawBuffers, {
        MAX_DRAW_BUFFERS: "MAX_DRAW_BUFFERS_WEBGL"
      });
      const items = {};
      if (this.canIUse(GLCapabilityType.drawBuffers)) {
        const maxDrawBuffers = this.maxDrawBuffers;
        for (let i = 0; i < maxDrawBuffers; i++) {
          i != 0 && (items[`COLOR_ATTACHMENT${i}`] = `COLOR_ATTACHMENT${i}_WEBGL`);
          items[`DRAW_BUFFER${i}`] = `DRAW_BUFFER${i}_WEBGL`;
        }
        this.compatibleInterface(drawBuffers, {
          drawBuffers: "drawBuffersWEBGL",
          ...items
        });
      }
      this.compatibleInterface(textureHalfFloat, {
        HAFL_FLOAT: "HALF_FLOAT_OES"
      });
      this.compatibleInterface(colorBufferHalfFloat, {
        RGBA16F: "RBGA16F_EXT"
      });
      this.compatibleInterface(WEBGL_colorBufferFloat, {
        RGBA32F: "RBGA32F_EXT"
      });
    }

    this.compatibleInterface(textureFilterAnisotropic, {
      TEXTURE_MAX_ANISOTROPY_EXT: "TEXTURE_MAX_ANISOTROPY_EXT"
    });
  }
}
