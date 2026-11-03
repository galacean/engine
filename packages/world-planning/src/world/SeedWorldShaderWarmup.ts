import {
  AntiAliasing,
  BackgroundMode,
  type Camera,
  type Engine,
  type Entity,
  DirectLight,
  Light,
  PointLight,
  SpotLight,
  type Material,
  MeshRenderer,
  ParticleRenderer,
  Renderer,
  SkinnedMeshRenderer,
  type Scene,
  Shader,
  ShaderMacro,
  ShaderMacroCollection,
  ShaderPass
} from "@galacean/engine";
import {
  normalizeSeedWorldShaderVariants,
  withSeedWorldInstanceEntranceVariants,
  seedWorldShaderVariantKey,
  type SeedWorldShaderVariantEntry,
  type SeedWorldShaderVariantMacro
} from "./SeedWorldShaderVariantCoverage";

export {
  withSeedWorldInstanceEntranceVariants,
  withSeedWorldIblBlendVariants,
  expandSeedWorldShaderVariantManifest,
  findMissingSeedWorldShaderVariants,
  normalizeSeedWorldShaderVariants,
  type SeedWorldIndexedShaderVariantManifest,
  type SeedWorldShaderVariantEntry,
  type SeedWorldShaderVariantMacro
} from "./SeedWorldShaderVariantCoverage";

export interface SeedWorldShaderWarmupIssue {
  readonly key: string;
  readonly reason: "missing-shader" | "missing-pass" | "invalid-program" | "compile-error";
  readonly message: string;
}

export interface SeedWorldShaderWarmupReport {
  readonly requested: number;
  readonly compiled: number;
  /** True when compilation and cache validation were deliberately bypassed. */
  readonly skipped?: boolean;
  readonly issues: readonly SeedWorldShaderWarmupIssue[];
  readonly elapsedMilliseconds: number;
  readonly longestVariantMilliseconds: number;
}

export interface SeedWorldShaderWarmupOptions {
  /** False skips both compilation and cache-only checks; shader registration must still run. Defaults to true. */
  readonly enabled?: boolean;
  /** Validate existing programs only. A missing effective program must never trigger compilation. */
  readonly cacheOnly?: boolean;
  /** Main-thread work allowed before yielding to the Loading Scene. */
  readonly frameBudgetMilliseconds?: number;
  readonly strict?: boolean;
  readonly onProgress?: (completed: number, total: number) => void;
  /** Diagnostic receipt of exact requested identities before compilation. */
  readonly onVariants?: (variants: readonly SeedWorldShaderVariantEntry[]) => void;
}

export interface SeedWorldPostProcessWarmupState {
  readonly enabled: boolean;
  readonly bloom: boolean;
  readonly bloomHighQuality: boolean;
  readonly bloomDirt: boolean;
  readonly colorAdjustments: boolean;
  readonly tonemappingMode?: number;
}

export interface SeedWorldRendererWarmupOptions extends SeedWorldShaderWarmupOptions {
  /** Exact production emitters whose wind module can be enabled by weather changes. */
  readonly particleWindRenderers?: readonly ParticleRenderer[];
  /** Renderer feature macros that are enabled only during the entrance frame. */
  readonly additionalRendererMacroSets?: readonly (readonly SeedWorldShaderVariantMacro[])[];
  /** Also compile Galacean's automatic GPU batching variant for Renderer-owned geometry. */
  readonly includeGpuInstancing?: boolean;
  /** Roots that will activate at publication; their current inactive gate is ignored only for prediction. */
  readonly activatedLightRoots?: readonly Entity[];
  /** Accepted roots that will retire in that same publication. */
  readonly retiredLightRoots?: readonly Entity[];
  /** Intended profile effects, never the shared pass material left by another camera. */
  readonly postProcessState?: SeedWorldPostProcessWarmupState;
  /** Alternate background owners that may install after collection of scene.background.sky.material. */
  readonly additionalBackgroundMaterials?: readonly Material[];
}

type RuntimeShaderProgram = ReturnType<ShaderPass["_getShaderProgram"]>;

type RuntimeShaderPass = ShaderPass;

interface RuntimeShaderRegistry {
  readonly _shaderMap: Readonly<Record<string, Shader>>;
}

interface RuntimeShaderMacroConstructor {
  _getMacrosElements(macros: ShaderMacroCollection, out: ShaderMacro[]): void;
}

interface RuntimeShaderMacroCollection {
  readonly _mask: readonly number[];
  readonly _length: number;
}

interface RuntimeShaderData {
  readonly _macroCollection: ShaderMacroCollection;
}

type RuntimeEngine = Engine;

interface RuntimeCamera {
  readonly shaderData: RuntimeShaderData;
  readonly _globalShaderMacro: ShaderMacroCollection;
  _updateShaderData(): void;
  _isIndependentCanvasEnabled?(): boolean;
}

interface RuntimeMeshRenderer {
  readonly shaderData: RuntimeShaderData;
  readonly enableVertexColor: boolean;
  readonly mesh?: Readonly<{
    readonly _primitive?: Readonly<{
      readonly vertexElements?: readonly Readonly<{ readonly attribute: string }>[];
    }>;
  }>;
  getMaterials(): ReturnType<MeshRenderer["getMaterials"]>;
}

/** Internal generator hooks used by ParticleRenderer before rendering. */
interface RuntimeParticleGenerator {
  readonly _useTransformFeedback: boolean;
  _updateShaderData(data: Renderer["shaderData"]): void;
}

const DEFAULT_FRAME_BUDGET_MILLISECONDS = 6;
const ASSET_ASSEMBLY_INSTANCE_MACRO = ShaderMacro.getByName("RENDERER_ASSET_ASSEMBLY_INSTANCE");
const ASSET_ASSEMBLY_RENDERER_INSTANCE_MACRO = ShaderMacro.getByName("RENDERER_ASSET_ASSEMBLY_RENDERER_INSTANCE");

export async function warmupSeedWorldShaderVariants(
  engine: Engine,
  sourceEntries: readonly SeedWorldShaderVariantEntry[],
  options: SeedWorldShaderWarmupOptions = {}
): Promise<SeedWorldShaderWarmupReport> {
  if (options.enabled === false) return skippedWarmupReport(sourceEntries.length);
  const entries = normalizeSeedWorldShaderVariants(sourceEntries);
  const issues: SeedWorldShaderWarmupIssue[] = [];
  const startedAt = performance.now();
  const frameBudgetMilliseconds = Math.max(0, options.frameBudgetMilliseconds ?? DEFAULT_FRAME_BUDGET_MILLISECONDS);
  let frameStartedAt = startedAt;
  let compiled = 0;
  let longestVariantMilliseconds = 0;
  type ProgramState = {
    keys: string[];
    settled: boolean;
    failure?: Pick<SeedWorldShaderWarmupIssue, "reason" | "message">;
  };
  const programs = new Map<RuntimeShaderProgram, ProgramState>();
  const pending = new Map<RuntimeShaderProgram, ProgramState>();
  // Slots belong to effective programs, not macro aliases. Refill as soon as any slot is freed.
  const maximumPendingPrograms = 8;
  let reportedCompleted = -1;
  const reportProgress = () => {
    const completed = compiled + issues.length;
    if (completed !== reportedCompleted) {
      reportedCompleted = completed;
      options.onProgress?.(completed, entries.length);
    }
  };
  const yieldFrame = async () => {
    reportProgress();
    await nextAnimationFrame();
    frameStartedAt = performance.now();
  };
  const completeAlias = (key: string, state: ProgramState) => {
    if (state.failure) issues.push({ key, ...state.failure });
    else compiled++;
  };
  const submit = (entry: SeedWorldShaderVariantEntry) => {
    const key = seedWorldShaderVariantKey(entry);
    const shader = Shader.find(entry.shader);
    if (!shader) {
      issues.push({ key, reason: "missing-shader", message: `Shader '${entry.shader}' is not registered.` });
      return;
    }
    const pass = shader.subShaders[entry.si]?.passes[entry.pi] as RuntimeShaderPass | undefined;
    if (!pass) {
      issues.push({
        key,
        reason: "missing-pass",
        message: `Shader '${entry.shader}' has no subShader ${entry.si}, pass ${entry.pi}.`
      });
      return;
    }

    const macros = new ShaderMacroCollection();
    for (const macro of entry.macros) {
      macros.enable(macro.v === undefined ? ShaderMacro.getByName(macro.n) : ShaderMacro.getByName(macro.n, macro.v));
    }
    const variantStartedAt = performance.now();
    try {
      const program = pass._getShaderProgram(engine, macros, true, options.cacheOnly);
      const elapsed = performance.now() - variantStartedAt;
      longestVariantMilliseconds = Math.max(longestVariantMilliseconds, elapsed);
      const existing = programs.get(program);
      if (existing) {
        if (existing.settled) completeAlias(key, existing);
        else existing.keys.push(key);
      } else {
        const state: ProgramState = { keys: [key], settled: false };
        programs.set(program, state);
        pending.set(program, state);
      }
    } catch (error) {
      const elapsed = performance.now() - variantStartedAt;
      longestVariantMilliseconds = Math.max(longestVariantMilliseconds, elapsed);
      issues.push({
        key,
        reason: "compile-error",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  };

  let nextEntry = 0;
  while (nextEntry < entries.length || pending.size > 0) {
    while (nextEntry < entries.length && pending.size < maximumPendingPrograms) {
      submit(entries[nextEntry++]);
      if (performance.now() - frameStartedAt >= frameBudgetMilliseconds) await yieldFrame();
    }
    for (const [program, state] of pending) {
      const pollStartedAt = performance.now();
      try {
        if (program._pollReady()) {
          state.settled = true;
          if (!program.isValid)
            state.failure = { reason: "invalid-program", message: "Shader program compiled to an invalid program." };
        }
      } catch (error) {
        state.settled = true;
        state.failure = { reason: "compile-error", message: error instanceof Error ? error.message : String(error) };
      } finally {
        longestVariantMilliseconds = Math.max(longestVariantMilliseconds, performance.now() - pollStartedAt);
      }
      if (state.settled) {
        pending.delete(program);
        for (const key of state.keys) completeAlias(key, state);
        state.keys.length = 0;
      }
      if (performance.now() - frameStartedAt >= frameBudgetMilliseconds) await yieldFrame();
      // Do not wait for the slowest program in the old batch before submitting more work.
      if (state.settled && nextEntry < entries.length) break;
    }
    if (nextEntry < entries.length && pending.size < maximumPendingPrograms) continue;
    if (pending.size > 0) await yieldFrame();
  }
  reportProgress();

  const report: SeedWorldShaderWarmupReport = Object.freeze({
    requested: entries.length,
    compiled,
    issues: Object.freeze(issues),
    elapsedMilliseconds: performance.now() - startedAt,
    longestVariantMilliseconds
  });
  if (options.strict && issues.length > 0) {
    console.error("[Seed World Shader coverage]", JSON.stringify(issues));
    throw new Error(
      `Seed World Shader warmup failed for ${issues.length}/${entries.length} variants: ${issues[0].message}`
    );
  }
  return report;
}

/**
 * Builds FrameWork-compatible exact variants from the candidate world's real
 * renderer/material state, then compiles them while the Loading Scene owns the
 * screen. This avoids a stale hand-authored manifest when Seed or Water assets
 * choose a different runtime material variant.
 */
export async function warmupSeedWorldRendererVariants(
  engine: Engine,
  scene: Scene,
  camera: Camera,
  roots: readonly Entity[],
  options: SeedWorldRendererWarmupOptions = {}
): Promise<SeedWorldShaderWarmupReport> {
  if (options.enabled === false) return skippedWarmupReport(0);
  const variants = collectSeedWorldRendererVariants(engine, scene, camera, roots, options);
  options.onVariants?.(variants);
  return warmupSeedWorldShaderVariants(engine, variants, options);
}

function skippedWarmupReport(requested: number): SeedWorldShaderWarmupReport {
  return Object.freeze({
    requested,
    compiled: 0,
    skipped: true,
    issues: Object.freeze([]),
    elapsedMilliseconds: 0,
    longestVariantMilliseconds: 0
  });
}

/** Collects exact current renderer identities without compiling or drawing them. */
export function collectSeedWorldRendererVariants(
  engine: Engine,
  scene: Scene,
  camera: Camera,
  roots: readonly Entity[],
  options: SeedWorldRendererWarmupOptions = {}
): readonly SeedWorldShaderVariantEntry[] {
  const runtimeCamera = camera as unknown as RuntimeCamera;
  runtimeCamera._updateShaderData();
  // Engine macros describe the last rendered target (often the Loading Scene).
  // Predict the candidate camera target without binding or changing that target.
  const renderToTexture =
    typeof runtimeCamera._isIndependentCanvasEnabled === "function"
      ? runtimeCamera._isIndependentCanvasEnabled() || Boolean(camera.renderTarget)
      : undefined;

  const cameraMacros = new ShaderMacroCollection();
  ShaderMacroCollection.unionCollection(
    (scene.shaderData as unknown as RuntimeShaderData)._macroCollection,
    (camera.shaderData as unknown as RuntimeShaderData)._macroCollection,
    cameraMacros
  );

  if (options.activatedLightRoots) {
    const lightMacroNames = new Set(["SCENE_POINT_LIGHT_COUNT", "SCENE_SPOT_LIGHT_COUNT", "SCENE_DIRECT_LIGHT_COUNT"]);
    const currentMacros: ShaderMacro[] = [];
    (ShaderMacro as unknown as RuntimeShaderMacroConstructor)._getMacrosElements(cameraMacros, currentMacros);
    for (const macro of currentMacros) if (lightMacroNames.has(macro.name)) cameraMacros.disable(macro);
    for (const macro of collectSeedWorldPublicationLightMacros(
      scene,
      options.activatedLightRoots,
      options.retiredLightRoots ?? []
    )) {
      cameraMacros.enable(
        macro.v === undefined ? ShaderMacro.getByName(macro.n) : ShaderMacro.getByName(macro.n, macro.v)
      );
    }
  }

  const renderers: Renderer[] = [];
  const rootRenderers: Renderer[] = [];
  for (const root of roots) {
    // Entity replaces the supplied result array; retain previous roots explicitly.
    root.getComponentsIncludeChildren(Renderer, rootRenderers);
    renderers.push(...rootRenderers);
  }
  // Snow follows the camera, which is a separate scene root from the generated world.
  renderers.push(...(options.particleWindRenderers ?? []));
  const variants: SeedWorldShaderVariantEntry[] = [];
  const collectedShaderMacroSets = new Set<string>();
  const additionalMacroSets = options.additionalRendererMacroSets ?? [];
  const authoredMacroVariants: readonly (readonly SeedWorldShaderVariantMacro[])[] = Object.freeze([
    Object.freeze([]),
    ...additionalMacroSets.map((set) => Object.freeze([...set]))
  ]);
  const gpuInstancedMacroVariants: readonly (readonly SeedWorldShaderVariantMacro[])[] =
    options.includeGpuInstancing === false
      ? authoredMacroVariants
      : Object.freeze([
          ...authoredMacroVariants,
          ...authoredMacroVariants.map((set) => Object.freeze([...set, { n: "RENDERER_GPU_INSTANCE" }]))
        ]);

  for (const sourceRenderer of new Set(renderers)) {
    const isMesh = sourceRenderer instanceof MeshRenderer;
    const isParticle = sourceRenderer instanceof ParticleRenderer;
    if (!isMesh && !isParticle) continue;
    if (sourceRenderer instanceof SkinnedMeshRenderer) {
      // Inactive lazy-loaded mounts have not selected joint uniforms vs joint textures yet.
      // Use the renderer's native preparation so warmup matches this device's actual skin variant.
      (sourceRenderer as unknown as { _update(context: unknown): void })._update(
        (engine as RuntimeEngine)._renderContext
      );
    }
    if (isParticle) {
      // Match the production generator without emitting or advancing any particles.
      // Inactive snow/rain owners otherwise never publish their module macros at startup.
      const generator = (sourceRenderer as ParticleRenderer).generator as unknown as RuntimeParticleGenerator;
      generator._updateShaderData(sourceRenderer.shaderData);
      if (
        generator._useTransformFeedback ||
        options.particleWindRenderers?.includes(sourceRenderer as ParticleRenderer)
      ) {
        const feedback = Shader.find("Effect/ParticleFeedback");
        if (!feedback) throw new Error("Particle feedback shader is not registered");
        const feedbackMacros = new ShaderMacroCollection();
        feedbackMacros.unionCollection((sourceRenderer.shaderData as unknown as RuntimeShaderData)._macroCollection);
        if (generator._useTransformFeedback) appendShaderVariants(feedback, feedbackMacros, variants);
        if (options.particleWindRenderers?.includes(sourceRenderer as ParticleRenderer)) {
          feedbackMacros.enable(ShaderMacro.getByName("RENDERER_WOL_MODULE_ENABLED"));
          feedbackMacros.enable(ShaderMacro.getByName("RENDERER_TRANSFORM_FEEDBACK"));
          appendShaderVariants(feedback, feedbackMacros, variants);
        }
      }
    }
    const renderer = sourceRenderer as unknown as RuntimeMeshRenderer;
    const rendererMacros = new ShaderMacroCollection();
    ShaderMacroCollection.unionCollection(cameraMacros, renderer.shaderData._macroCollection, rendererMacros);
    if (isMesh) enableMeshVertexMacros(renderer, rendererMacros);
    // A custom Asset Assembly BufferMesh owns its instance attributes and cannot enter the generic batcher
    const ownsInstanceGeometry =
      rendererMacros.isEnable(ASSET_ASSEMBLY_INSTANCE_MACRO) &&
      !rendererMacros.isEnable(ASSET_ASSEMBLY_RENDERER_INSTANCE_MACRO);
    // Particle instancing is generator-owned; mesh batching and asset entrance are not particle features.
    const rendererMacroVariants = isParticle
      ? options.particleWindRenderers?.includes(sourceRenderer as ParticleRenderer)
        ? [[], [{ n: "RENDERER_WOL_MODULE_ENABLED" }, { n: "RENDERER_TRANSFORM_FEEDBACK" }]]
        : [[]]
      : ownsInstanceGeometry
        ? authoredMacroVariants
        : gpuInstancedMacroVariants;

    for (const material of renderer.getMaterials()) {
      if (!material || material.destroyed || material.shader.destroyed) continue;
      for (const extraMacros of rendererMacroVariants) {
        const compileMacros = new ShaderMacroCollection();
        ShaderMacroCollection.unionCollection(
          rendererMacros,
          (material.shaderData as unknown as RuntimeShaderData)._macroCollection,
          compileMacros
        );
        compileMacros.unionCollection((engine as RuntimeEngine)._macroCollection);
        for (const macro of extraMacros) {
          compileMacros.enable(
            macro.v === undefined ? ShaderMacro.getByName(macro.n) : ShaderMacro.getByName(macro.n, macro.v)
          );
        }
        const macroSetKey = `${material.shader.name}/${sourceRenderer.castShadows}?${shaderMacroCollectionKey(compileMacros)}`;
        if (collectedShaderMacroSets.has(macroSetKey)) continue;
        collectedShaderMacroSets.add(macroSetKey);
        appendShaderVariants(material.shader, compileMacros, variants, sourceRenderer.castShadows, renderToTexture);
      }
    }
  }

  // Camera passes and background materials are not Entity Renderer components.
  const auxiliary: [Material | undefined, boolean | undefined, ("bloom" | "uber")?][] = [];
  if (scene.background?.mode === BackgroundMode.Sky) auxiliary.push([scene.background.sky.material!, renderToTexture]);
  for (const material of options.additionalBackgroundMaterials ?? []) auxiliary.push([material, renderToTexture]);
  const runtimeEngine = engine as unknown as {
    _basicResources?: { blitMaterial?: Material };
    _getActivePostProcessPasses?: () => readonly {
      isActive: boolean;
      _uberMaterial?: Material;
      _bloomMaterial?: Material;
    }[];
  };
  const blit = runtimeEngine._basicResources?.blitMaterial;
  if (blit) auxiliary.push([blit, true], [blit, false]);
  const pipeline = camera as unknown as {
    _renderPipeline?: {
      _finalPass?: { _sRGBmaterial?: Material; _antiAliasingMaterial?: Material };
    };
    _needFinalPass?: () => boolean;
  };
  if (pipeline._needFinalPass?.()) {
    const final = pipeline._renderPipeline?._finalPass;
    const fxaa = camera.antiAliasing === AntiAliasing.FXAA;
    auxiliary.push([final?._sRGBmaterial, fxaa || Boolean(camera.renderTarget)]);
    if (fxaa) auxiliary.push([final?._antiAliasingMaterial, Boolean(camera.renderTarget)]);
  }
  if (camera.enablePostProcess && options.postProcessState?.enabled !== false)
    for (const pass of runtimeEngine._getActivePostProcessPasses?.() ?? []) {
      if (!pass.isActive) continue;
      if (!options.postProcessState || options.postProcessState.bloom)
        auxiliary.push([pass._bloomMaterial, true, "bloom"]);
      auxiliary.push([pass._uberMaterial, true, "uber"]);
    }
  for (const [material, target, kind] of auxiliary) {
    if (!material || material.destroyed || material.shader.destroyed) continue;
    const macros = new ShaderMacroCollection();
    ShaderMacroCollection.unionCollection(
      cameraMacros,
      (material.shaderData as unknown as RuntimeShaderData)._macroCollection,
      macros
    );
    macros.unionCollection((engine as RuntimeEngine)._macroCollection);
    const state = options.postProcessState;
    if (state && kind) {
      const names = new Set(
        kind === "bloom"
          ? ["BLOOM_HQ"]
          : [
              "BLOOM_HQ",
              "BLOOM_DIRT",
              "ENABLE_EFFECT_BLOOM",
              "ENABLE_EFFECT_COLOR_ADJUSTMENTS",
              "ENABLE_EFFECT_TONEMAPPING",
              "TONEMAPPING_MODE"
            ]
      );
      const old: ShaderMacro[] = [];
      (ShaderMacro as unknown as RuntimeShaderMacroConstructor)._getMacrosElements(macros, old);
      for (const macro of old) if (names.has(macro.name)) macros.disable(macro);
      if (state.bloomHighQuality) macros.enable(ShaderMacro.getByName("BLOOM_HQ"));
      if (kind === "uber") {
        if (state.bloom) macros.enable(ShaderMacro.getByName("ENABLE_EFFECT_BLOOM"));
        if (state.bloomDirt) macros.enable(ShaderMacro.getByName("BLOOM_DIRT"));
        if (state.colorAdjustments) macros.enable(ShaderMacro.getByName("ENABLE_EFFECT_COLOR_ADJUSTMENTS"));
        if (state.tonemappingMode !== undefined) {
          macros.enable(ShaderMacro.getByName("ENABLE_EFFECT_TONEMAPPING"));
          macros.enable(ShaderMacro.getByName("TONEMAPPING_MODE", String(state.tonemappingMode)));
        }
      }
    }
    appendShaderVariants(material.shader, macros, variants, false, target);
  }
  // Resource preparation compiles the actual scene/material contract. A
  // speculative environment-blend macro is not valid for every shader and
  // must not be injected into an otherwise renderable candidate.
  return withSeedWorldInstanceEntranceVariants(variants);
}

/** Predict LightManager registration after the atomic root swap without activating any entity. */
export function collectSeedWorldPublicationLightMacros(
  scene: Scene,
  activatedRoots: readonly Entity[],
  retiredRoots: readonly Entity[]
): readonly SeedWorldShaderVariantMacro[] {
  const manager = (scene as unknown as { _lightManager?: { _pointData?: { color: Float32Array } } })._lightManager;
  // Derive the cap from the same allocated LightManager data used by this engine.
  const capacity = (manager?._pointData?.color.length ?? 0) / 3;
  if (!Number.isInteger(capacity) || capacity <= 0) throw new Error("Scene light capacity is unavailable for warmup");
  const activated = new Set(activatedRoots),
    retired = new Set(retiredRoots);
  const lights = new Set<Light>();
  const scratch: Light[] = [];
  for (const root of new Set([...scene.rootEntities, ...activatedRoots])) {
    for (const type of [PointLight, SpotLight, DirectLight]) {
      root.getComponentsIncludeChildren<Light>(type, scratch);
      for (const light of scratch) lights.add(light);
    }
  }
  let point = 0,
    spot = 0,
    direct = 0;
  for (const light of lights) {
    if (!light.enabled) continue;
    let active = true;
    for (let entity: Entity | null = light.entity; entity; entity = entity.parent) {
      if (retired.has(entity) || (!activated.has(entity) && !entity.isActive)) {
        active = false;
        break;
      }
    }
    if (!active) continue;
    if (light instanceof PointLight) point++;
    else if (light instanceof SpotLight) spot++;
    else if (light instanceof DirectLight) direct++;
  }
  return [
    { n: "SCENE_POINT_LIGHT_COUNT", count: point },
    { n: "SCENE_SPOT_LIGHT_COUNT", count: spot },
    { n: "SCENE_DIRECT_LIGHT_COUNT", count: direct }
  ]
    .filter((value) => value.count > 0)
    .map((value) => ({ n: value.n, v: String(Math.min(value.count, capacity)) }));
}

function shaderMacroCollectionKey(macros: ShaderMacroCollection): string {
  const runtime = macros as unknown as RuntimeShaderMacroCollection;
  let key = "";
  for (let index = 0; index < runtime._length; index++) key += `${runtime._mask[index] ?? 0},`;
  return key;
}

export interface SeedWorldShaderVariantRecorder {
  snapshot(): readonly SeedWorldShaderVariantEntry[];
  /** First observed macro identity of each actual program, excluding later cache aliases. */
  programSnapshot(): readonly SeedWorldShaderVariantEntry[];
  stop(): void;
}

/**
 * Development-only runtime recorder. Enable it before Engine creation, run a
 * representative world, and persist snapshot() as the warmup manifest.
 */
/** Per-recorder ownership: capture macros by value, never retain a live macro collection. */
export function createSeedWorldShaderVariantSnapshotter(): (
  pass: ShaderPass,
  macros: ShaderMacroCollection
) => SeedWorldShaderVariantEntry | undefined {
  const locations = new Map<ShaderPass, Readonly<{ shader: string; si: number; pi: number }>>();
  return (pass, macros) => {
    const location = locations.get(pass) ?? locateShaderPass(pass, locations);
    if (!location) return undefined;
    const elements: ShaderMacro[] = [];
    (ShaderMacro as unknown as RuntimeShaderMacroConstructor)._getMacrosElements(macros, elements);
    return {
      ...location,
      macros: elements.map((macro) =>
        macro.value === undefined ? { n: macro.name } : { n: macro.name, v: macro.value }
      )
    };
  };
}

export function installSeedWorldShaderVariantRecorder(): SeedWorldShaderVariantRecorder {
  const prototype = ShaderPass.prototype as RuntimeShaderPass;
  const original = prototype._getShaderProgram;
  const variants = new Map<string, SeedWorldShaderVariantEntry>();
  const seenPrograms = new WeakSet<RuntimeShaderProgram>();
  const programVariants: SeedWorldShaderVariantEntry[] = [];
  const passLocations = new Map<ShaderPass, Readonly<{ shader: string; si: number; pi: number }>>();
  const macroElements: ShaderMacro[] = [];
  let stopped = false;

  const recordedGetShaderProgram = function (
    this: RuntimeShaderPass,
    engine: Engine,
    macros: ShaderMacroCollection,
    deferCompletion = false,
    cacheOnly = false
  ): RuntimeShaderProgram {
    const program = original.call(this, engine, macros, deferCompletion, cacheOnly);
    if (!stopped) {
      // Recording must never be allowed to interfere with rendering. A pass
      // can briefly exist before its Shader enters the registry.
      try {
        const location = passLocations.get(this) ?? locateShaderPass(this, passLocations);
        if (location) {
          (ShaderMacro as unknown as RuntimeShaderMacroConstructor)._getMacrosElements(macros, macroElements);
          const entry: SeedWorldShaderVariantEntry = {
            ...location,
            macros: macroElements.map((macro) =>
              macro.value === undefined ? { n: macro.name } : { n: macro.name, v: macro.value }
            )
          };
          variants.set(seedWorldShaderVariantKey(entry), entry);
          if (!seenPrograms.has(program)) {
            seenPrograms.add(program);
            programVariants.push(entry);
          }
        }
      } catch {
        // A later draw will retry the lookup after registration completes.
      }
    }
    return program;
  };
  prototype._getShaderProgram = recordedGetShaderProgram;

  return Object.freeze({
    snapshot: () => normalizeSeedWorldShaderVariants([...variants.values()]),
    programSnapshot: () => normalizeSeedWorldShaderVariants(programVariants),
    stop: () => {
      if (stopped) return;
      stopped = true;
      if (prototype._getShaderProgram === recordedGetShaderProgram) prototype._getShaderProgram = original;
    }
  });
}

function locateShaderPass(
  target: ShaderPass,
  cache: Map<ShaderPass, Readonly<{ shader: string; si: number; pi: number }>>
): Readonly<{ shader: string; si: number; pi: number }> | undefined {
  const registry = (Shader as unknown as RuntimeShaderRegistry)._shaderMap;
  for (const shader of Object.values(registry)) {
    if (!shader || !Array.isArray(shader.subShaders)) continue;
    for (let si = 0; si < shader.subShaders.length; si++) {
      const passes = shader.subShaders[si].passes;
      for (let pi = 0; pi < passes.length; pi++) {
        const pass = passes[pi];
        const location = Object.freeze({ shader: shader.name, si, pi });
        cache.set(pass, location);
        if (pass === target) return location;
      }
    }
  }
  return undefined;
}

function appendShaderVariants(
  shader: Shader,
  macros: ShaderMacroCollection,
  variants: SeedWorldShaderVariantEntry[],
  castShadows = true,
  renderToTexture?: boolean
): void {
  const macroElements: ShaderMacro[] = [];
  (ShaderMacro as unknown as RuntimeShaderMacroConstructor)._getMacrosElements(macros, macroElements);
  const recordedMacros = macroElements.map((macro) =>
    macro.value === undefined ? { n: macro.name } : { n: macro.name, v: macro.value }
  );
  for (let si = 0; si < shader.subShaders.length; si++) {
    for (let pi = 0; pi < shader.subShaders[si].passes.length; pi++) {
      const pass = shader.subShaders[si].passes[pi];
      // Match shadow culling even while candidate roots are intentionally inactive.
      if (!castShadows && pass.getTagValue("pipelineStage") === "ShadowCaster") continue;
      const stage = pass.getTagValue("pipelineStage");
      let passMacros = recordedMacros;
      if (renderToTexture !== undefined) {
        passMacros = recordedMacros.filter((macro) => macro.n !== "ENGINE_OUTPUT_SRGB_CORRECT");
        if (!renderToTexture && stage !== "ShadowCaster" && stage !== "DepthOnly") {
          passMacros.push({ n: "ENGINE_OUTPUT_SRGB_CORRECT" });
        }
      }
      variants.push({ shader: shader.name, si, pi, macros: passMacros });
    }
  }
}

function enableMeshVertexMacros(renderer: RuntimeMeshRenderer, macros: ShaderMacroCollection): void {
  const attributes = renderer.mesh?._primitive?.vertexElements ?? [];
  for (const { attribute } of attributes) {
    switch (attribute) {
      case "TEXCOORD_0":
        macros.enable(ShaderMacro.getByName("RENDERER_HAS_UV"));
        break;
      case "TEXCOORD_1":
        macros.enable(ShaderMacro.getByName("RENDERER_HAS_UV1"));
        break;
      case "NORMAL":
        macros.enable(ShaderMacro.getByName("RENDERER_HAS_NORMAL"));
        break;
      case "TANGENT":
        macros.enable(ShaderMacro.getByName("RENDERER_HAS_TANGENT"));
        break;
      case "COLOR_0":
        if (renderer.enableVertexColor) macros.enable(ShaderMacro.getByName("RENDERER_ENABLE_VERTEXCOLOR"));
        break;
    }
  }
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
