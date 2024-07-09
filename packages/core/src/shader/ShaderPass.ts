import { Shader } from ".";
import { Engine } from "../Engine";
import { PipelineStage } from "../RenderPipeline/enums/PipelineStage";
import { GLCapabilityType } from "../base/Constant";
import { ShaderFactory } from "../shaderlib";
import { ShaderMacro } from "./ShaderMacro";
import { ShaderMacroCollection } from "./ShaderMacroCollection";
import { ShaderPart } from "./ShaderPart";
import { ShaderProgram } from "./ShaderProgram";
import { ShaderProgramPool } from "./ShaderProgramPool";
import { ShaderProperty } from "./ShaderProperty";
import { ShaderType } from "./enums/ShaderType";
import { RenderState } from "./state/RenderState";

/**
 * Shader pass containing vertex and fragment source.
 */
export class ShaderPass extends ShaderPart {
  private static _shaderPassCounter: number = 0;

  /** @internal */
  _shaderPassId: number = 0;

  /**
   * @internal
   * @remarks If undefined, the blend state of the material will be used ( deprecate mode ).
   */
  _renderState: RenderState;
  /** @internal */
  _renderStateDataMap: Record<number, ShaderProperty> = {};
  /** @internal */
  _shaderProgramPools: ShaderProgramPool[] = [];

  private _vertexSource: string;
  private _fragmentSource: string;

  private readonly _type: ShaderType;
  private readonly _shaderLabSource: string;
  private readonly _vertexEntry: string;
  private readonly _fragmentEntry: string;

  /**
   * @internal
   */
  constructor(
    name: string,
    shaderLabSource: string,
    vertexEntry: string,
    fragmentEntry: string,
    tags?: Record<string, number | string | boolean>
  );

  /**
   * Create a shader pass.
   * @param name - Shader pass name
   * @param vertexSource - Vertex shader source
   * @param fragmentSource - Fragment shader source
   * @param tags - Tags
   */
  constructor(
    name: string,
    vertexSource: string,
    fragmentSource: string,
    tags?: Record<string, number | string | boolean>
  );

  /**
   * Create a shader pass.
   * @param vertexSource - Vertex shader source
   * @param fragmentSource - Fragment shader source
   * @param tags - Tags
   */
  constructor(vertexSource: string, fragmentSource: string, tags?: Record<string, number | string | boolean>);

  constructor(
    nameOrVertexSource: string,
    vertexSourceOrFragmentSourceOrCode?: string | Record<string, number | string | boolean>,
    fragmentSourceOrTagsOrVertexEntry?: string | Record<string, number | string | boolean>,
    fragmentEntryOrTags?: string | Record<string, number | string | boolean>,
    tags?: Record<string, number | string | boolean>
  ) {
    super();
    this._shaderPassId = ShaderPass._shaderPassCounter++;
    this._type = ShaderType.Canonical;

    if (typeof fragmentEntryOrTags === "string") {
      this._name = nameOrVertexSource;
      this._shaderLabSource = vertexSourceOrFragmentSourceOrCode as string;
      this._vertexEntry = fragmentSourceOrTagsOrVertexEntry as string;
      this._fragmentEntry = fragmentEntryOrTags;
      tags = tags ?? {
        pipelineStage: PipelineStage.Forward
      };
      this._type = ShaderType.ShaderLab;
    } else if (typeof fragmentSourceOrTagsOrVertexEntry === "string") {
      this._name = nameOrVertexSource;
      this._vertexSource = vertexSourceOrFragmentSourceOrCode as string;
      this._fragmentSource = fragmentSourceOrTagsOrVertexEntry;
      tags = fragmentEntryOrTags ?? {
        pipelineStage: PipelineStage.Forward
      };
    } else {
      this._name = "Default";
      this._vertexSource = nameOrVertexSource;
      this._fragmentSource = vertexSourceOrFragmentSourceOrCode as string;
      tags = fragmentSourceOrTagsOrVertexEntry ?? {
        pipelineStage: PipelineStage.Forward
      };
    }
    for (const key in tags) {
      this.setTag(key, tags[key]);
    }
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

    if (this._type === ShaderType.Canonical) {
      return this._getCanonicalShaderProgram(engine, macroCollection);
    } else {
      this._compile(engine, macroCollection, this._vertexEntry, this._fragmentEntry);
      shaderProgram = new ShaderProgram(engine, this._vertexSource, this._fragmentSource);

      shaderProgramPool.cache(shaderProgram);
      return shaderProgram;
    }
  }

  /**
   * @internal
   */
  _destroy(): void {
    const shaderProgramPools = this._shaderProgramPools;
    for (let i = 0, n = shaderProgramPools.length; i < n; i++) {
      shaderProgramPools[i]._destroy();
    }
    shaderProgramPools.length = 0;
  }

  /**
   * Shader Lab compilation
   */
  private _compile(engine: Engine, macroCollection: ShaderMacroCollection, vertexEntry: string, fragmentEntry: string) {
    const isWebGL2: boolean = engine._hardwareRenderer.isWebGL2;
    const macroNameList = [];
    ShaderMacro._getNamesByMacros(macroCollection, macroNameList);
    if (engine._hardwareRenderer.canIUse(GLCapabilityType.shaderTextureLod)) {
      macroNameList.push("HAS_TEX_LOD");
    }
    if (engine._hardwareRenderer.canIUse(GLCapabilityType.standardDerivatives)) {
      macroNameList.push("HAS_DERIVATIVES");
    }
    if (isWebGL2) {
      macroNameList.push("GRAPHICS_API_WEBGL2");
    } else {
      macroNameList.push("GRAPHICS_API_WEBGL1");
    }

    const { vertexSource, fragmentSource } = Shader._shaderLab._parseShaderPass(
      this._shaderLabSource,
      vertexEntry,
      fragmentEntry,
      macroNameList,
      engine._hardwareRenderer.isWebGL2 ? 1 /** GLES 300 */ : 0 /** GLES 100 */
    );

    this._vertexSource = vertexSource;
    this._fragmentSource = fragmentSource;
  }

  // TODO: remove it after migrate all shader to `ShaderLab`.
  private _getCanonicalShaderProgram(engine: Engine, macroCollection: ShaderMacroCollection): ShaderProgram {
    const isWebGL2: boolean = engine._hardwareRenderer.isWebGL2;
    const macroNameList = [];
    ShaderMacro._getNamesByMacros(macroCollection, macroNameList);
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

    let vertexSource =
      ` ${versionStr}
        ${graphicAPI}
        ${macroNameStr}
      ` + ShaderFactory.parseIncludes(this._vertexSource);
    let fragmentSource =
      ` ${versionStr}
        ${graphicAPI}
        ${isWebGL2 ? "" : ShaderFactory._shaderExtension}
        ${precisionStr}
        ${macroNameStr}
      ` + ShaderFactory.parseIncludes(this._fragmentSource);

    if (isWebGL2) {
      vertexSource = ShaderFactory.convertTo300(vertexSource);
      fragmentSource = ShaderFactory.convertTo300(fragmentSource, true);
    }

    const shaderProgram = new ShaderProgram(engine, vertexSource, fragmentSource);

    const shaderProgramPool = engine._getShaderProgramPool(this);
    shaderProgramPool.cache(shaderProgram);
    return shaderProgram;
  }
}
