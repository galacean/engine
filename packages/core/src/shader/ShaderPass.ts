import { GLCapabilityType } from "../base/Constant";
import { Engine } from "../Engine";
import { ShaderFactory } from "../shaderlib/ShaderFactory";
import { Shader } from "./Shader";
import { ShaderMacroCollection } from "./ShaderMacroCollection";
import { ShaderProgram } from "./ShaderProgram";
import { ShaderTag } from "./ShaderTag";

/**
 * Shader pass containing vertex and fragment source.
 */
export class ShaderPass {
  private static _shaderPassCounter: number = 0;

  /** @internal */
  _shaderPassId: number = 0;

  private _vertexSource: string;
  private _fragmentSource: string;
  private _tagsMap: Record<number, ShaderTag> = Object.create(null);

  /**
   * Create a shader pass.
   * @param vertexSource - Vertex shader source
   * @param fragmentSource - Fragment shader source
   * @param tags - Tags
   */
  constructor(vertexSource: string, fragmentSource: string, tags?: Record<string, string>);

  /**
   * Create a shader pass.
   * @param vertexSource - Vertex shader source
   * @param fragmentSource - Fragment shader source
   * @param tags - Tags
   */
  constructor(vertexSource: string, fragmentSource: string, tags?: Record<string, string>);

  constructor(vertexSource: string, fragmentSource: string, tags?: Record<string, string>) {
    this._shaderPassId = ShaderPass._shaderPassCounter++;

    this._vertexSource = vertexSource;
    this._fragmentSource = fragmentSource;

    if (tags) {
      for (const key in tags) {
        this.addTag(key, tags[key]);
      }
    } else {
      this.addTag("PipelineStage", "Forward");
    }
  }

  /**
   * Add a tag.
   * @param keyName - Name of the tag key
   * @param valueName - Name of the tag value
   */
  addTag(keyName: string, valueName: string): void;
  /**
   * Add a tag.
   * @param key - Key of the tag
   * @param value - Value of the tag
   */
  addTag(key: ShaderTag, value: ShaderTag): void;

  addTag(keyOrKeyName: ShaderTag | string, valueOrValueName: ShaderTag | string): void {
    const key = typeof keyOrKeyName === "string" ? ShaderTag.getByName(keyOrKeyName) : keyOrKeyName;
    const value = typeof valueOrValueName === "string" ? ShaderTag.getByName(valueOrValueName) : valueOrValueName;
    const tags = this._tagsMap;

    if (tags[key._uniqueId]) {
      throw `Tag named "${key.name}" already exists.`;
    }
    tags[key._uniqueId] = value;
  }

  /**
   * Get a tag value.
   * @param key - Key of the tag
   * @returns Value of the tag
   */
  getTagValue(key: ShaderTag): ShaderTag {
    return this._tagsMap[key._uniqueId];
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
    const graphicAPI = isWebGL2 ? "#define GRAPHICS_API_WEBGL2" : "#define GRAPHICS_API_WEBGL1";
    let precisionStr = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      precision highp int;
    #else
      precision mediump float;
      precision mediump int;
    #endif
    `;

    if (engine._hardwareRenderer.canIUse(GLCapabilityType.shaderTextureLod)) {
      precisionStr += "#define HAS_TEX_LOD\n";
    }
    if (engine._hardwareRenderer.canIUse(GLCapabilityType.standardDerivatives)) {
      precisionStr += "#define HAS_DERIVATIVES\n";
    }

    let vertexSource = ShaderFactory.parseIncludes(
      ` ${versionStr}
        ${graphicAPI}
        ${macroNameStr}
      ` + this._vertexSource
    );

    let fragmentSource = ShaderFactory.parseIncludes(
      ` ${versionStr}
        ${graphicAPI}
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
