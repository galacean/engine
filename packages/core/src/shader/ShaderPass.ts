import { Engine } from "../Engine";
import { PipelineStage } from "../RenderPipeline/enums/PipelineStage";
import { GLCapabilityType } from "../base/Constant";
import { ShaderFactory } from "../shaderlib/ShaderFactory";
import { ShaderMacro } from "./ShaderMacro";
import { ShaderMacroCollection } from "./ShaderMacroCollection";
import { ShaderPart } from "./ShaderPart";
import { ShaderProgram } from "./ShaderProgram";
import { ShaderProperty } from "./ShaderProperty";
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

  private _vertexSource: string;
  private _fragmentSource: string;

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

  /**
   * Create a shader pass.
   * @param vertexSource - Vertex shader source
   * @param fragmentSource - Fragment shader source
   * @param tags - Tags
   */
  constructor(
    nameOrVertexSource: string,
    vertexSourceOrFragmentSource: string,
    fragmentSourceOrTags: string | Record<string, number | string | boolean>,
    tags?: Record<string, number | string | boolean>
  ) {
    super();
    this._shaderPassId = ShaderPass._shaderPassCounter++;

    if (typeof fragmentSourceOrTags === "string") {
      this.name = nameOrVertexSource;
      this._vertexSource = vertexSourceOrFragmentSource;
      this._fragmentSource = fragmentSourceOrTags;
      tags = tags ?? {
        pipelineStage: PipelineStage.Forward
      };
    } else {
      this.name = "Default";
      this._vertexSource = nameOrVertexSource;
      this._fragmentSource = vertexSourceOrFragmentSource;
      tags = fragmentSourceOrTags ?? {
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

    shaderProgram = new ShaderProgram(engine, vertexSource, fragmentSource);

    shaderProgramPool.cache(shaderProgram);
    return shaderProgram;
  }
}
