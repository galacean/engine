import { GLCapabilityType } from "../base/Constant";
import { Logger } from "../base/Logger";
import { Engine } from "../Engine";
import { ShaderMacro } from "../shader/ShaderMacro";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { ShaderLib } from "./ShaderLib";

export class ShaderFactory {
  /** @internal */
  static readonly _shaderExtension = [
    "GL_EXT_shader_texture_lod",
    "GL_OES_standard_derivatives",
    "GL_EXT_draw_buffers",
    "GL_EXT_frag_depth"
  ]
    .map((e) => `#extension ${e} : enable\n`)
    .join("");

  private static readonly _has300OutInFragReg = /\bout\s+(?:\w+\s+)?(?:vec4)\s+(?:\w+)\s*;/; // [layout(location = 0)] out [highp] vec4 [color];

  static parseCustomMacros(macros: ShaderMacro[]) {
    return macros.map((m) => `#define ${m.value ? m.name + ` ` + m.value : m.name}\n`).join("");
  }

  /**
   * @internal
   * Compile vertex and fragment source with standard macros, includes, and version header.
   * @param engine - Engine instance
   * @param macroCollection - Current macro collection
   * @param vertexSource - Raw vertex shader source (may contain #include)
   * @param fragmentSource - Raw fragment shader source
   * @returns Compiled { vertexSource, fragmentSource } ready for ShaderProgram
   */
  static compilePlatformSource(
    engine: Engine,
    macroCollection: ShaderMacroCollection,
    vertexSource: string,
    fragmentSource: string
  ): { vertexSource: string; fragmentSource: string } {
    const isWebGL2 = engine._hardwareRenderer.isWebGL2;
    const shaderMacroList = new Array<ShaderMacro>();
    ShaderMacro._getMacrosElements(macroCollection, shaderMacroList);
    shaderMacroList.push(ShaderMacro.getByName(isWebGL2 ? "GRAPHICS_API_WEBGL2" : "GRAPHICS_API_WEBGL1"));
    if (engine._hardwareRenderer.canIUse(GLCapabilityType.shaderTextureLod)) {
      shaderMacroList.push(ShaderMacro.getByName("HAS_TEX_LOD"));
    }
    if (engine._hardwareRenderer.canIUse(GLCapabilityType.standardDerivatives)) {
      shaderMacroList.push(ShaderMacro.getByName("HAS_DERIVATIVES"));
    }

    let noIncludeVertex = ShaderFactory.parseIncludes(vertexSource);
    let noIncludeFrag = ShaderFactory.parseIncludes(fragmentSource);

    const macroStr = ShaderFactory.parseCustomMacros(shaderMacroList);
    noIncludeVertex = macroStr + noIncludeVertex;
    noIncludeFrag = macroStr + noIncludeFrag;

    if (isWebGL2) {
      noIncludeVertex = ShaderFactory.convertTo300(noIncludeVertex);
      noIncludeFrag = ShaderFactory.convertTo300(noIncludeFrag, true);
    }

    const versionStr = isWebGL2 ? "#version 300 es" : "#version 100";
    const precisionStr = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  precision highp int;
#else
  precision mediump float;
  precision mediump int;
#endif
`;

    return {
      vertexSource: `${versionStr}\nprecision highp float;\n${noIncludeVertex}`,
      fragmentSource: `${versionStr}\n${isWebGL2 ? "" : ShaderFactory._shaderExtension}${precisionStr}${noIncludeFrag}`
    };
  }

  static registerInclude(includeName: string, includeSource: string) {
    if (ShaderLib[includeName]) {
      throw `The "${includeName}" shader include already exist`;
    }
    ShaderLib[includeName] = includeSource;
  }

  static unRegisterInclude(includeName: string) {
    delete ShaderLib[includeName];
  }

  /**
   * @param regex Supports both `#include <path>` and `#include "path"` syntax.
   */
  static parseIncludes(src: string, regex = /^[ \t]*#include +[<"]([\w\d./]+)[>"]/gm) {
    function replace(match, slice) {
      var replace = ShaderLib[slice];

      if (replace === undefined) {
        Logger.error(`Shader slice "${match.trim()}" not founded.`);
        return "";
      }

      return ShaderFactory.parseIncludes(replace, regex);
    }

    return src.replace(regex, replace);
  }

  /**
   * Convert lower GLSL version to GLSL 300 es.
   * @param shader - code
   * @param isFrag - Whether it is a fragment shader.
   * */
  static convertTo300(shader: string, isFrag?: boolean) {
    shader = shader.replace(/\bvarying\b/g, isFrag ? "in" : "out");
    shader = shader.replace(/\btexture(2D|Cube)\b/g, "texture");
    shader = shader.replace(/\btexture2DProj\b/g, "textureProj");
    shader = shader.replace(/\btexture(2D|Cube)LodEXT\b/g, "textureLod");
    shader = shader.replace(/\btexture(2D|Cube)GradEXT\b/g, "textureGrad");
    shader = shader.replace(/\btexture2DProjLodEXT\b/g, "textureProjLod");
    shader = shader.replace(/\btexture2DProjGradEXT\b/g, "textureProjGrad");

    if (isFrag) {
      shader = shader.replace(/\bgl_FragDepthEXT\b/g, "gl_FragDepth");

      if (!ShaderFactory._has300Output(shader)) {
        const isMRT = /\bgl_FragData\[.+?\]/g.test(shader);
        if (isMRT) {
          shader = shader.replace(/\bgl_FragColor\b/g, "gl_FragData[0]");
          const result = shader.match(/\bgl_FragData\[.+?\]/g);
          shader = this._replaceMRTShader(shader, result);
        } else {
          shader = "out vec4 glFragColor;\n" + shader;
          shader = shader.replace(/\bgl_FragColor\b/g, "glFragColor");
        }
      }
    } else {
      shader = shader.replace(/\battribute\b/g, "in");
    }

    return shader;
  }

  private static _has300Output(fragmentShader: string): boolean {
    return ShaderFactory._has300OutInFragReg.test(fragmentShader);
  }

  private static _replaceMRTShader(shader: string, result: string[]): string {
    let declaration = "";
    const mrtIndexSet = new Set();

    for (let i = 0; i < result.length; i++) {
      const res = result[i].match(/\bgl_FragData\[(.+?)\]/);
      mrtIndexSet.add(res[1]);
    }

    mrtIndexSet.forEach((index) => {
      declaration += `layout(location=${index}) out vec4 fragOutColor${index};\n`;
    });
    declaration += `void main(`;

    shader = shader.replace(/\bgl_FragData\[(.+?)\]/g, "fragOutColor$1");

    shader = shader.replace(/void\s+?main\s*\(/g, declaration);
    return shader;
  }
}
