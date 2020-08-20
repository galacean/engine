import { ShaderLib, InjectShaderSlices } from "./ShaderLib";
import { Logger } from "../base/Logger";

class ShaderFactory {
  /**
   * GLSL 版本
   * @param {string} version - "100" | "300 es"
   * */
  static parseVersion(version: string = "100") {
    return `#version ${version}\n`;
  }

  static parsePrecision(vertP: string, fragP: string, compileVert?: boolean) {
    const downgrade = "mediump";

    return `
        #ifdef GL_FRAGMENT_PRECISION_HIGH
          precision ${compileVert ? vertP : fragP} float;
          precision ${compileVert ? vertP : fragP} int;

          #define O3_VERTEX_PRECISION ${vertP}
          #define O3_FRAGMENT_PRECISION ${fragP}
        #else
          precision ${downgrade} float;
          precision ${downgrade} int;

          #define O3_VERTEX_PRECISION ${downgrade}
          #define O3_FRAGMENT_PRECISION ${downgrade}
        #endif
      `;
  }

  static parseShaderName(name) {
    return `#define O3_SHADER_NAME ${name}\n`;
  }

  static parseAttributeMacros(macros) {
    return (
      "#define O3_ATTRIBUTE_MACROS_START\n" +
      macros.map((m) => `#define ${m}\n`).join("") +
      "#define O3_ATTRIBUTE_MACROS_END\n"
    );
  }

  static parseCustomMacros(macros) {
    return (
      "#define O3_CUSTOM_MACROS_START\n" +
      macros.map((m) => `#define ${m}\n`).join("") +
      "#define O3_CUSTOM_MACROS_END\n"
    );
  }

  static parseShader(src) {
    return ShaderFactory.parseIncludes(src);
  }

  static parseIncludes(src) {
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

  static InjectShaderSlices(slices) {
    InjectShaderSlices(slices);
  }

  /**
   * 相应版本的 extension
   * @param {string[]} extensions - such as ["GL_EXT_shader_texture_lod"]
   * */
  static parseExtension(extensions: string[]) {
    return (
      `#define O3_EXTENSION_START\n` +
      extensions.map((e) => `#extension ${e} : enable\n`).join("") +
      `#define O3_EXTENSION_END\n`
    );
  }

  /**
   * 切换低版本 GLSL 到 GLSL 300 es
   * @param {string} shader - code
   * @param {boolean} isFrag - 是否为片元着色器。
   * */
  static convertTo300(shader: string, isFrag?: boolean) {
    const isGLSL300 = shader.includes("#version 300 es");

    // 如果本来就是新版本着色器，则无需转换。
    if (isGLSL300) return shader;

    /** 替换版本 */
    shader = shader.replace(/#version 100/, "#version 300 es");
    /** 修饰符替换 */
    shader = shader.replace(/\battribute\b/g, "in");
    shader = shader.replace(/\bvarying\b/g, isFrag ? "in" : "out");

    /** 内置变量替换 */
    shader = shader.replace(/\btexture(2D|Cube)\s*\(/g, "texture(");
    shader = shader.replace(/\btexture(2D|Cube)LodEXT\s*\(/g, "textureLod(");
    if (isFrag) {
      const isMRT = /\bgl_FragData\[.+?\]/g.test(shader);
      if (isMRT) {
        shader = shader.replace(/\bgl_FragColor\b/g, "gl_FragData[0]");
        const result = shader.match(/\bgl_FragData\[.+?\]/g);
        shader = this.replaceMRTShader(shader, result);
      } else {
        shader = shader.replace(/void\s+?main\s*\(/g, `out vec4 glFragColor;\nvoid main(`);
        shader = shader.replace(/\bgl_FragColor\b/g, "glFragColor");
      }
    }

    return shader;
  }

  /**
   * 返回相应 shaderCode 中的 draw buffer 长度
   * @param shader - shader code
   */
  static getMaxDrawBuffers(shader: string): number {
    const mrtIndexSet = new Set();
    const result = shader.match(/\bgl_FragData\[.+?\]/g) || [];

    for (let i = 0; i < result.length; i++) {
      const res = result[i].match(/\bgl_FragData\[(.+?)\]/);
      mrtIndexSet.add(res[1]);
    }

    return mrtIndexSet.size;
  }

  /**
   * 1. 兼容 gl_FragColor 和 gl_FragData 同时存在的报错
   * */
  static compatible(fragmentShader: string) {
    const hasFragData = /\bgl_FragData\[.+?\]/g.test(fragmentShader);
    if (hasFragData) {
      fragmentShader = fragmentShader.replace(/\bgl_FragColor\b/g, "gl_FragData[0]");
    }
    return fragmentShader;
  }

  private static replaceMRTShader(shader: string, result: string[]): string {
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

export { ShaderFactory };
