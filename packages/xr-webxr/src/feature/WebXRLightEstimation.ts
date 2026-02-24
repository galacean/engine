import { IXRLightEstimate, IXRLightEstimationPlatformFeature } from "@galacean/engine-design";
import { XRFeatureType } from "@galacean/engine-xr";
import { registerXRPlatformFeature } from "../WebXRDevice";
import { WebXRFrame } from "../WebXRFrame";
import { WebXRSession } from "../WebXRSession";
import { WebXRFeature } from "./WebXRFeature";

interface IWebGL2CubeTextureQueryContext extends WebGL2RenderingContext {
  getTexLevelParameter(target: number, level: number, pname: number): number;
}

/**
 * WebXR implementation of light estimation.
 */
@registerXRPlatformFeature(XRFeatureType.LightEstimation)
export class WebXRLightEstimation extends WebXRFeature implements IXRLightEstimationPlatformFeature {
  private _lightProbe: XRLightProbe | null = null;
  private _probeRequestInFlight = false;
  private _probeRequestFailed = false;
  private _platformSession: XRSession | null = null;
  private _reflectionBinding: XRWebGLBinding | null = null;
  private _reflectionChanged = true;

  private readonly _onReflectionChange = () => {
    this._reflectionChanged = true;
  };

  checkAvailable(session: WebXRSession, frame: WebXRFrame): boolean {
    if (!frame._platformFrame) {
      return false;
    }
    const platformSession = session._platformSession;
    if (this._platformSession !== platformSession) {
      this._resetSessionState();
      this._platformSession = platformSession;
    }
    if (this._lightProbe) {
      this._ensureReflectionBinding(session);
      return true;
    }
    if (!this._probeRequestInFlight && !this._probeRequestFailed && platformSession.requestLightProbe) {
      this._probeRequestInFlight = true;
      const lightProbeOptions: XRLightProbeInit = {};
      const preferredReflectionFormat = platformSession.preferredReflectionFormat;
      preferredReflectionFormat && (lightProbeOptions.reflectionFormat = preferredReflectionFormat);
      platformSession
        .requestLightProbe(Object.keys(lightProbeOptions).length ? lightProbeOptions : undefined)
        .then((probe: XRLightProbe) => {
          if (this._platformSession !== platformSession) {
            return;
          }
          this._lightProbe = probe;
          probe.addEventListener?.("reflectionchange", this._onReflectionChange);
          this._reflectionChanged = true;
          this._ensureReflectionBinding(session);
        })
        .catch((error: unknown) => {
          this._probeRequestFailed = true;
          console.warn("WebXR light estimation requestLightProbe failed.", error);
        })
        .finally(() => {
          this._probeRequestInFlight = false;
        });
    }
    return false;
  }

  getLightEstimate(session: WebXRSession, frame: WebXRFrame, estimate: IXRLightEstimate): boolean {
    if (!this._lightProbe) {
      return false;
    }
    let updated = false;
    const platformEstimate = frame._platformFrame.getLightEstimate(this._lightProbe);
    if (platformEstimate) {
      const coefficients = platformEstimate.sphericalHarmonicsCoefficients;
      if (coefficients && coefficients.length >= 27) {
        estimate.sphericalHarmonics.copyFromArray(coefficients);
        updated = true;
      }
      const direction = platformEstimate.primaryLightDirection;
      if (direction) {
        estimate.primaryLightDirection.set(direction.x, direction.y, direction.z);
        updated = true;
      }
      const intensity = platformEstimate.primaryLightIntensity;
      if (intensity) {
        estimate.primaryLightIntensity.set(intensity.x, intensity.y, intensity.z, 1);
        updated = true;
      }
    }

    this._ensureReflectionBinding(session);
    if (this._reflectionBinding?.getReflectionCubeMap) {
      if (this._reflectionChanged || !estimate.reflectionCubeMap) {
        const reflectionCubeMap = this._reflectionBinding.getReflectionCubeMap(this._lightProbe);
        this._reflectionChanged = false;

        if (estimate.reflectionCubeMap !== reflectionCubeMap) {
          estimate.reflectionCubeMap = reflectionCubeMap;
          updated = true;
        }

        if (reflectionCubeMap) {
          const { size, mipmapCount } = this._queryReflectionCubeMapInfo(session._gl, reflectionCubeMap);
          if (estimate.reflectionCubeMapSize !== size || estimate.reflectionCubeMapMipmapCount !== mipmapCount) {
            estimate.reflectionCubeMapSize = size;
            estimate.reflectionCubeMapMipmapCount = mipmapCount;
            updated = true;
          }
        } else if (estimate.reflectionCubeMapSize !== 0 || estimate.reflectionCubeMapMipmapCount !== 0) {
          estimate.reflectionCubeMapSize = 0;
          estimate.reflectionCubeMapMipmapCount = 0;
          updated = true;
        }
      }
    } else if (estimate.reflectionCubeMap || estimate.reflectionCubeMapSize !== 0 || estimate.reflectionCubeMapMipmapCount !== 0) {
      estimate.reflectionCubeMap = null;
      estimate.reflectionCubeMapSize = 0;
      estimate.reflectionCubeMapMipmapCount = 0;
      updated = true;
    }

    return updated;
  }

  _assembleOptions(options: XRSessionInit): void {
    options.optionalFeatures.push("light-estimation");
  }

  private _ensureReflectionBinding(session: WebXRSession): void {
    if (!this._lightProbe || this._reflectionBinding || typeof XRWebGLBinding === "undefined") {
      return;
    }
    try {
      this._reflectionBinding = new XRWebGLBinding(session._platformSession, session._gl);
      this._reflectionChanged = true;
    } catch (error) {
      console.warn("WebXR light estimation reflection binding failed.", error);
    }
  }

  private _queryReflectionCubeMapInfo(
    gl: WebGLRenderingContext | WebGL2RenderingContext,
    reflectionCubeMap: WebGLTexture
  ): { size: number; mipmapCount: number } {
    let size = 1;
    let mipmapCount = 1;
    const webgl2 = gl as IWebGL2CubeTextureQueryContext;

    if ((gl as WebGL2RenderingContext).texStorage2D) {
      const previousBinding = gl.getParameter(gl.TEXTURE_BINDING_CUBE_MAP) as WebGLTexture | null;
      const textureWidth = 0x1000;
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, reflectionCubeMap);
      try {
        size = webgl2.getTexLevelParameter(gl.TEXTURE_CUBE_MAP_POSITIVE_X, 0, textureWidth) || 1;
        mipmapCount = 0;
        for (let mipLevel = 0; mipLevel < 16; mipLevel++) {
          const levelSize = webgl2.getTexLevelParameter(gl.TEXTURE_CUBE_MAP_POSITIVE_X, mipLevel, textureWidth) || 0;
          if (levelSize <= 0) {
            break;
          }
          mipmapCount++;
          if (levelSize === 1) {
            break;
          }
        }
        mipmapCount = Math.max(mipmapCount, 1);
      } finally {
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, previousBinding);
      }
    }

    return { size: Math.max(size, 1), mipmapCount: Math.max(mipmapCount, 1) };
  }

  private _resetSessionState(): void {
    this._lightProbe?.removeEventListener?.("reflectionchange", this._onReflectionChange);
    this._lightProbe = null;
    this._probeRequestInFlight = false;
    this._probeRequestFailed = false;
    this._reflectionBinding = null;
    this._reflectionChanged = true;
  }
}
