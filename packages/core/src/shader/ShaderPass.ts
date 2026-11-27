import { upgradeLegacyShaderStage } from "./upgradeLegacyShaderStage";
import {
  finalizeShaderUniforms,
  type IShaderUniformBlock,
  type IShaderUniformPlan,
  type IShaderUniformSelection,
  type IShaderUniformSite,
  type IShaderUniformVariable,
  type IWebGPUShaderProgram,
  type ShaderInstruction
} from "@galacean/engine-design";
import { Engine } from "../Engine";
import { InstanceBuffer } from "../RenderPipeline/InstanceBuffer";
import { PipelineStage } from "../RenderPipeline/enums/PipelineStage";
import { InstanceBufferLayout, ShaderFactory } from "./ShaderFactory";
import { ShaderMacro } from "./ShaderMacro";
import { ShaderMacroCollection } from "./ShaderMacroCollection";
import { ShaderPart } from "./ShaderPart";
import { ShaderProgramMap } from "./ShaderProgramMap";
import type { ShaderTextureOptions } from "./ShaderTextureLayout";
import { ShaderProgram } from "./ShaderProgram";
import { RHIBackend, type IPlatformShaderSource } from "../renderingHardwareInterface";
import type { Primitive } from "../graphic/Primitive";
import type { Mesh } from "../graphic/Mesh";
import type { MeshRenderer } from "../mesh/MeshRenderer";
import type { Camera } from "../Camera";
import type { Material } from "../material/Material";
import type { RenderTarget } from "../texture/RenderTarget";
import type { ShaderData } from "./ShaderData";
import { ShaderTagKey } from "./ShaderTagKey";
import { ShaderProperty } from "./ShaderProperty";
import { ShaderLanguage } from "./enums/ShaderLanguage";
import { ShaderMacroProcessor } from "./ShaderMacroProcessor";
import { RenderState } from "./state/RenderState";

/** Inputs that affect a prepared mesh pipeline's shader variant and raster state. */
export interface ShaderPipelinePreparation {
  camera?: Camera;
  renderer?: MeshRenderer;
  renderElementData?: ShaderData;
  macros?: readonly ShaderMacro[];
  subMeshIndex?: number;
  frontFaceInvert?: boolean;
}

const precisionStr = `
    precision highp float;
    precision highp int;
    `;

function evaluateDefaultStage(instructions: ShaderInstruction[], sites?: readonly IShaderUniformSite[]) {
  const uniforms: IShaderUniformSelection[] = [];
  return {
    source: ShaderMacroProcessor.evaluate(instructions, ShaderMacroProcessor._defaultWebGPUMacros, sites, uniforms),
    uniforms
  };
}

function matchesDefaultStage(
  stage: ReturnType<typeof evaluateDefaultStage>,
  source: string,
  uniforms?: IShaderUniformSelection[]
): boolean {
  return (
    stage.source === source &&
    stage.uniforms.length === (uniforms?.length ?? 0) &&
    stage.uniforms.every(({ site, start, end }, i) => {
      const selected = uniforms![i];
      return selected.site === site && selected.start === start && selected.end === end;
    })
  );
}

/**
 * Shader pass containing vertex and fragment source.
 */
export class ShaderPass extends ShaderPart {
  /** @internal */
  static _shaderPassCounter: number = 0;
  static _shaderRootPath = "shaders://root/";
  _feedbackVaryings?: string[];
  _pipelineStage?: string;
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

  /** @internal Retained only for runtime `Shader.create()` passes when lazily compiling for the other RHI backend. */
  _shaderLabSource?: {
    contents: string;
    vertexEntry: string;
    fragmentEntry: string;
    sourceFile?: string;
    contentScopeStarts?: readonly number[];
  };

  private _vertexOutputNames?: Readonly<Record<string, string>>;
  private _uniformBlocks?: readonly IShaderUniformBlock[];
  private _uniformPlan?: IShaderUniformPlan;
  private _wgsl?: IWebGPUShaderProgram;
  private readonly _webGPUFragmentInstructions?: ShaderInstruction[];
  private _wgslVertexInstructions?: ShaderInstruction[];
  private _wgslFragmentInstructions?: ShaderInstruction[];
  private _defaultWebGPUStages?: ReturnType<typeof evaluateDefaultStage>[];

  /**
   * Create a shader pass from precompiled instructions.
   * @param name - Shader pass name
   * @param vertexShaderInstructions - Precompiled vertex instruction array
   * @param fragmentShaderInstructions - Precompiled fragment instruction array
   * @param _platformTarget - Target shader language
   * @param tags - Tags
   * @param vertexOutputNames - Source output names mapped to generated GLSL names
   * @param uniformBlocks - Explicit global uniform block layouts from the compiler
   * @param uniformPlan - Typed sites in the instruction streams used to specialize this pass
   */
  constructor(
    name: string,
    vertexShaderInstructions: ShaderInstruction[],
    fragmentShaderInstructions: ShaderInstruction[],
    _platformTarget: ShaderLanguage,
    tags?: Record<string, number | string | boolean>,
    vertexOutputNames?: Readonly<Record<string, string>>,
    uniformBlocks?: readonly IShaderUniformBlock[],
    uniformPlan?: IShaderUniformPlan,
    wgsl?: IWebGPUShaderProgram,
    webGPUFragmentInstructions?: ShaderInstruction[],
    wgslVertexInstructions?: ShaderInstruction[],
    wgslFragmentInstructions?: ShaderInstruction[]
  ) {
    super();
    this._shaderPassId = ShaderPass._shaderPassCounter++;

    this._name = name;
    this._vertexShaderInstructions = vertexShaderInstructions;
    this._fragmentShaderInstructions = fragmentShaderInstructions;
    this._vertexOutputNames = vertexOutputNames;
    this._uniformBlocks = uniformBlocks;
    this._uniformPlan = uniformPlan;
    this._wgsl = wgsl;
    this._webGPUFragmentInstructions = webGPUFragmentInstructions;
    this._wgslVertexInstructions = wgslVertexInstructions;
    this._wgslFragmentInstructions = wgslFragmentInstructions;

    const mergedTags = { pipelineStage: PipelineStage.Forward, ...tags };
    for (const key in mergedTags) {
      this.setTag(key, mergedTags[key]);
    }
  }

  /**
   * @internal
   */
  override setTag<T extends number | string | boolean>(keyName: string, value: T): void;
  override setTag<T extends number | string | boolean>(key: ShaderTagKey, value: T): void;
  override setTag<T extends number | string | boolean>(keyOrKeyName: ShaderTagKey | string, value: T): void {
    super.setTag(keyOrKeyName as ShaderTagKey, value);
    if (typeof keyOrKeyName === "string" ? keyOrKeyName === "pipelineStage" : keyOrKeyName.name === "pipelineStage") {
      this._pipelineStage = value as unknown as string;
    }
  }

  /**
   * @inheritdoc
   */
  override deleteTag(keyName: string): void;
  override deleteTag(key: ShaderTagKey): void;
  override deleteTag(keyOrKeyName: ShaderTagKey | string): void {
    super.deleteTag(keyOrKeyName as ShaderTagKey);
    if (typeof keyOrKeyName === "string" ? keyOrKeyName === "pipelineStage" : keyOrKeyName.name === "pipelineStage") {
      this._pipelineStage = undefined;
    }
  }

  /**
   * @internal
   */
  _getShaderProgram(
    engine: Engine,
    macroCollection: ShaderMacroCollection,
    feedbackRequest?: string[] | boolean,
    primitiveOrCache?: Primitive | boolean,
    renderer?: ShaderData,
    material?: ShaderData,
    element?: ShaderData,
    camera = engine._renderContext.camera
  ): ShaderProgram {
    const feedbackVaryings = Array.isArray(feedbackRequest) ? feedbackRequest : this._feedbackVaryings;
    const primitive = typeof primitiveOrCache === "boolean" ? undefined : primitiveOrCache;
    const cacheOnly = primitiveOrCache === true;
    let shaderProgramMap = engine._getShaderProgramMap(this._shaderPassId, this._shaderProgramMaps);
    if (feedbackVaryings) shaderProgramMap = shaderProgramMap.specialize("feedback");
    if (primitive && engine._hardwareRenderer.backend === RHIBackend.WebGPU) {
      shaderProgramMap = shaderProgramMap.specialize(primitive._getShaderInputs().key);
    }
    let shaderProgram = shaderProgramMap.get(macroCollection);
    // The product simulator sizes its output by this ordered layout. A reused
    // shader/macro variant must still write the same fields into that buffer.
    const configuredFeedback = shaderProgram?._feedbackVaryings;
    if (
      feedbackVaryings &&
      configuredFeedback &&
      (feedbackVaryings.length !== configuredFeedback.length ||
        feedbackVaryings.some((field, index) => field !== configuredFeedback[index]))
    ) {
      throw new Error("Transform feedback outputs cannot change after the pass ABI is configured");
    }
    if (!shaderProgram) {
      shaderProgram = this._compileShaderProgram(
        engine,
        macroCollection,
        feedbackVaryings,
        primitive,
        undefined,
        cacheOnly
      );
      if (feedbackVaryings) shaderProgram._feedbackVaryings = feedbackVaryings.slice();
      const observers = ShaderPass._variantObservers.get(engine);
      if (!cacheOnly && observers?.size) {
        const macros: ShaderMacro[] = [];
        ShaderMacro._getMacrosElements(macroCollection, macros);
        for (const observer of observers) observer(this, macros);
      }
      shaderProgramMap.cache(shaderProgram);
    }
    const layout = shaderProgram._textureLayout;
    if (layout) {
      const specialized = layout.select(
        shaderProgramMap,
        camera?.scene?.shaderData,
        camera?.shaderData,
        renderer,
        material,
        element
      );
      if (specialized !== shaderProgramMap) {
        const cached = specialized.get(macroCollection);
        if (cached) return cached;
        shaderProgram = this._compileShaderProgram(
          engine,
          macroCollection,
          feedbackVaryings,
          primitive,
          layout.options()
        );
        specialized.cache(shaderProgram);
      }
    }
    return shaderProgram;
  }

  /** Prepare the selected shader and pipeline for a mesh, material and render target before its first draw. */
  preparePipeline(
    mesh: Mesh,
    material: Material,
    target: RenderTarget | null,
    options: ShaderPipelinePreparation = {}
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      const engine = mesh.engine;
      if (material.engine !== engine || (target && target.engine !== engine))
        throw new Error("Pipeline resources must belong to the same engine.");
      const { camera, renderer, renderElementData, macros, subMeshIndex = 0 } = options;
      if ((renderer && renderer.mesh !== mesh) || (camera && camera.engine !== engine))
        throw new Error("The preparation context must match the mesh and engine.");
      const subMesh = mesh.subMeshes[subMeshIndex];
      if (!subMesh) throw new RangeError("Cannot prepare a pipeline without the selected sub-mesh.");
      const collection = new ShaderMacroCollection();
      ShaderMacroCollection.unionCollection(engine._macroCollection, material.shaderData._macroCollection, collection);
      if (camera) {
        collection.unionCollection(camera.scene!.shaderData._macroCollection);
        collection.unionCollection(camera.shaderData._macroCollection);
      }
      if (renderer) {
        renderer._updateVertexElementMacros();
        collection.unionCollection(renderer.shaderData._macroCollection);
      }
      const internalForwardTarget =
        camera &&
        camera.renderTarget === target &&
        this.getTagValue("pipelineStage") === "Forward" &&
        camera._isIndependentCanvasEnabled();
      if (target || internalForwardTarget) collection.disable(Engine._outputSRGBCorrectMacro);
      else collection.enable(Engine._outputSRGBCorrectMacro);
      if (macros) for (const macro of macros) collection.enable(macro);
      const program = this._getShaderProgram(
        engine,
        collection,
        undefined,
        mesh._primitive,
        renderer?.shaderData,
        material.shaderData,
        renderElementData,
        camera
      );
      if (!program.isValid) throw new Error(`Could not compile shader pass '${this.name}'.`);
      const state = this._renderState._resolve(
        engine,
        this._renderStateDataMap,
        material.shaderData,
        renderElementData
      );
      const frontFaceInvert = options.frontFaceInvert ?? renderer?._isFrontFaceInvert() ?? false;
      const platform = program._platformProgram;
      if (!platform.prewarm) return resolve();
      const temporary = internalForwardTarget
        ? camera._renderPipeline._allocatePrewarmInternalColorTarget(
            Math.min(target?.antiAliasing ?? camera.msaaSamples, engine._hardwareRenderer.capability.maxAntiAliasing)
          )
        : null;
      let prepared: Promise<void>;
      try {
        // The platform consumes attachment formats synchronously when creating the native pipeline descriptor.
        prepared = platform.prewarm(mesh._primitive, subMesh, temporary ?? target, state, frontFaceInvert);
      } finally {
        if (temporary) engine._renderTargetPool.freeRenderTarget(temporary);
      }
      resolve(prepared);
    });
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
    feedbackVaryings?: string[],
    primitive?: Primitive,
    textureOptions?: ShaderTextureOptions,
    cacheOnly = false
  ): ShaderProgram {
    const names = this._vertexOutputNames;
    if (names && feedbackVaryings?.length) {
      feedbackVaryings = feedbackVaryings.map((name) =>
        Object.prototype.hasOwnProperty.call(names, name) ? names[name] : name
      );
    }
    const isGPUInstance = macroCollection.isEnable(InstanceBuffer.gpuInstanceMacro);
    const device = engine._hardwareRenderer;
    const vertexInputTypes = device.backend === RHIBackend.WebGPU ? primitive?._getShaderInputs().types : undefined;
    const baked = this._wgsl;
    const canUseBaked =
      device.backend === RHIBackend.WebGPU &&
      !!baked &&
      !isGPUInstance &&
      !feedbackVaryings?.length &&
      !textureOptions &&
      baked.reflection.vertexInputs.every(
        (input) => !vertexInputTypes?.[input.name] || vertexInputTypes[input.name] === input.type
      );
    if (canUseBaked && !macroCollection._mask.slice(0, macroCollection._length).some(Boolean)) {
      return this._createBakedProgram(engine, baked!);
    }
    const map = engine._getShaderProgramMap(this._shaderPassId, this._shaderProgramMaps);
    if (device.backend === RHIBackend.WebGPU) {
      return this._compileWebGPUProgram(
        engine,
        macroCollection,
        isGPUInstance,
        canUseBaked,
        feedbackVaryings,
        vertexInputTypes,
        textureOptions,
        cacheOnly,
        map
      );
    }
    const variant = this._compileShaderSource(engine, macroCollection, isGPUInstance, false);
    const source: IPlatformShaderSource = {
      vertexSource: variant.vertexSource,
      fragmentSource: variant.fragmentSource,
      feedbackVaryings,
      looseUniforms: variant.looseUniforms
    };
    const key = JSON.stringify([source, variant.uniformBlocks, variant.instanceLayout, variant.instanceBindingName]);
    const existing = map.getBySource(key);
    if (existing) return existing;
    if (cacheOnly) throw new Error("Unprepared Seed shader variant " + this.name);
    const program = new ShaderProgram(engine, source, variant.uniformBlocks, variant.instanceBindingName);
    map.cacheBySource(key, program);
    program._instanceLayout = variant.instanceLayout;
    return program;
  }

  private _compileWebGPUProgram(
    engine: Engine,
    macroCollection: ShaderMacroCollection,
    isGPUInstance: boolean,
    canUseBaked: boolean,
    feedbackVaryings: string[] | undefined,
    vertexInputTypes: Readonly<Record<string, "float" | "sint" | "uint">> | undefined,
    textureOptions: ShaderTextureOptions | undefined,
    cacheOnly: boolean,
    map: ShaderProgramMap
  ): ShaderProgram {
    const device = engine._hardwareRenderer;
    let baked = this._wgsl;
    let wgslVS = this._wgslVertexInstructions;
    let wgslFS = this._wgslFragmentInstructions;
    if ((!wgslVS || !wgslFS) && this._shaderLabSource && engine._shaderCompiler) {
      const src = this._shaderLabSource;
      const compiled = engine._shaderCompiler._parseShaderPass(
        src.contents,
        src.vertexEntry,
        src.fragmentEntry,
        ShaderLanguage.WGSL,
        src.sourceFile,
        src.contentScopeStarts
      );
      if (compiled?.wgslVertexInstructions && compiled.wgslFragmentInstructions) {
        this._wgslVertexInstructions = wgslVS = compiled.wgslVertexInstructions;
        this._wgslFragmentInstructions = wgslFS = compiled.wgslFragmentInstructions;
        if (compiled.wgsl) this._wgsl = baked = compiled.wgsl;
        if (compiled.uniformBlocks?.length) this._uniformBlocks = compiled.uniformBlocks;
        if (compiled.vertexOutputNames) this._vertexOutputNames = compiled.vertexOutputNames;
        if (this._vertexShaderInstructions.length) this._shaderLabSource = undefined;
      }
    }
    if (!wgslVS || !wgslFS) {
      if (canUseBaked && baked) return this._createBakedProgram(engine, baked);
      throw new Error(`WebGPU shader pass '${this.name}' is missing WGSL instructions; recompile from ShaderLab.`);
    }

    const shaderMacroList = ShaderPass._shaderMacroList;
    shaderMacroList.length = 0;
    ShaderMacro._getMacrosElements(macroCollection, shaderMacroList);
    shaderMacroList.push(ShaderMacro.getByName("GRAPHICS_API_WEBGPU"));
    shaderMacroList.push(ShaderMacro.getByName("HAS_TEX_LOD"));
    shaderMacroList.push(ShaderMacro.getByName("HAS_DERIVATIVES"));

    const macroMap = ShaderPass._macroMap;
    macroMap.clear();
    for (let i = 0, n = shaderMacroList.length; i < n; i++) {
      const macro = shaderMacroList[i];
      macroMap.set(macro.name, macro.value ?? "");
    }
    if (!isGPUInstance) macroMap.delete(InstanceBuffer.gpuInstanceMacro.name);
    macroMap.set("GL_ES", "1");
    macroMap.set("GL_FRAGMENT_PRECISION_HIGH", "1");
    macroMap.set("__VERSION__", "300");

    const vertexWGSL = ShaderMacroProcessor.evaluate(wgslVS, macroMap);
    const fragmentWGSL = ShaderMacroProcessor.evaluate(wgslFS, macroMap);

    if (canUseBaked && baked) {
      const [defaultV, defaultF] = (this._defaultWebGPUStages ??= [
        evaluateDefaultStage(wgslVS),
        evaluateDefaultStage(wgslFS)
      ]);
      if (defaultV.source === vertexWGSL && defaultF.source === fragmentWGSL) {
        return this._createBakedProgram(engine, baked);
      }
    }

    const preKey = JSON.stringify([
      vertexWGSL,
      fragmentWGSL,
      this._uniformBlocks,
      isGPUInstance,
      vertexInputTypes,
      textureOptions
        ? {
            ...textureOptions,
            unfilterableTextures: textureOptions.unfilterableTextures
              ? Array.from(textureOptions.unfilterableTextures).sort()
              : undefined
          }
        : undefined,
      feedbackVaryings
    ]);
    const cachedPre = map.getBySource(preKey);
    if (cachedPre) return cachedPre;

    const compiler = engine._webGPUShaderCompiler;
    if (!compiler) throw new Error("WebGPU shader specialization requires a WebGPU shader compiler.");

    const resolveConstant = (name: string): number | undefined => {
      const fromMacro = macroMap.get(name);
      if (fromMacro !== undefined && /^-?\d+$/.test(fromMacro.trim())) return Number(fromMacro.trim());
      return device.resolveShaderConstant?.(name);
    };
    let compiled = compiler.compileWebGPUVariant(vertexWGSL, fragmentWGSL, {
      uniformBlocks: this._uniformBlocks,
      enableGPUInstancing: isGPUInstance,
      resolveConstant,
      vertexInputTypes,
      ...textureOptions,
      maxTexturesPerStage: device.maxSampledTexturesPerShaderStage,
      maxSamplersPerStage: device.maxSamplersPerShaderStage,
      maxUniformBlockBytes: device.maxUniformBlockSize,
      computeFeedback: !!feedbackVaryings?.length
    });
    if (compiled.instanceOverflow && isGPUInstance) {
      compiled = compiler.compileWebGPUVariant(vertexWGSL, fragmentWGSL, {
        uniformBlocks: this._uniformBlocks,
        enableGPUInstancing: false,
        resolveConstant,
        vertexInputTypes,
        ...textureOptions,
        maxTexturesPerStage: device.maxSampledTexturesPerShaderStage,
        maxSamplersPerStage: device.maxSamplersPerShaderStage,
        maxUniformBlockBytes: device.maxUniformBlockSize,
        computeFeedback: !!feedbackVaryings?.length
      });
    }

    const instanceLayout = compiled.instanceLayout
      ? ShaderFactory.createInstanceLayout(compiled.instanceLayout, [], [], this._uniformBlocks)
      : null;
    const instanceBindingName = compiled.instanceLayout?.bindingName;
    const source: IPlatformShaderSource = {
      vertexSource: compiled.vertex,
      fragmentSource: compiled.fragment,
      vertexEntryPoint: compiled.vertexEntryPoint,
      fragmentEntryPoint: compiled.fragmentEntryPoint,
      reflection: compiled.reflection,
      feedbackVaryings
    };
    const key = JSON.stringify([source, instanceLayout, instanceBindingName]);
    const existing = map.getBySource(key);
    if (existing) {
      map.cacheBySource(preKey, existing);
      return existing;
    }
    if (cacheOnly) throw new Error("Unprepared Seed shader variant " + this.name);
    const program = new ShaderProgram(engine, source, this._uniformBlocks, instanceBindingName);
    map.cacheBySource(key, program);
    map.cacheBySource(preKey, program);
    program._instanceLayout = instanceLayout;
    return program;
  }

  private _createBakedProgram(engine: Engine, baked: IWebGPUShaderProgram): ShaderProgram {
    return new ShaderProgram(engine, {
      vertexSource: baked.vertex,
      fragmentSource: baked.fragment,
      vertexEntryPoint: baked.vertexEntryPoint,
      fragmentEntryPoint: baked.fragmentEntryPoint,
      reflection: baked.reflection
    });
  }

  private _compileShaderSource(
    engine: Engine,
    macroCollection: ShaderMacroCollection,
    isGPUInstance: boolean,
    canUseBaked = false
  ): {
    vertexSource: string;
    fragmentSource: string;
    instanceLayout: InstanceBufferLayout | null;
    matchesBaked?: boolean;
    uniformBlocks?: readonly IShaderUniformBlock[];
    instanceBindingName?: string;
    looseUniforms?: readonly IShaderUniformVariable[];
  } {
    if (!this._vertexShaderInstructions.length && this._shaderLabSource && engine._shaderCompiler) {
      const src = this._shaderLabSource;
      const compiled = engine._shaderCompiler._parseShaderPass(
        src.contents,
        src.vertexEntry,
        src.fragmentEntry,
        ShaderLanguage.GLSLES300,
        src.sourceFile,
        src.contentScopeStarts
      );
      if (compiled?.vertexShaderInstructions && compiled.fragmentShaderInstructions) {
        this._vertexShaderInstructions = compiled.vertexShaderInstructions;
        this._fragmentShaderInstructions = compiled.fragmentShaderInstructions;
        if (compiled.uniformBlocks?.length) this._uniformBlocks = compiled.uniformBlocks;
        if (compiled.uniformPlan) this._uniformPlan = compiled.uniformPlan;
        if (compiled.vertexOutputNames) this._vertexOutputNames = compiled.vertexOutputNames;
        if (this._wgslVertexInstructions) this._shaderLabSource = undefined;
      }
    }
    const shaderMacroList = ShaderPass._shaderMacroList;
    shaderMacroList.length = 0;
    ShaderMacro._getMacrosElements(macroCollection, shaderMacroList);
    shaderMacroList.push(
      ShaderMacro.getByName(
        engine._hardwareRenderer.backend === RHIBackend.WebGPU ? "GRAPHICS_API_WEBGPU" : "GRAPHICS_API_WEBGL2"
      )
    );
    shaderMacroList.push(ShaderMacro.getByName("HAS_TEX_LOD"));
    shaderMacroList.push(ShaderMacro.getByName("HAS_DERIVATIVES"));

    const macroMap = ShaderPass._macroMap;
    macroMap.clear();
    for (let i = 0, n = shaderMacroList.length; i < n; i++) {
      const macro = shaderMacroList[i];
      macroMap.set(macro.name, macro.value ?? "");
    }
    if (!isGPUInstance) macroMap.delete(InstanceBuffer.gpuInstanceMacro.name);
    // GLSL ES 3.00 predefined macros (§3.3) evaluated ahead of driver preprocessing
    macroMap.set("GL_ES", "1");
    macroMap.set("GL_FRAGMENT_PRECISION_HIGH", "1");
    macroMap.set("__VERSION__", "300");

    const plan = this._uniformPlan;
    const webgpu = engine._hardwareRenderer.backend === RHIBackend.WebGPU;
    const normalize = webgpu && !plan && engine._webGPUShaderCompiler?.normalizeRawStage;
    const vertexInstructions = normalize ? normalize(this._vertexShaderInstructions) : this._vertexShaderInstructions;
    const fragment =
      webgpu && this._webGPUFragmentInstructions ? this._webGPUFragmentInstructions : this._fragmentShaderInstructions;
    const fragmentInstructions = normalize ? normalize(fragment) : fragment;
    const instancing = isGPUInstance ? plan?.instancing : undefined;
    const vertexSites: IShaderUniformSelection[] | undefined = plan ? [] : undefined;
    const fragmentSites: IShaderUniformSelection[] | undefined = plan ? [] : undefined;
    let vertexSource = ShaderMacroProcessor.evaluate(vertexInstructions, macroMap, plan?.vertex, vertexSites);
    let fragmentSource = ShaderMacroProcessor.evaluate(fragmentInstructions, macroMap, plan?.fragment, fragmentSites);
    if (canUseBaked) {
      const [vertex, fragment] = (this._defaultWebGPUStages ??= [
        evaluateDefaultStage(vertexInstructions, plan?.vertex),
        evaluateDefaultStage(fragmentInstructions, plan?.fragment)
      ]);
      if (
        matchesDefaultStage(vertex, vertexSource, vertexSites) &&
        matchesDefaultStage(fragment, fragmentSource, fragmentSites)
      )
        return { vertexSource, fragmentSource, instanceLayout: null, matchesBaked: true };
    }
    let uniformBlocks = this._uniformBlocks;
    let instanceBindingName: string | undefined;
    let looseUniforms: readonly IShaderUniformVariable[] | undefined;
    let instanceLayout: InstanceBufferLayout | null = null;
    if (plan) {
      const device = engine._hardwareRenderer;
      const variant = finalizeShaderUniforms(
        vertexSource,
        fragmentSource,
        vertexSites!.filter((entry) => entry.site.name !== "scene_RealtimeEnvSH"),
        fragmentSites!.filter((entry) => entry.site.name !== "scene_RealtimeEnvSH"),
        {
          maxBlockBytes: device.maxUniformBlockSize,
          maxBindings: device.maxUniformBufferBindings,
          maxVertexBlocks: device.maxVertexUniformBlocks,
          maxFragmentBlocks: device.maxFragmentUniformBlocks,
          explicitBlocks: this._uniformBlocks?.length ?? 0,
          resolveConstant: device.resolveShaderConstant,
          instancing
        }
      );
      if (variant.instanceOverflow && isGPUInstance) {
        return this._compileShaderSource(engine, macroCollection, false);
      }
      vertexSource = variant.vertexSource;
      fragmentSource = variant.fragmentSource;
      looseUniforms = variant.looseUniforms;
      if (variant.uniformBlocks.length) uniformBlocks = [...(uniformBlocks ?? []), ...variant.uniformBlocks];
      if (variant.instanceLayout) {
        instanceLayout = ShaderFactory.createInstanceLayout(variant.instanceLayout, vertexSites!, fragmentSites!);
        instanceBindingName = variant.instanceLayout.bindingName;
      }
    } else if (
      isGPUInstance &&
      engine._hardwareRenderer.backend === RHIBackend.WebGPU &&
      engine._webGPUShaderCompiler?.recoverLegacyInstancing
    ) {
      // Keep the realtime IBL output buffer as an external block while recovering historical fields.
      const vertexSH = ShaderFactory.injectRealtimeIBLUniformBlocks(vertexSource);
      const fragmentSH = ShaderFactory.injectRealtimeIBLUniformBlocks(fragmentSource);
      if (vertexSH !== vertexSource || fragmentSH !== fragmentSource) {
        uniformBlocks = [
          ...(uniformBlocks ?? []),
          {
            name: "Auto",
            bindingName: ShaderFactory.REALTIME_IBL_SH_BLOCK_NAME,
            byteLength: 144,
            members: [
              { name: "scene_RealtimeEnvSH", type: "vec4", offset: 0, arrayLength: 9, arrayStride: 16, matrixStride: 0 }
            ]
          }
        ];
        vertexSource = vertexSH;
        fragmentSource = fragmentSH;
      }
      const variant = engine._webGPUShaderCompiler.recoverLegacyInstancing(
        vertexSource,
        fragmentSource,
        uniformBlocks?.length ?? 0,
        engine._hardwareRenderer.maxUniformBlockSize
      );
      if (!variant.instanceLayout) return this._compileShaderSource(engine, macroCollection, false);
      vertexSource = variant.vertexSource;
      fragmentSource = variant.fragmentSource;
      instanceLayout = ShaderFactory.createInstanceLayout(variant.instanceLayout, [], [], uniformBlocks);
      instanceBindingName = variant.instanceLayout.bindingName;
      if (variant.uniformBlocks.length) uniformBlocks = [...(uniformBlocks ?? []), ...variant.uniformBlocks];
      looseUniforms = variant.looseUniforms;
    } else if (isGPUInstance) {
      // Historical .shaderc contains the original instructions without compiler declaration metadata.
      const injected = ShaderFactory.injectInstanceUBO(engine, vertexSource, fragmentSource);
      if (!injected.instanceLayout) return this._compileShaderSource(engine, macroCollection, false);
      vertexSource = injected.vertexSource;
      fragmentSource = injected.fragmentSource;
      instanceLayout = injected.instanceLayout;
      instanceBindingName = instanceLayout.bindingName;
    }

    const shVertex = ShaderFactory.injectRealtimeIBLUniformBlocks(vertexSource);
    const shFragment = ShaderFactory.injectRealtimeIBLUniformBlocks(fragmentSource);
    if (shVertex !== vertexSource || shFragment !== fragmentSource) {
      uniformBlocks = [
        ...(uniformBlocks ?? []),
        {
          name: "Auto",
          bindingName: ShaderFactory.REALTIME_IBL_SH_BLOCK_NAME,
          byteLength: 144,
          members: [
            { name: "scene_RealtimeEnvSH", type: "vec4", offset: 0, arrayLength: 9, arrayStride: 16, matrixStride: 0 }
          ]
        }
      ];
    }
    vertexSource = plan ? shVertex : upgradeLegacyShaderStage(shVertex, false);
    fragmentSource = plan ? shFragment : upgradeLegacyShaderStage(shFragment, true);
    const versionStr = "#version 300 es";

    return {
      vertexSource: ` ${versionStr}
        ${vertexSource}
      `,
      fragmentSource: ` ${versionStr}
        ${precisionStr}
        ${fragmentSource}
      `,
      instanceLayout,
      uniformBlocks,
      instanceBindingName,
      looseUniforms
    };
  }
}
