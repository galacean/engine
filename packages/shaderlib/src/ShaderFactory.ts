import { ShaderLib, InjectShaderSlices } from "./ShaderLib";
import { Logger } from "@alipay/o3-base";

class ShaderFactory {
  static parseVersion(v) {
    return `#version ${v}\n`;
  }

  static parsePrecision(p) {
    return `precision ${p} float;\n` + `precision ${p} int;\n`;
  }

  static parseShaderName(name) {
    return `#define O3_SHADER_NAME ${name}\n`;
  }

  static parseAttributeMacros(macros) {
    return (
      "#define O3_ATTRIBUTE_MACROS_START\n" +
      macros.map(m => `#define ${m}\n`).join("") +
      "#define O3_ATTRIBUTE_MACROS_END\n"
    );
  }

  static parseCustomMacros(macros) {
    return (
      "#define O3_CUSTOM_MACROS_START\n" + macros.map(m => `#define ${m}\n`).join("") + "#define O3_CUSTOM_MACROS_END\n"
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

  static parseExtension(extensions) {
    return (
      "#define O3_USE_EXTENSION_START\n" +
      extensions.map(e => `#extension ${e} : enable\n`).join("") +
      "#define O3_USE_EXTENSION_END\n"
    );
  }
}

export { ShaderFactory };
