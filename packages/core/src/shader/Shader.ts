import { Engine } from "../Engine";
import { ShaderMacro } from "./ShaderMacro";
import { ShaderMacroCollection } from "./ShaderMacroCollection";
import { ShaderPass } from "./ShaderPass";
import { ShaderProperty } from "./ShaderProperty";
import { SubShader } from "./SubShader";

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

  private static _shaderMap: Record<string, Shader> = Object.create(null);

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

  /**
   * Create a shader.
   * @param name - Name of the shader
   * @param subShaders - Sub shaders
   * @returns Shader
   */
  static create(name: string, subShaders: SubShader[]): Shader;

  static create(
    name: string,
    vertexSourceOrShaderPassesOrSubShaders: SubShader[] | ShaderPass[] | string,
    fragmentSource?: string
  ): Shader {
    const shaderMap = Shader._shaderMap;
    if (shaderMap[name]) {
      throw `Shader named "${name}" already exists.`;
    }
    let shader: Shader;
    if (typeof vertexSourceOrShaderPassesOrSubShaders === "string") {
      const shaderPass = new ShaderPass(vertexSourceOrShaderPassesOrSubShaders, fragmentSource);
      shader = new Shader(name, [new SubShader("Default", [shaderPass])]);
    } else {
      if (vertexSourceOrShaderPassesOrSubShaders.length > 0) {
        if (vertexSourceOrShaderPassesOrSubShaders[0].constructor === ShaderPass) {
          shader = new Shader(name, [new SubShader("Default", <ShaderPass[]>vertexSourceOrShaderPassesOrSubShaders)]);
        } else {
          shader = new Shader(name, <SubShader[]>vertexSourceOrShaderPassesOrSubShaders.slice());
        }
      } else {
        throw "SubShader or ShaderPass count must large than 0.";
      }
    }
    shaderMap[name] = shader;
    return shader;
  }

  /**
   * Find a shader by name.
   * @param name - Name of the shader
   */
  static find(name: string): Shader {
    return Shader._shaderMap[name];
  }

  private _subShaders: SubShader[];

  /**
   * Sub shaders of the shader.
   */
  get subShaders(): ReadonlyArray<SubShader> {
    return this._subShaders;
  }

  private constructor(public readonly name: string, subShaders: SubShader[]) {
    this.name = name;
    this._subShaders = subShaders;
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
      compileMacros.enable(ShaderMacro.getByName(macros[i]));
    }

    const subShaders = this._subShaders;
    for (let i = 0, n = subShaders.length; i < n; i++) {
      let isValid: boolean;
      const { passes } = subShaders[i];
      for (let j = 0, m = passes.length; j < m; j++) {
        if (isValid === undefined) {
          isValid = passes[j]._getShaderProgram(engine, compileMacros).isValid;
        } else {
          isValid &&= passes[j]._getShaderProgram(engine, compileMacros).isValid;
        }
      }
      if (isValid) return true;
    }
    return false;
  }

  /**
   * @deprecated Please use `ShaderMacro.getByName` instead
   *
   * Get shader macro by name.
   * @param name - Name of the shader macro
   * @returns Shader macro
   */
  static getMacroByName(name: string): ShaderMacro;

  /**
   * @deprecated Please use `ShaderMacro.getByName` instead
   *
   * Get shader macro by name.
   * @param name - Name of the shader macro
   * @param value - Value of the shader macro
   * @returns Shader macro
   */
  static getMacroByName(name: string, value: string): ShaderMacro;

  static getMacroByName(name: string, value?: string): ShaderMacro {
    return ShaderMacro.getByName(name, value);
  }

  /**
   * @deprecated Please use `ShaderProperty.getByName` instead
   *
   * Get shader property by name.
   * @param name - Name of the shader property
   * @returns Shader property
   */
  static getPropertyByName(name: string): ShaderProperty {
    return ShaderProperty.getByName(name);
  }
}
