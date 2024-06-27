import { Shader } from ".";
import { Engine } from "../Engine";
import { PipelineStage } from "../RenderPipeline/enums/PipelineStage";
import { GLCapabilityType } from "../base/Constant";
import { ShaderFactory, ShaderLib } from "../shaderlib";
import { ShaderMacro } from "./ShaderMacro";
import { ShaderMacroCollection } from "./ShaderMacroCollection";
import { ShaderPart } from "./ShaderPart";
import { ShaderProgram } from "./ShaderProgram";
import { ShaderProgramPool } from "./ShaderProgramPool";
import { ShaderProperty } from "./ShaderProperty";
import { RenderStateElementKey } from "./enums/RenderStateElementKey";
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
  private _shaderLabSource: string;
  private _type: ShaderType;

  /**
   * Create a shader pass.
   * @param shaderLabSource - Shader Lab source
   */
  constructor(shaderLabSource: string);

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
    nameOrVertexSourceOrShaderLabSource: string,
    vertexSourceOrFragmentSource?: string,
    fragmentSourceOrTags?: string | Record<string, number | string | boolean>,
    tags?: Record<string, number | string | boolean>
  ) {
    super();
    this._shaderPassId = ShaderPass._shaderPassCounter++;
    this._type = ShaderType.Canonical;

    if (vertexSourceOrFragmentSource == undefined) {
      this._type = ShaderType.ShaderLab;
      this._name = "Default";
      this._shaderLabSource = nameOrVertexSourceOrShaderLabSource;
      tags = {
        pipelineStage: PipelineStage.Forward
      };
    } else if (typeof fragmentSourceOrTags === "string") {
      this._name = nameOrVertexSourceOrShaderLabSource;
      this._vertexSource = vertexSourceOrFragmentSource;
      this._fragmentSource = fragmentSourceOrTags;
      tags = tags ?? {
        pipelineStage: PipelineStage.Forward
      };
    } else {
      this._name = "Default";
      this._vertexSource = nameOrVertexSourceOrShaderLabSource;
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
  _isCompiled() {
    return this._fragmentSource != undefined;
  }

  /**
   * @internal
   * Shader Lab compilation
   */
  _compile(engine: Engine, macroCollection: ShaderMacroCollection) {
    const macroNameList = [];
    ShaderMacro._getNamesByMacros(macroCollection, macroNameList);
    if (engine._hardwareRenderer.canIUse(GLCapabilityType.shaderTextureLod)) {
      macroNameList.push("HAS_TEX_LOD");
    }
    if (engine._hardwareRenderer.canIUse(GLCapabilityType.standardDerivatives)) {
      macroNameList.push("HAS_DERIVATIVES");
    }

    const { vertexSource, fragmentSource, tags, renderStates } = Shader._shaderLab.parseShaderPass(
      this._shaderLabSource,
      macroNameList,
      engine._hardwareRenderer.isWebGL2 ? 1 /** GLES 300 */ : 0 /** GLES 100 */
    );

    this._vertexSource = vertexSource;
    this._fragmentSource = fragmentSource;
    if (tags) {
      for (const key in tags) this.setTag(key, tags[key]);
    }

    const passRenderStates = new RenderState();
    this._renderState = passRenderStates;

    // Parse const render state
    const constRenderStateInfo = renderStates[0];
    for (let k in constRenderStateInfo) {
      Shader._applyConstRenderStates(passRenderStates, <RenderStateElementKey>parseInt(k), constRenderStateInfo[k]);
    }

    // Parse variable render state
    const variableRenderStateInfo = renderStates[1];
    const renderStateDataMap = {} as Record<number, ShaderProperty>;
    for (let k in variableRenderStateInfo) {
      renderStateDataMap[k] = ShaderProperty.getByName(variableRenderStateInfo[k]);
    }
    this._renderStateDataMap = renderStateDataMap;
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
    }

    shaderProgram = new ShaderProgram(engine, this._vertexSource, this._fragmentSource);

    shaderProgramPool.cache(shaderProgram);
    return shaderProgram;
  }

  /**
   * @internal
   */
  _getCanonicalShaderProgram(engine: Engine, macroCollection: ShaderMacroCollection): ShaderProgram {
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
}
