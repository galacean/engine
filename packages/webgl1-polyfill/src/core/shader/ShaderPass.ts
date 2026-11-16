import {
  type Engine,
  ShaderFactory,
  ShaderMacro,
  type ShaderMacroCollection,
  ShaderMacroProcessor,
  ShaderPass
} from "@galacean/engine-core";
import { Mixin, Overwrite, Shadow } from "@/override";
import type { WebGL1GraphicDevice } from "../../rhi-webgl/GLCapability";
import { WebGL1Extension } from "../../rhi-webgl/WebGL1Extension";
const shaderExtension = [
  "GL_EXT_shader_texture_lod",
  "GL_OES_standard_derivatives",
  "GL_EXT_draw_buffers",
  "GL_EXT_frag_depth"
]
  .map((e) => `#extension ${e} : enable\n`)
  .join("");
const precisionStr = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
precision highp int;
#else
precision mediump float;
precision mediump int;
#endif
`;

@Mixin(ShaderPass)
export class ShaderPassMixin {
  @Shadow declare _vertexShaderInstructions: ShaderPass["_vertexShaderInstructions"];
  @Shadow declare _fragmentShaderInstructions: ShaderPass["_fragmentShaderInstructions"];

  @Overwrite
  _compileShaderSource(engine: Engine, macroCollection: ShaderMacroCollection, isGPUInstance: boolean) {
    const shaderMacroList: ReturnType<typeof ShaderMacro.getByName>[] = [];
    ShaderMacro._getMacrosElements(macroCollection, shaderMacroList);
    shaderMacroList.push(ShaderMacro.getByName("GRAPHICS_API_WEBGL1"));
    const device = engine._hardwareRenderer as WebGL1GraphicDevice;
    if (device.canIUse(WebGL1Extension.shaderTextureLod)) {
      shaderMacroList.push(ShaderMacro.getByName("HAS_TEX_LOD"));
    }
    if (device.canIUse(WebGL1Extension.standardDerivatives)) {
      shaderMacroList.push(ShaderMacro.getByName("HAS_DERIVATIVES"));
    }
    const macroMap = new Map<string, string>();
    for (let i = 0, n = shaderMacroList.length; i < n; i++) {
      const macro = shaderMacroList[i];
      macroMap.set(macro.name, macro.value ?? "");
    }
    let vertexSource = ShaderMacroProcessor.evaluate(this._vertexShaderInstructions, macroMap);
    let fragmentSource = ShaderMacroProcessor.evaluate(this._fragmentShaderInstructions, macroMap);
    let instanceLayout: ReturnType<typeof ShaderFactory.injectInstanceUBO>["instanceLayout"] = null;
    if (isGPUInstance) {
      const injected = ShaderFactory.injectInstanceUBO(engine, vertexSource, fragmentSource);
      vertexSource = injected.vertexSource;
      fragmentSource = injected.fragmentSource;
      instanceLayout = injected.instanceLayout;
    }
    const versionStr = "#version 100";
    return {
      vertexSource: ` ${versionStr}
      ${vertexSource}
    `,
      fragmentSource: ` ${versionStr}
      ${shaderExtension}
      ${precisionStr}
      ${fragmentSource}
    `,
      instanceLayout
    };
  }
}
