import type { ShaderInstruction } from "@galacean/engine-design";
import { Engine } from "../Engine";
import { InstanceBuffer } from "../RenderPipeline/InstanceBuffer";
import { PipelineStage } from "../RenderPipeline/enums/PipelineStage";
import { InstanceBufferLayout, ShaderFactory } from "./ShaderFactory";
import { ShaderMacro } from "./ShaderMacro";
import { ShaderMacroCollection } from "./ShaderMacroCollection";
import { ShaderPart } from "./ShaderPart";
import { ShaderProgramMap } from "./ShaderProgramMap";
import { ShaderProgram } from "./ShaderProgram";
import { ShaderProperty } from "./ShaderProperty";
import { ShaderLanguage } from "./enums/ShaderLanguage";
import { ShaderMacroProcessor } from "./ShaderMacroProcessor";
import { RenderState } from "./state/RenderState";

const precisionStr = `
    precision highp float;
    precision highp int;
    `;

/**
 * Shader pass containing vertex and fragment source.
 */
export class ShaderPass extends ShaderPart {
  /** @internal */
  static _shaderPassCounter: number = 0;
  private static _shaderMacroList: ShaderMacro[] = [];
  private static _macroMap: Map<string, string> = new Map();

  /** @internal - Flat instruction array for vertex shader. */
  _vertexShaderInstructions: ShaderInstruction[];
  /** @internal */
  _fragmentShaderInstructions: ShaderInstruction[];

  /** @internal */
  _shaderPassId: number = 0;

  /** @internal Pass-level render state — always present, populated from ShaderLab declarations. */
  _renderState: RenderState = new RenderState();
  /** @internal */
  _renderStateDataMap: Record<number, ShaderProperty> = {};
  /** @internal */
  _shaderProgramMaps: ShaderProgramMap[] = [];

  private readonly _vertexOutputNames?: Readonly<Record<string, string>>;

  /**
   * Create a shader pass from precompiled instructions.
   * @param name - Shader pass name
   * @param vertexShaderInstructions - Precompiled vertex instruction array
   * @param fragmentShaderInstructions - Precompiled fragment instruction array
   * @param _platformTarget - Target shader language
   * @param tags - Tags
   * @param vertexOutputNames - Source output names mapped to generated GLSL names
   */
  constructor(
    name: string,
    vertexShaderInstructions: ShaderInstruction[],
    fragmentShaderInstructions: ShaderInstruction[],
    _platformTarget: ShaderLanguage,
    tags?: Record<string, number | string | boolean>,
    vertexOutputNames?: Readonly<Record<string, string>>
  ) {
    super();
    this._shaderPassId = ShaderPass._shaderPassCounter++;

    this._name = name;
    this._vertexShaderInstructions = vertexShaderInstructions;
    this._fragmentShaderInstructions = fragmentShaderInstructions;
    this._vertexOutputNames = vertexOutputNames;

    const mergedTags = { pipelineStage: PipelineStage.Forward, ...tags };
    for (const key in mergedTags) {
      this.setTag(key, mergedTags[key]);
    }
  }

  /**
   * @internal
   */
  _getShaderProgram(
    engine: Engine,
    macroCollection: ShaderMacroCollection,
    feedbackVaryings?: string[]
  ): ShaderProgram {
    const shaderProgramMap = engine._getShaderProgramMap(this._shaderPassId, this._shaderProgramMaps);
    let shaderProgram = shaderProgramMap.get(macroCollection);
    if (shaderProgram) {
      return shaderProgram;
    }

    shaderProgram = this._compileShaderProgram(engine, macroCollection, feedbackVaryings);

    shaderProgramMap.cache(shaderProgram);
    return shaderProgram;
  }

  /**
   * @internal
   */
  _destroy(): void {
    const shaderProgramMaps = this._shaderProgramMaps;
    for (let i = 0, n = shaderProgramMaps.length; i < n; i++) {
      const map = shaderProgramMaps[i];
      map.destroy();
      delete map.engine._shaderProgramMaps[this._shaderPassId];
    }
    shaderProgramMaps.length = 0;
  }

  /**
   * @internal
   */
  _compileShaderProgram(
    engine: Engine,
    macroCollection: ShaderMacroCollection,
    feedbackVaryings?: string[]
  ): ShaderProgram {
    const names = this._vertexOutputNames;
    if (names && feedbackVaryings?.length) {
      feedbackVaryings = feedbackVaryings.map((name) =>
        Object.prototype.hasOwnProperty.call(names, name) ? names[name] : name
      );
    }
    const isGPUInstance = macroCollection.isEnable(InstanceBuffer.gpuInstanceMacro);
    const { vertexSource, fragmentSource, instanceLayout } = this._compileShaderSource(
      engine,
      macroCollection,
      isGPUInstance
    );
    const program = new ShaderProgram(engine, vertexSource, fragmentSource, feedbackVaryings);
    program._instanceLayout = instanceLayout;
    return program;
  }

  private _compileShaderSource(
    engine: Engine,
    macroCollection: ShaderMacroCollection,
    isGPUInstance: boolean
  ): { vertexSource: string; fragmentSource: string; instanceLayout: InstanceBufferLayout | null } {
    const shaderMacroList = ShaderPass._shaderMacroList;
    shaderMacroList.length = 0;
    ShaderMacro._getMacrosElements(macroCollection, shaderMacroList);
    shaderMacroList.push(ShaderMacro.getByName("GRAPHICS_API_WEBGL2"));
    shaderMacroList.push(ShaderMacro.getByName("HAS_TEX_LOD"));
    shaderMacroList.push(ShaderMacro.getByName("HAS_DERIVATIVES"));

    const macroMap = ShaderPass._macroMap;
    macroMap.clear();
    for (let i = 0, n = shaderMacroList.length; i < n; i++) {
      const macro = shaderMacroList[i];
      macroMap.set(macro.name, macro.value ?? "");
    }
    let vertexSource = ShaderMacroProcessor.evaluate(this._vertexShaderInstructions, macroMap);
    let fragmentSource = ShaderMacroProcessor.evaluate(this._fragmentShaderInstructions, macroMap);

    let instanceLayout: InstanceBufferLayout | null = null;
    if (isGPUInstance) {
      const injected = ShaderFactory.injectInstanceUBO(engine, vertexSource, fragmentSource);
      vertexSource = injected.vertexSource;
      fragmentSource = injected.fragmentSource;
      instanceLayout = injected.instanceLayout;
    }

    const versionStr = "#version 300 es";

    return {
      vertexSource: ` ${versionStr}
        ${vertexSource}
      `,
      fragmentSource: ` ${versionStr}
        ${precisionStr}
        ${fragmentSource}
      `,
      instanceLayout
    };
  }
}
