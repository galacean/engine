import type { ShaderInstruction } from "@galacean/engine-design";
import { Engine } from "../Engine";
import { InstanceBatch } from "../RenderPipeline/InstanceBatch";
import { PipelineStage } from "../RenderPipeline/enums/PipelineStage";
import { GLCapabilityType } from "../base/Constant";
import { ShaderFactory, InstanceFieldInfo } from "../shaderlib/ShaderFactory";
import { resolveIfdef } from "../shaderlib/GLSLIfdefResolver";
import { ShaderMacro } from "./ShaderMacro";
import { ShaderMacroCollection } from "./ShaderMacroCollection";
import { ShaderPart } from "./ShaderPart";
import { MacroMap } from "./MacroMap";
import { ShaderProgram } from "./ShaderProgram";
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
  _shaderProgramMaps: MacroMap<ShaderProgram>[] = [];

  private _vertexSource?: string;
  private _fragmentSource?: string;

  private static _shaderMacroList: ShaderMacro[] = [];
  private static _macroMap: Map<string, string> = new Map();

  private static _buildMacroMap(engine: Engine, macroCollection: ShaderMacroCollection): Map<string, string> {
    const rhi = engine._hardwareRenderer;
    const shaderMacroList = ShaderPass._shaderMacroList;
    shaderMacroList.length = 0;
    ShaderMacro._getMacrosElements(macroCollection, shaderMacroList);
    shaderMacroList.push(ShaderMacro.getByName(rhi.isWebGL2 ? "GRAPHICS_API_WEBGL2" : "GRAPHICS_API_WEBGL1"));
    if (rhi.canIUse(GLCapabilityType.shaderTextureLod)) {
      shaderMacroList.push(ShaderMacro.getByName("HAS_TEX_LOD"));
    }
    if (rhi.canIUse(GLCapabilityType.standardDerivatives)) {
      shaderMacroList.push(ShaderMacro.getByName("HAS_DERIVATIVES"));
    }
    const macroMap = ShaderPass._macroMap;
    macroMap.clear();
    for (let i = 0, n = shaderMacroList.length; i < n; i++) {
      const macro = shaderMacroList[i];
      macroMap.set(macro.name, macro.value ?? "");
    }
    return macroMap;
  }

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
  _getShaderProgram(
    engine: Engine,
    macroCollection: ShaderMacroCollection,
    instanceFields?: InstanceFieldInfo[]
  ): ShaderProgram {
    const shaderProgramMap = engine._getShaderProgramMap(this._shaderPassId, this._shaderProgramMaps);
    let shaderProgram = shaderProgramMap.get(macroCollection);
    if (shaderProgram) {
      return shaderProgram;
    }

    shaderProgram = this._getCanonicalShaderProgram(engine, macroCollection, instanceFields);

    shaderProgramMap.cache(shaderProgram);
    return shaderProgram;
  }

  /**
   * @internal
   * Scan renderer-group uniforms from this pass into fieldMap, without GPU compilation.
   */
  _scanInstanceFields(
    engine: Engine,
    macroCollection: ShaderMacroCollection,
    fieldMap: Record<number, string>
  ): boolean {
    let vertexSource: string;
    let fragmentSource: string;

    if (this._platformTarget != undefined) {
      const macroMap = ShaderPass._buildMacroMap(engine, macroCollection);
      vertexSource = ShaderMacroProcessor.evaluate(this._vertexShaderInstructions, macroMap);
      fragmentSource = ShaderMacroProcessor.evaluate(this._fragmentShaderInstructions, macroMap);
    } else {
      vertexSource = ShaderFactory.parseIncludes(this._vertexSource);
      fragmentSource = ShaderFactory.parseIncludes(this._fragmentSource);

      const macroMap = ShaderPass._buildMacroMap(engine, macroCollection);
      vertexSource = resolveIfdef(vertexSource, macroMap);
      fragmentSource = resolveIfdef(fragmentSource, macroMap);
    }

    const a = ShaderFactory._scanInstanceUniforms(vertexSource, fieldMap);
    const b = ShaderFactory._scanInstanceUniforms(fragmentSource, fieldMap);
    return a || b;
  }

  /**
   * @internal
   */
  _destroy(): void {
    const shaderProgramMaps = this._shaderProgramMaps;
    for (let i = 0, n = shaderProgramMaps.length; i < n; i++) {
      const map = shaderProgramMaps[i];
      map.clear((program) => program.destroy());
      delete map.engine._shaderProgramMaps[this._shaderPassId];
    }
    shaderProgramMaps.length = 0;
  }

  private _getCanonicalShaderProgram(
    engine: Engine,
    macroCollection: ShaderMacroCollection,
    instanceFields?: InstanceFieldInfo[]
  ): ShaderProgram {
    const isGpuInstance = macroCollection.isEnable(InstanceBatch.gpuInstanceMacro);
    const { vertexSource, fragmentSource } =
      this._platformTarget != undefined
        ? this._compileShaderLabSource(engine, macroCollection, isGpuInstance, instanceFields)
        : this._compilePlatformSource(engine, macroCollection, isGpuInstance, instanceFields);

    return new ShaderProgram(engine, vertexSource, fragmentSource);
  }

  private _compilePlatformSource(
    engine: Engine,
    macroCollection: ShaderMacroCollection,
    isGpuInstance: boolean,
    instanceFields?: InstanceFieldInfo[]
  ): { vertexSource: string; fragmentSource: string; instanceFields: InstanceFieldInfo[]; instanceMaxCount: number } {
    return ShaderFactory.compilePlatformSource(
      engine,
      macroCollection,
      this._vertexSource,
      this._fragmentSource,
      isGpuInstance,
      instanceFields
    );
  }

  private _compileShaderLabSource(
    engine: Engine,
    macroCollection: ShaderMacroCollection,
    isGpuInstance: boolean,
    instanceFields?: InstanceFieldInfo[]
  ): { vertexSource: string; fragmentSource: string; instanceFields: InstanceFieldInfo[]; instanceMaxCount: number } {
    const isWebGL2: boolean = engine._hardwareRenderer.isWebGL2;
    const macroMap = ShaderPass._buildMacroMap(engine, macroCollection);
    let vertexSource = ShaderMacroProcessor.evaluate(this._vertexShaderInstructions, macroMap);
    let fragmentSource = ShaderMacroProcessor.evaluate(this._fragmentShaderInstructions, macroMap);

    let injectedInstanceFields: InstanceFieldInfo[] = null;
    let injectedInstanceMaxCount = 0;
    if (isGpuInstance) {
      const injected = ShaderFactory._injectInstanceUBO(engine, vertexSource, fragmentSource, instanceFields);
      vertexSource = injected.vertexSource;
      fragmentSource = injected.fragmentSource;
      injectedInstanceFields = injected.instanceFields;
      injectedInstanceMaxCount = injected.instanceMaxCount;
    }

    if (isWebGL2 && this._platformTarget === ShaderLanguage.GLSLES100) {
      vertexSource = ShaderFactory.convertTo300(vertexSource);
      fragmentSource = ShaderFactory.convertTo300(fragmentSource, true);
    }

    const versionStr = isWebGL2 ? "#version 300 es" : "#version 100";

    return {
      vertexSource: ` ${versionStr}
        ${vertexSource}
      `,
      fragmentSource: ` ${versionStr}
        ${isWebGL2 ? "" : ShaderFactory._shaderExtension}
        ${precisionStr}
        ${fragmentSource}
      `,
      instanceFields: injectedInstanceFields,
      instanceMaxCount: injectedInstanceMaxCount
    };
  }
}
