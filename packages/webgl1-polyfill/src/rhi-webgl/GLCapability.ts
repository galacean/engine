import { GLCapabilityType } from "@galacean/engine-core";
import type { GLCapability as HostCapability, WebGLGraphicDevice } from "@galacean/engine-rhi-webgl";
import { Mixin, Overwrite } from "@/override";
import { WebGL1Extension } from "./WebGL1Extension";

export enum WebGL1CapabilityType {
  fragmentHighPrecision = "fragmentHighPrecision",
  vertexTextureSampling = "vertexTextureSampling"
}

type WebGL1Capabilities = HostCapability<GLCapabilityType | WebGL1CapabilityType | WebGL1Extension>;
export type WebGL1GraphicDevice = Omit<WebGLGraphicDevice, "canIUse"> & Pick<WebGL1Capabilities, "canIUse">;

export function initializeWebGL1Capabilities(capability: Pick<HostCapability, "rhi" | "capabilityList">): void {
  const { rhi, capabilityList } = capability;
  const gl = rhi.gl;
  const precision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
  capabilityList.set(WebGL1CapabilityType.fragmentHighPrecision, (precision?.precision ?? 0) > 0);
  capabilityList.set(
    WebGL1CapabilityType.vertexTextureSampling,
    gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) > 0
  );
  for (const extension of Object.values(WebGL1Extension)) {
    capabilityList.set(extension, !!rhi.requireExtension(extension));
  }
}

@Mixin("GLCapability")
export class GLCapability {
  declare readonly rhi: WebGLGraphicDevice;

  @Overwrite
  _getColorBufferSupport(): { float: boolean; halfFloat: boolean } {
    const { rhi } = this;
    return {
      float: !!rhi.requireExtension(WebGL1Extension.colorBufferFloat),
      halfFloat: !!rhi.requireExtension(GLCapabilityType.colorBufferHalfFloat)
    };
  }

  @Overwrite
  _getMaxDrawBuffers(): number {
    const { rhi } = this;
    const extension = rhi.requireExtension(WebGL1Extension.drawBuffers);
    return extension ? rhi.gl.getParameter(extension.MAX_DRAW_BUFFERS_WEBGL) : 1;
  }

  @Overwrite
  get maxAntiAliasing(): number {
    return 1;
  }
}
