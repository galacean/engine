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
import { ShaderLanguage } from "./enums/ShaderLanguage";
import { evaluateSegmentTree } from "./MacroSegmentEvaluator";
import { RenderState } from "./state/RenderState";

const precisionStr = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      precision highp int;
    #else
      precision mediump float;
      precision mediump int;
    #endif
    `;

/**
 * Shader pass containing vertex and fragment source.
 */
export class ShaderPass extends ShaderPart {
  /** @internal */
  static _shaderPassCounter: number = 0;
  /** @internal */
  static _shaderRootPath = "shaders://root/";

  /**
   * @internal
   */
  _platformTarget: ShaderLanguage | undefined;

  /** @internal - Whether vertex/fragment sources contain runtime macro branches. Used by precompiled path to skip _parseMacros. */
  _vertexHasMacros: boolean = true;
  /** @internal */
  _fragmentHasMacros: boolean = true;
  /** @internal - Pre-parsed conditional segment tree for vertex. When set, used instead of _parseMacros for fast evaluation. */
  _vertexSegments: any[] | undefined;
  /** @internal */
  _fragmentSegments: any[] | undefined;

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
    const shaderProgramPool = engine._getShaderProgramPool(this._shaderPassId, this._shaderProgramPools);
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

  private static _buildMacroMap(macroList: ShaderMacro[]): Map<string, string> {
    const map = new Map<string, string>();
    for (let i = 0, n = macroList.length; i < n; i++) {
      const macro = macroList[i];
      map.set(macro.name, macro.value ?? "");
    }
    return map;
  }

  private _getCanonicalShaderProgram(engine: Engine, macroCollection: ShaderMacroCollection): ShaderProgram {
    if (this._platformTarget != undefined) {
      return this._getShaderLabProgram(engine, macroCollection);
    }

    const { vertexSource, fragmentSource } = ShaderFactory.compilePlatformSource(
      engine,
      macroCollection,
      this._vertexSource,
      this._fragmentSource
    );

    return new ShaderProgram(engine, vertexSource, fragmentSource);
  }

  private _getShaderLabProgram(engine: Engine, macroCollection: ShaderMacroCollection): ShaderProgram {
    const isWebGL2: boolean = engine._hardwareRenderer.isWebGL2;
    const shaderMacroList = new Array<ShaderMacro>();
    ShaderMacro._getMacrosElements(macroCollection, shaderMacroList);
    shaderMacroList.push(ShaderMacro.getByName(isWebGL2 ? "GRAPHICS_API_WEBGL2" : "GRAPHICS_API_WEBGL1"));
    if (engine._hardwareRenderer.canIUse(GLCapabilityType.shaderTextureLod)) {
      shaderMacroList.push(ShaderMacro.getByName("HAS_TEX_LOD"));
    }
    if (engine._hardwareRenderer.canIUse(GLCapabilityType.standardDerivatives)) {
      shaderMacroList.push(ShaderMacro.getByName("HAS_DERIVATIVES"));
    }

    let noIncludeVertex = ShaderFactory.parseIncludes(this._vertexSource);
    let noIncludeFrag = ShaderFactory.parseIncludes(this._fragmentSource);

    // Parse macros when use shaderlab
    if (this._platformTarget != undefined) {
      if (this._vertexHasMacros) {
        if (this._vertexSegments) {
          const macroMap = ShaderPass._buildMacroMap(shaderMacroList);
          noIncludeVertex = evaluateSegmentTree(this._vertexSegments, macroMap);
        } else {
          noIncludeVertex = Shader._shaderLab._parseMacros(noIncludeVertex, shaderMacroList);
        }
      }
      if (this._fragmentHasMacros) {
        if (this._fragmentSegments) {
          const macroMap = ShaderPass._buildMacroMap(shaderMacroList);
          noIncludeFrag = evaluateSegmentTree(this._fragmentSegments, macroMap);
        } else {
          noIncludeFrag = Shader._shaderLab._parseMacros(noIncludeFrag, shaderMacroList);
        }
      }
    } else {
      const macroNameStr = ShaderFactory.parseCustomMacros(shaderMacroList);
      noIncludeVertex = macroNameStr + noIncludeVertex;
      noIncludeFrag = macroNameStr + noIncludeFrag;
    }

    if (isWebGL2 && this._platformTarget === ShaderLanguage.GLSLES100) {
      noIncludeVertex = ShaderFactory.convertTo300(noIncludeVertex);
      noIncludeFrag = ShaderFactory.convertTo300(noIncludeFrag, true);
    }

    const versionStr = isWebGL2 ? "#version 300 es" : "#version 100";

    const vertexSource = ` ${versionStr}
        ${noIncludeVertex}
      `;
    const fragmentSource = ` ${versionStr}
        ${isWebGL2 ? "" : ShaderFactory._shaderExtension}
        ${precisionStr}
        ${noIncludeFrag}
      `;

    return new ShaderProgram(engine, vertexSource, fragmentSource);
  }
}
