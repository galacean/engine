import type { ShaderInstruction } from "@galacean/engine-design";
import { Engine } from "../Engine";
import { InstanceBuffer } from "../RenderPipeline/InstanceBuffer";
import { PipelineStage } from "../RenderPipeline/enums/PipelineStage";
import { GLCapabilityType } from "../base/Constant";
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
  _platformTarget: ShaderLanguage;

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
  /** @internal Transform feedback output source names (WebGL2 only). */
  _feedbackVaryings?: string[];

  private readonly _vertexOutputNames?: Readonly<Record<string, string>>;

  private static _variantObservers = new WeakMap<
    Engine,
    Set<(pass: ShaderPass, macros: readonly ShaderMacro[]) => void>
  >();

  /**
   * Observe newly requested macro variants in this engine, including explicit warmup.
   * Register before preparing resources. Cache hits and cache-only validation do not notify.
   * The callback must only enqueue work: it runs inside program preparation.
   * Returns an unsubscribe function; callers own their queued work and its cancellation.
   */
  static observeVariants(
    engine: Engine,
    callback: (pass: ShaderPass, macros: readonly ShaderMacro[]) => void
  ): () => void {
    let observers = this._variantObservers.get(engine);
    if (!observers) this._variantObservers.set(engine, (observers = new Set()));
    observers.add(callback);
    return () => {
      observers.delete(callback);
    };
  }

  /** Prepare one pass, polling GPU completion when KHR_parallel_shader_compile is available.
   * Without that extension the driver may complete synchronously.
   * Source generation and GL submission still execute on the caller's thread.
   * Cancellation stops waiting; the cached program remains owned by this pass/engine.
   */
  async compileVariantAsync(engine: Engine, macros: readonly ShaderMacro[], signal?: AbortSignal): Promise<boolean> {
    signal?.throwIfAborted();
    const collection = new ShaderMacroCollection();
    for (const macro of macros) collection.enable(macro);
    const program = this._getShaderProgram(engine, collection, true);
    while (!program._pollReady()) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      signal?.throwIfAborted();
    }
    signal?.throwIfAborted();
    return program.isValid;
  }

  private static _shaderMacroList: ShaderMacro[] = [];
  private static _macroMap: Map<string, string> = new Map();

  /**
   * Create a shader pass from precompiled instructions.
   * @param name - Shader pass name
   * @param vertexShaderInstructions - Precompiled vertex instruction array
   * @param fragmentShaderInstructions - Precompiled fragment instruction array
   * @param platformTarget - Target shader language
   * @param tags - Tags
   * @param vertexOutputNames - Source output names mapped to generated GLSL names
   */
  constructor(
    name: string,
    vertexShaderInstructions: ShaderInstruction[],
    fragmentShaderInstructions: ShaderInstruction[],
    platformTarget: ShaderLanguage,
    tags?: Record<string, number | string | boolean>,
    vertexOutputNames?: Readonly<Record<string, string>>
  ) {
    super();
    this._shaderPassId = ShaderPass._shaderPassCounter++;

    this._name = name;
    this._vertexShaderInstructions = vertexShaderInstructions;
    this._fragmentShaderInstructions = fragmentShaderInstructions;
    this._platformTarget = platformTarget;
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
    feedbackOrDefer: string[] | boolean = false,
    cacheOnly = false
  ): ShaderProgram {
    const deferCompletion = typeof feedbackOrDefer === "boolean" ? feedbackOrDefer : false;
    if (Array.isArray(feedbackOrDefer)) {
      this._configureFeedbackVaryings(feedbackOrDefer);
    }
    const shaderProgramMap = engine._getShaderProgramMap(this._shaderPassId, this._shaderProgramMaps);
    let shaderProgram = shaderProgramMap.get(macroCollection);
    if (shaderProgram) {
      if (!deferCompletion) shaderProgram._ensureReady();
      return shaderProgram;
    }

    shaderProgram = this._compileShaderProgram(engine, macroCollection, deferCompletion, cacheOnly);

    shaderProgramMap.cache(shaderProgram);
    if (!cacheOnly) {
      const observers = ShaderPass._variantObservers.get(engine);
      if (observers?.size) {
        const macros: ShaderMacro[] = [];
        ShaderMacro._getMacrosElements(macroCollection, macros);
        for (const observer of observers) observer(this, macros);
      }
    }
    if (!deferCompletion) shaderProgram._ensureReady();
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
    feedbackOrDefer: string[] | boolean = false,
    cacheOnly = false
  ): ShaderProgram {
    const deferCompletion = typeof feedbackOrDefer === "boolean" ? feedbackOrDefer : false;
    if (Array.isArray(feedbackOrDefer)) {
      this._configureFeedbackVaryings(feedbackOrDefer);
    }
    // Retain source names for the pass ABI, including ShaderPool's preconfigured
    // outputs. Only the GL program and its source cache use the lowered names.
    const names = this._vertexOutputNames;
    const feedbackVaryings = names
      ? this._feedbackVaryings?.map((name) => (Object.prototype.hasOwnProperty.call(names, name) ? names[name] : name))
      : this._feedbackVaryings;
    const isGPUInstance = macroCollection.isEnable(InstanceBuffer.gpuInstanceMacro);
    const { vertexSource, fragmentSource, instanceLayout } = this._compileShaderSource(
      engine,
      macroCollection,
      isGPUInstance
    );
    // Macro identities remain the fast lookup path. Only a macro miss evaluates source;
    // irrelevant macros must not allocate another GL program. Keep this cache scoped
    // to this pass and Engine so feedback bindings and program lifetime never cross owners.
    const map = engine._getShaderProgramMap(this._shaderPassId, this._shaderProgramMaps);
    const sourceKey = JSON.stringify([
      vertexSource,
      fragmentSource,
      feedbackVaryings ?? [],
      instanceLayout && [
        instanceLayout.instanceMaxCount,
        instanceLayout.structSize,
        instanceLayout.instanceFields.map((field) => [
          field.property.name,
          field.type,
          field.offset,
          field.offsetInElements,
          field.useIntView
        ])
      ]
    ]);
    const cached = map.getBySource(sourceKey);
    if (cached) return cached;
    if (cacheOnly) throw new Error(`Shader pass '${this.name}' has a program missing from startup warmup`);
    const program = new ShaderProgram(engine, vertexSource, fragmentSource, feedbackVaryings, deferCompletion);
    program._instanceLayout = instanceLayout;
    map.cacheBySource(sourceKey, program);
    return program;
  }

  private _configureFeedbackVaryings(feedbackVaryings: string[]): void {
    if (this._feedbackVaryings) {
      if (
        this._feedbackVaryings.length !== feedbackVaryings.length ||
        this._feedbackVaryings.some((name, index) => name !== feedbackVaryings[index])
      ) {
        throw new Error("Transform feedback outputs cannot change after the pass ABI is configured");
      }
    } else {
      if (this._shaderProgramMaps.length)
        throw new Error("Configure feedback outputs before compiling the shader pass");
      this._feedbackVaryings = feedbackVaryings.slice();
    }
  }

  private _compileShaderSource(
    engine: Engine,
    macroCollection: ShaderMacroCollection,
    isGPUInstance: boolean
  ): { vertexSource: string; fragmentSource: string; instanceLayout: InstanceBufferLayout | null } {
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
    let vertexSource = ShaderMacroProcessor.evaluate(this._vertexShaderInstructions, macroMap);
    let fragmentSource = ShaderMacroProcessor.evaluate(this._fragmentShaderInstructions, macroMap);

    if (isWebGL2) {
      vertexSource = ShaderFactory.injectRealtimeIBLUniformBlocks(vertexSource);
      fragmentSource = ShaderFactory.injectRealtimeIBLUniformBlocks(fragmentSource);
    }

    let instanceLayout: InstanceBufferLayout | null = null;
    if (isGPUInstance) {
      const injected = ShaderFactory.injectInstanceUBO(engine, vertexSource, fragmentSource);
      vertexSource = injected.vertexSource;
      fragmentSource = injected.fragmentSource;
      instanceLayout = injected.instanceLayout;
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
        ${isWebGL2 ? "" : ShaderFactory.shaderExtension}
        ${precisionStr}
        ${fragmentSource}
      `,
      instanceLayout
    };
  }
}
