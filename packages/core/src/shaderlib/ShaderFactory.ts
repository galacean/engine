import { Logger } from "../base/Logger";
import { ShaderLib } from "./ShaderLib";

export class ShaderFactory {
  /** @internal */
  static readonly _shaderExtension = ["GL_EXT_shader_texture_lod", "GL_OES_standard_derivatives", "GL_EXT_draw_buffers"]
    .map((e) => `#extension ${e} : enable\n`)
    .join("");

  private static readonly _hasOutInFragReg = /\bout\s+(?:\w+\s+)?(?:float|vec4)\s+(?:\w+)\s*;/; // [layout(location = 0)] out [highp] [vec4|float] [color|gl_FragDepth];

  static parseCustomMacros(macros: string[]) {
    return macros.map((m) => `#define ${m}\n`).join("");
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
   * @param regex The default regex is for engine's builtin glsl `#include` syntax,
   * since `ShaderLab` use the same parsing function but different syntax for `#include` --- `/^[ \t]*#include +"([\w\d.]+)"/gm`
   */
  static parseIncludes(src: string, regex = /^[ \t]*#include +<([\w\d.]+)>/gm) {
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
    shader = shader.replace(/\battribute\b/g, "in");
    shader = shader.replace(/\bvarying\b/g, isFrag ? "in" : "out");
    shader = shader.replace(/\btexture(2D|Cube)\b/g, "texture");

    if (isFrag) {
      shader = shader.replace(/\btexture(2D|Cube)LodEXT\b/g, "textureLod");
      shader = shader.replace(/\btexture(2D|Cube)GradEXT\b/g, "textureGrad");
      shader = shader.replace(/\btexture2DProjLodEXT\b/g, "textureProjLod");
      shader = shader.replace(/\btexture2DProj\b/g, "textureProj");
      shader = shader.replace(/\btexture2DProjGradEXT\b/g, "textureProjGrad");
      shader = shader.replace(/\bgl_FragDepthEXT\b/g, "gl_FragDepth");

      if (!ShaderFactory._hasOutput(shader)) {
        const isMRT = /\bgl_FragData\[.+?\]/g.test(shader);
        if (isMRT) {
          shader = shader.replace(/\bgl_FragColor\b/g, "gl_FragData[0]");
          const result = shader.match(/\bgl_FragData\[.+?\]/g);
          shader = this._replaceMRTShader(shader, result);
        } else {
          shader = shader.replace(/void\s+?main\s*\(/g, `out vec4 glFragColor;\nvoid main(`);
          shader = shader.replace(/\bgl_FragColor\b/g, "glFragColor");
        }
      }
    }

    return shader;
  }

  /**
   * The temporary solution for checking whether the fragment shader is GLSL 300 es.
   * @internal
   */
  static _hasOutput(fragmentShader: string) {
    return ShaderFactory._hasOutInFragReg.test(fragmentShader);
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
