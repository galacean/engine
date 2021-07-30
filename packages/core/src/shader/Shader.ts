import { Engine } from "../Engine";
import { ShaderFactory } from "../shaderlib/ShaderFactory";
import { ShaderDataGroup } from "./enums/ShaderDataGroup";
import { ShaderMacro } from "./ShaderMacro";
import { ShaderMacroCollection } from "./ShaderMacroCollection";
import { ShaderProgram } from "./ShaderProgram";
import { ShaderProperty } from "./ShaderProperty";

/**
 * Shader containing vertex and fragment source.
 */
export class Shader {
  /** @internal */
  static readonly _compileMacros: ShaderMacroCollection = new ShaderMacroCollection();

  private static _shaderCounter: number = 0;
  private static _shaderMap: Record<string, Shader> = Object.create(null);
  private static _propertyNameMap: Record<string, ShaderProperty> = Object.create(null);
  private static _macroMaskMap: string[][] = [];
  private static _macroCounter: number = 0;
  private static _macroMap: Record<string, ShaderMacro> = Object.create(null);
  private static _shaderExtension = ["GL_EXT_shader_texture_lod", "GL_OES_standard_derivatives", "GL_EXT_draw_buffers"];

  /**
   * Create a shader.
   * @param name - Name of the shader
   * @param vertexSource - Vertex source code
   * @param fragmentSource - Fragment source code
   */
  static create(name: string, vertexSource: string, fragmentSource: string): Shader {
    const shaderMap = Shader._shaderMap;
    if (shaderMap[name]) {
      throw `Shader named "${name}" already exists.`;
    }
    return (shaderMap[name] = new Shader(name, vertexSource, fragmentSource));
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
  static getMacroByName(name: string): ShaderMacro {
    let macro = Shader._macroMap[name];
    if (!macro) {
      const maskMap = Shader._macroMaskMap;
      const counter = Shader._macroCounter;
      const index = Math.floor(counter / 32);
      const bit = counter % 32;
      macro = new ShaderMacro(name, index, 1 << bit);
      Shader._macroMap[name] = macro;
      if (index == maskMap.length) {
        maskMap.length++;
        maskMap[index] = new Array<string>(32);
      }
      maskMap[index][bit] = name;
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

  private static _getNamesByMacros(macros: ShaderMacroCollection, out: string[]): void {
    const maskMap = Shader._macroMaskMap;
    const mask = macros._mask;
    out.length = 0;
    for (let i = 0, n = macros._length; i < n; i++) {
      const subMaskMap = maskMap[i];
      const subMask = mask[i];
      const n = subMask < 0 ? 32 : Math.floor(Math.log2(subMask)) + 1; // if is negative must contain 1 << 31.
      for (let j = 0; j < n; j++) {
        if (subMask & (1 << j)) {
          out.push(subMaskMap[j]);
        }
      }
    }
  }

  /** The name of shader. */
  readonly name: string;

  /** @internal */
  _shaderId: number = 0;

  private _vertexSource: string;
  private _fragmentSource: string;

  private constructor(name: string, vertexSource: string, fragmentSource: string) {
    this._shaderId = Shader._shaderCounter++;
    this.name = name;
    this._vertexSource = vertexSource;
    this._fragmentSource = fragmentSource;
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
    return this._getShaderProgram(engine, compileMacros).isValid;
  }

  /**
   * @internal
   */
  _getShaderProgram(engine: Engine, macroCollection: ShaderMacroCollection): ShaderProgram {
    const shaderProgramPool = engine._getShaderProgramPool(this);
    let shaderProgram = shaderProgramPool.get(macroCollection);
    if (shaderProgram) {
      return shaderProgram;
    }

    const isWebGL2: boolean = engine._hardwareRenderer.isWebGL2;
    const macroNameList = [];
    Shader._getNamesByMacros(macroCollection, macroNameList);
    const macroNameStr = ShaderFactory.parseCustomMacros(macroNameList);
    const versionStr = isWebGL2 ? "#version 300 es" : "#version 100";
    const precisionStr = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      precision highp int;
      #define O3_VERTEX_PRECISION highp
      #define O3_FRAGMENT_PRECISION highp
    #else
      precision mediump float;
      precision mediump int;
      #define O3_VERTEX_PRECISION mediump
      #define O3_FRAGMENT_PRECISION mediump
    #endif
    `;

    let vertexSource = ShaderFactory.parseIncludes(
      ` ${versionStr}
        ${precisionStr}
        ${macroNameStr}
        ` + this._vertexSource
    );

    let fragmentSource = ShaderFactory.parseIncludes(
      ` ${versionStr}
        ${isWebGL2 ? "" : ShaderFactory.parseExtension(Shader._shaderExtension)}
        ${precisionStr}
        ${macroNameStr}
      ` + this._fragmentSource
    );

    if (isWebGL2) {
      vertexSource = ShaderFactory.convertTo300(vertexSource);
      fragmentSource = ShaderFactory.convertTo300(fragmentSource, true);
    }

    shaderProgram = new ShaderProgram(engine, vertexSource, fragmentSource);

    shaderProgramPool.cache(shaderProgram);
    return shaderProgram;
  }
}
