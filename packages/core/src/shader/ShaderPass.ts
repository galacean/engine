import { Engine } from "../Engine";
import { PipelineStage } from "../RenderPipeline/enums/PipelineStage";
import { GLCapabilityType } from "../base/Constant";
import { ShaderFactory } from "../shaderlib";
import { Shader } from "./Shader";
import { ShaderMacro } from "./ShaderMacro";
import { ShaderMacroCollection } from "./ShaderMacroCollection";
import { ShaderPart } from "./ShaderPart";
import { ShaderProgram } from "./ShaderProgram";
import { ShaderProgramPool } from "./ShaderProgramPool";
import { ShaderProperty } from "./ShaderProperty";
import { RenderState } from "./state/RenderState";

/**
 * Shader pass containing vertex and fragment source.
 */
export class ShaderPass extends ShaderPart {
  private static _shaderPassCounter: number = 0;
  /** @internal */
  static _shaderRootPath = "shaders://root/";

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
    vertexSourceOrFragmentSource: string,
    fragmentSourceOrTags?: string | Record<string, number | string | boolean>,
    tags?: Record<string, number | string | boolean>
  ) {
    super();
    this._shaderPassId = ShaderPass._shaderPassCounter++;

    if (typeof fragmentSourceOrTags === "string") {
      this._name = nameOrVertexSource;
      this._vertexSource = vertexSourceOrFragmentSource;
      this._fragmentSource = fragmentSourceOrTags;
      tags = {
        pipelineStage: PipelineStage.Forward,
        ...tags
      };
    } else {
      this._name = "Default";
      this._vertexSource = nameOrVertexSource;
      this._fragmentSource = vertexSourceOrFragmentSource;
      tags = {
        pipelineStage: PipelineStage.Forward,
        ...fragmentSourceOrTags
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

    shaderProgram = this._getCanonicalShaderProgram(engine, macroCollection);

    shaderProgramPool.cache(shaderProgram);
    return shaderProgram;
  }

  /**
   * @internal
   */
  _destroy(): void {
    const shaderProgramPools = this._shaderProgramPools;
    for (let i = 0, n = shaderProgramPools.length; i < n; i++) {
      const shaderProgramPool = shaderProgramPools[i];
      shaderProgramPool._destroy();
      delete shaderProgramPool.engine._shaderProgramPools[this._shaderPassId];
    }
    // Clear array storing multiple engine shader program pools
    shaderProgramPools.length = 0;
  }

  private _getCanonicalShaderProgram(engine: Engine, macroCollection: ShaderMacroCollection): ShaderProgram {
    const isWebGL2: boolean = engine._hardwareRenderer.isWebGL2;
    const shaderMacroList = new Array<ShaderMacro>();
    ShaderMacro._getMacrosElements(macroCollection, shaderMacroList);
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

    const parsedVertex = Shader._shaderLab._parseDirectives(this._vertexSource, shaderMacroList);
    const parsedFrag = Shader._shaderLab._parseDirectives(this._fragmentSource, shaderMacroList);

    let vertexSource =
      ` ${versionStr}
        ${graphicAPI}
      ` + ShaderFactory.parseIncludes(parsedVertex);
    let fragmentSource =
      ` ${versionStr}
        ${graphicAPI}
        ${isWebGL2 ? "" : ShaderFactory._shaderExtension}
        ${precisionStr}
      ` + ShaderFactory.parseIncludes(parsedFrag);

    if (isWebGL2) {
      vertexSource = ShaderFactory.convertTo300(vertexSource);
      fragmentSource = ShaderFactory.convertTo300(fragmentSource, true);
    }

    const shaderProgram = new ShaderProgram(engine, vertexSource, fragmentSource);

    return shaderProgram;
  }
}
