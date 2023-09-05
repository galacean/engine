import { Logger } from "../base/Logger";
import { ShaderLib } from "./ShaderLib";

export class ShaderFactory {
  static parseCustomMacros(macros: string[]) {
    return macros.map((m) => `#define ${m}\n`).join("");
  }

  static parseIncludes(src: string) {
    const regex = /^[ \t]*#include +<([\w\d.]+)>/gm;

    function replace(match, slice) {
      var replace = ShaderLib[slice];

      if (replace === undefined) {
        Logger.error(`Shader slice "${match.trim()}" not founded.`);
        return "";
      }

      return ShaderFactory.parseIncludes(replace);
    }

    return src.replace(regex, replace);
  }

  /**
   * GLSL extension.
   * @param extensions - such as ["GL_EXT_shader_texture_lod"]
   * */
  static parseExtension(extensions: string[]): string {
    return extensions.map((e) => `#extension ${e} : enable\n`).join("");
  }

  /**
   * Convert lower GLSL version to GLSL 300 es.
   * @param shader - code
   * @param isFrag - Whether it is a fragment shader.
   * */
  static convertTo300(shader: string, isFrag?: boolean) {
    /** replace attribute and in */
    shader = shader.replace(/\battribute\b/g, "in");
    shader = shader.replace(/\bvarying\b/g, isFrag ? "in" : "out");

    /** replace api */
    shader = shader.replace(/\btexture(2D|Cube)\b/g, "texture");
    shader = shader.replace(/\btexture(2D|Cube)LodEXT\b/g, "textureLod");
    if (isFrag) {
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

    return shader;
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
