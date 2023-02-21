import { Engine } from "../Engine";
import { ShaderDataGroup } from "./enums/ShaderDataGroup";
import { ShaderMacro } from "./ShaderMacro";
import { ShaderMacroCollection } from "./ShaderMacroCollection";
import { ShaderPass } from "./ShaderPass";
import { ShaderProperty } from "./ShaderProperty";

/**
 * Shader for rendering.
 */
export class Shader {
  /** @internal */
  static readonly _compileMacros: ShaderMacroCollection = new ShaderMacroCollection();
  /** @internal */
  static readonly _shaderExtension: string[] = [
    "GL_EXT_shader_texture_lod",
    "GL_OES_standard_derivatives",
    "GL_EXT_draw_buffers"
  ];
  /** @internal */
  static _propertyIdMap: Record<number, ShaderProperty> = Object.create(null);

  private static _shaderMap: Record<string, Shader> = Object.create(null);
  private static _propertyNameMap: Record<string, ShaderProperty> = Object.create(null);
  private static _macroMaskMap: string[][] = [];
  private static _macroCounter: number = 0;
  private static _macroMap: Record<string, ShaderMacro> = Object.create(null);

  /**
   * Create a shader.
   * @param name - Name of the shader
   * @param vertexSource - Vertex source code
   * @param fragmentSource - Fragment source code
   * @returns Shader
   */
  static create(name: string, vertexSource: string, fragmentSource: string): Shader;

  /**
   * Create a shader.
   * @param name - Name of the shader
   * @param shaderPasses - Shader passes
   * @returns Shader
   */
  static create(name: string, shaderPasses: ShaderPass[]): Shader;

  static create(name: string, vertexSourceOrShaderPasses: string | ShaderPass[], fragmentSource?: string): Shader {
    const shaderMap = Shader._shaderMap;
    if (shaderMap[name]) {
      throw `Shader named "${name}" already exists.`;
    }
    return (shaderMap[name] = new Shader(name, vertexSourceOrShaderPasses, fragmentSource));
  }

  /**
   * Find a shader by name.
   * @param name - Name of the shader
   */
  static find(name: string): Shader {
    return Shader._shaderMap[name];
  }

  /**
   * Get shader macro by name.
   * @param name - Name of the shader macro
   * @returns Shader macro
   */
  static getMacroByName(name: string): ShaderMacro;

  /**
   * Get shader macro by name.
   * @param name - Name of the shader macro
   * @param value - Value of the shader macro
   * @returns Shader macro
   */
  static getMacroByName(name: string, value: string): ShaderMacro;

  static getMacroByName(name: string, value?: string): ShaderMacro {
    const key = value ? name + ` ` + value : name;
    let macro = Shader._macroMap[key];
    if (!macro) {
      const maskMap = Shader._macroMaskMap;
      const counter = Shader._macroCounter;
      const index = Math.floor(counter / 32);
      const bit = counter % 32;

      macro = new ShaderMacro(name, value, index, 1 << bit);
      Shader._macroMap[key] = macro;
      if (index == maskMap.length) {
        maskMap.length++;
        maskMap[index] = new Array<string>(32);
      }
      maskMap[index][bit] = key;
      Shader._macroCounter++;
    }
    return macro;
  }

  /**
   * Get shader property by name.
   * @param name - Name of the shader property
   * @returns Shader property
   */
  static getPropertyByName(name: string): ShaderProperty {
    const propertyNameMap = Shader._propertyNameMap;
    if (propertyNameMap[name] != null) {
      return propertyNameMap[name];
    } else {
      const property = new ShaderProperty(name);
      propertyNameMap[name] = property;
      Shader._propertyIdMap[property._uniqueId] = property;
      return property;
    }
  }

  /**
   * @internal
   */
  static _getShaderPropertyGroup(propertyName: string): ShaderDataGroup | null {
    const shaderProperty = Shader._propertyNameMap[propertyName];
    return shaderProperty?._group;
  }

  /**
   * @internal
   */
  static _getNamesByMacros(macros: ShaderMacroCollection, out: string[]): void {
    const maskMap = Shader._macroMaskMap;
    const mask = macros._mask;
    out.length = 0;
    for (let i = 0, n = macros._length; i < n; i++) {
      const subMaskMap = maskMap[i];
      const subMask = mask[i];
      const m = subMask < 0 ? 32 : Math.floor(Math.log2(subMask)) + 1; // if is negative must contain 1 << 31.
      for (let j = 0; j < m; j++) {
        if (subMask & (1 << j)) {
          out.push(subMaskMap[j]);
        }
      }
    }
  }

  /** The name of shader. */
  readonly name: string;

  /**
   *  Shader passes.
   */
  get passes(): ReadonlyArray<ShaderPass> {
    return this._passes;
  }

  private _passes: ShaderPass[] = [];

  private constructor(name: string, vertexSourceOrShaderPasses: string | ShaderPass[], fragmentSource?: string) {
    this.name = name;

    if (typeof vertexSourceOrShaderPasses === "string") {
      this._passes.push(new ShaderPass(vertexSourceOrShaderPasses, fragmentSource));
    } else {
      const passCount = vertexSourceOrShaderPasses.length;
      if (passCount < 1) {
        throw "Shader pass count must large than 0.";
      }
      for (let i = 0; i < passCount; i++) {
        this._passes.push(vertexSourceOrShaderPasses[i]);
      }
    }
  }

  /**
   * Compile shader variant by macro name list.
   *
   * @remarks
   * Usually a shader contains some macros,any combination of macros is called shader variant.
   *
   * @param engine - Engine to which the shader variant belongs
   * @param macros - Macro name list
   * @returns Is the compiled shader variant valid
   */
  compileVariant(engine: Engine, macros: string[]): boolean {
    const compileMacros = Shader._compileMacros;
    compileMacros.clear();
    for (let i = 0, n = macros.length; i < n; i++) {
      compileMacros.enable(Shader.getMacroByName(macros[i]));
    }

    let isValid = true;
    const passes = this._passes;
    for (let i = 0, n = passes.length; i < n; i++) {
      isValid &&= passes[i]._getShaderProgram(engine, compileMacros).isValid;
    }
    return isValid;
  }
}
