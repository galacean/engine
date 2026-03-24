import type { ShaderInstruction } from "@galacean/engine-design";
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
import { ShaderLanguage } from "./enums/ShaderLanguage";
import { ShaderMacroProcessor } from "./ShaderMacroProcessor";
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

  /** @internal - Flat instruction array for vertex shader. */
  _vertexShaderInstructions?: ShaderInstruction[];
  /** @internal */
  _fragmentShaderInstructions?: ShaderInstruction[];

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

  private _vertexSource?: string;
  private _fragmentSource?: string;

  private static _shaderMacroList: ShaderMacro[] = [];
  private static _macroMap: Map<string, string> = new Map();

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
   * Create a shader pass from precompiled instructions.
   * @param name - Shader pass name
   * @param vertexShaderInstructions - Precompiled vertex instruction array
   * @param fragmentShaderInstructions - Precompiled fragment instruction array
   * @param platformTarget - Target shader language
   * @param tags - Tags
   */
  constructor(
    name: string,
    vertexShaderInstructions: ShaderInstruction[],
    fragmentShaderInstructions: ShaderInstruction[],
    platformTarget: ShaderLanguage,
    tags?: Record<string, number | string | boolean>
  );

  constructor(
    nameOrVertexSource: string,
    vertexSourceOrFragmentSourceOrInstructions: string | ShaderInstruction[],
    fragmentSourceOrTags?: string | ShaderInstruction[] | Record<string, number | string | boolean>,
    tagsOrPlatformTarget?: Record<string, number | string | boolean> | ShaderLanguage,
    tags?: Record<string, number | string | boolean>
  ) {
    super();
    this._shaderPassId = ShaderPass._shaderPassCounter++;

    if (Array.isArray(vertexSourceOrFragmentSourceOrInstructions)) {
      // Instructions overload: (name, vertexInst, fragInst, platformTarget, tags?)
      this._name = nameOrVertexSource;
      this._vertexShaderInstructions = vertexSourceOrFragmentSourceOrInstructions;
      this._fragmentShaderInstructions = fragmentSourceOrTags as ShaderInstruction[];
      this._platformTarget = tagsOrPlatformTarget as ShaderLanguage;
      tags = { pipelineStage: PipelineStage.Forward, ...tags };
    } else if (typeof fragmentSourceOrTags === "string") {
      // Named overload: (name, vertexSource, fragmentSource, tags?)
      this._name = nameOrVertexSource;
      this._vertexSource = vertexSourceOrFragmentSourceOrInstructions;
      this._fragmentSource = fragmentSourceOrTags;
      tags = {
        pipelineStage: PipelineStage.Forward,
        ...(tagsOrPlatformTarget as Record<string, number | string | boolean>)
      };
    } else {
      // Unnamed overload: (vertexSource, fragmentSource, tags?)
      this._name = "Default";
      this._vertexSource = nameOrVertexSource;
      this._fragmentSource = vertexSourceOrFragmentSourceOrInstructions as string;
      tags = {
        pipelineStage: PipelineStage.Forward,
        ...(fragmentSourceOrTags as Record<string, number | string | boolean>)
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

  private _getCanonicalShaderProgram(engine: Engine, macroCollection: ShaderMacroCollection): ShaderProgram {
    const { vertexSource, fragmentSource } =
      this._platformTarget != undefined
        ? this._compileShaderLabSource(engine, macroCollection)
        : this._compilePlatformSource(engine, macroCollection);

    return new ShaderProgram(engine, vertexSource, fragmentSource);
  }

  /**
   * @internal
   * Compile raw GLSL source — CPU work only (no GPU).
   * Wraps `ShaderFactory.compilePlatformSource()`.
   */
  _compilePlatformSource(
    engine: Engine,
    macroCollection: ShaderMacroCollection
  ): { vertexSource: string; fragmentSource: string } {
    return ShaderFactory.compilePlatformSource(engine, macroCollection, this._vertexSource, this._fragmentSource);
  }

  /**
   * @internal
   * Compile ShaderLab source from instructions — CPU work only (no GPU).
   * Mirrors `ShaderFactory.compilePlatformSource()` for the instructions path.
   */
  _compileShaderLabSource(
    engine: Engine,
    macroCollection: ShaderMacroCollection
  ): { vertexSource: string; fragmentSource: string } {
    const isWebGL2: boolean = engine._hardwareRenderer.isWebGL2;
    const shaderMacroList = ShaderPass._shaderMacroList;
    shaderMacroList.length = 0;
    ShaderMacro._getMacrosElements(macroCollection, shaderMacroList);
    shaderMacroList.push(ShaderMacro.getByName(isWebGL2 ? "GRAPHICS_API_WEBGL2" : "GRAPHICS_API_WEBGL1"));
    if (engine._hardwareRenderer.canIUse(GLCapabilityType.shaderTextureLod)) {
      shaderMacroList.push(ShaderMacro.getByName("HAS_TEX_LOD"));
    }
    if (engine._hardwareRenderer.canIUse(GLCapabilityType.standardDerivatives)) {
      shaderMacroList.push(ShaderMacro.getByName("HAS_DERIVATIVES"));
    }

    const macroMap = ShaderPass._macroMap;
    macroMap.clear();
    for (let i = 0, n = shaderMacroList.length; i < n; i++) {
      const macro = shaderMacroList[i];
      macroMap.set(macro.name, macro.value ?? "");
    }
    let noMacroVertex = ShaderMacroProcessor.evaluate(this._vertexShaderInstructions, macroMap);
    let noMacroFrag = ShaderMacroProcessor.evaluate(this._fragmentShaderInstructions, macroMap);

    if (isWebGL2 && this._platformTarget === ShaderLanguage.GLSLES100) {
      noMacroVertex = ShaderFactory.convertTo300(noMacroVertex);
      noMacroFrag = ShaderFactory.convertTo300(noMacroFrag, true);
    }

    const versionStr = isWebGL2 ? "#version 300 es" : "#version 100";

    return {
      vertexSource: ` ${versionStr}
        ${noMacroVertex}
      `,
      fragmentSource: ` ${versionStr}
        ${isWebGL2 ? "" : ShaderFactory._shaderExtension}
        ${precisionStr}
        ${noMacroFrag}
      `
    };
  }
}
