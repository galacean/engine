import {
  AntiAliasing,
  BackgroundMode,
  type Camera,
  DepthTextureMode,
  type Engine,
  type Entity,
  DirectLight,
  GLCapabilityType,
  Light,
  PointLight,
  SpotLight,
  type Material,
  MeshRenderer,
  ParticleRenderer,
  Renderer,
  RenderQueueType,
  ScreenSpaceReflectionQuality,
  type ScreenSpaceReflectionSettings,
  SkinnedMeshRenderer,
  type Scene,
  Shader,
  ShaderMacro,
  ShaderMacroCollection,
  ShaderPass,
  ShaderProperty,
  TextureFormat
} from "@galacean/engine";
import photoCopySource from "./PhotoCopy.shader?raw";
import {
  normalizeSeedWorldShaderVariants,
  withSeedWorldGenerationRevealVariants,
  withSeedWorldInstanceEntranceVariants,
  withSeedWorldLodDitherVariants,
  withSeedWorldMasonryDitherVariants,
  withSeedWorldMasonryEntranceVariants,
  seedWorldShaderVariantKey,
  type SeedWorldShaderVariantEntry,
  type SeedWorldShaderVariantMacro
} from "./SeedWorldShaderVariantCoverage";

export {
  withSeedWorldGenerationRevealVariants,
  withSeedWorldInstanceEntranceVariants,
  withSeedWorldIblBlendVariants,
  withSeedWorldLodDitherVariants,
  withSeedWorldMasonryDitherVariants,
  withSeedWorldMasonryEntranceVariants,
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
  readonly parallelCompileSupported?: boolean;
  /** Variants not yet submitted because maxElapsedMilliseconds was reached. */
  readonly deferred?: readonly SeedWorldShaderVariantEntry[];
  readonly issues: readonly SeedWorldShaderWarmupIssue[];
  readonly elapsedMilliseconds: number;
  readonly longestVariantMilliseconds: number;
}

export interface SeedWorldShaderWarmupOptions {
  readonly signal?: AbortSignal;
  /** False skips both compilation and cache-only checks; shader registration must still run. Defaults to true. */
  readonly enabled?: boolean;
  /** Validate existing programs only. A missing effective program must never trigger compilation. */
  readonly cacheOnly?: boolean;
  /** Main-thread work allowed before yielding to the Loading Scene. */
  readonly frameBudgetMilliseconds?: number;
  /** Maximum concurrent async-compiling WebGL shader programs in flight when KHR_parallel_shader_compile is available. */
  readonly maximumPendingPrograms?: number;
  /** Optional wall-clock cap for startup warmup; remaining unsubmitted entries are returned in `report.deferred`. */
  readonly maxElapsedMilliseconds?: number;
  /** Preserve caller-supplied priority order instead of lexicographical sorting. */
  readonly preserveOrder?: boolean;
  readonly strict?: boolean;
  /** Whether Level-1 SSR sampler-budget fallback should enable CAMERA_SSR_VERIFY_RECEIVER_DEPTH (matches RenderQueue when transparent SSR receivers exist). */
  readonly ssrVerifyReceiverDepth?: boolean;
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
  readonly sunLensFlare?: boolean;
  readonly tonemappingMode?: number;
}

export interface SeedWorldRendererWarmupOptions extends SeedWorldShaderWarmupOptions {
  /** Screen-space overlay UI, including hidden controls that can appear after startup.
   * Uses UIUtils.renderOverlay's empty camera macros and canvas output target. */
  readonly overlayRenderers?: readonly Renderer[];
  /** False excludes inactive resource templates. Disabled Renderers on active LOD entities remain included. */
  readonly includeInactiveEntities?: boolean;
  /** World placement roots whose inactive LOD/frustum-culled children should still be warmed when includeInactiveEntities is false. */
  readonly includeInactiveRoots?: readonly Entity[];
  /** Explicit offscreen warmup renderers (e.g. lazy building LOD1/LOD0) always included regardless of active state. */
  readonly additionalRenderers?: readonly Renderer[];
  /** Explicit offscreen warmup renderers (e.g. unmaterialized vegetation species) that may batch via GPU instancing once streamed. */
  readonly additionalInstancedRenderers?: readonly Renderer[];
  /** Alternate materials swapped onto specific renderers at runtime (e.g. shadow-only proxy materials). */
  readonly additionalRendererMaterials?: ReadonlyMap<Renderer, readonly Material[]>;
  /**
   * Signed `SCENE_POINT_LIGHT_COUNT` deltas to precompile on Forward passes relative to the
   * scene's baseline point light count (e.g. `[4]` when a lazy 4-slot decoration light pool is
   * inactive, or `[-4]` when it is already active in-village so lights-OFF variants stay warm),
   * clamped to `[0, LightManager capacity]`.
   */
  readonly additionalPointLightCounts?: readonly number[];
  /** Exact production emitters whose wind module can be enabled by weather changes. */
  readonly particleWindRenderers?: readonly ParticleRenderer[];
  /** Renderer feature macros that are enabled only during the entrance frame. */
  readonly additionalRendererMacroSets?: readonly (readonly SeedWorldShaderVariantMacro[])[];
  /** Also compile Galacean's automatic GPU batching variant for Renderer-owned geometry. */
  readonly includeGpuInstancing?: boolean;
  /** Restrict automatic GPU batching variants to mesh+material pairs shared by >= 2 renderers. */
  readonly onlySharedMeshGpuInstancing?: boolean;
  /** Skip disabled Renderer components (e.g. inactive LOD transitions / disabled weather emitters) for fast first-frame warmup. */
  readonly onlyEnabledRenderers?: boolean;
  /** Whether to expand resident masonry shaders with symmetric RENDERER_MASONRY_DITHER variants. Defaults to true. */
  readonly includeMasonryDither?: boolean;
  /** Whether to expand masonry shaders with symmetric RENDERER_MASONRY_ENTRANCE variants. Defaults to true. */
  readonly includeMasonryEntrance?: boolean;
  /** Whether to expand compact vegetation shaders with RENDERER_INSTANCE_GENERATION_REVEAL variants. Defaults to true. */
  readonly includeInstanceEntrance?: boolean;
  /** Whether to expand vegetation shaders with symmetric RENDERER_LOD_DITHER variants. Defaults to false (set once at construction). */
  readonly includeLodDither?: boolean;
  /** Whether to expand vegetation/surface/terrain shaders with authoring CRUD rainbow reveal/wave variants. Defaults to false. */
  readonly includeGenerationReveal?: boolean;
  /** Whether opaque SSR receivers (e.g. wet terrain during rain) are active in this template. Defaults to false when dry. */
  readonly includeOpaqueScreenSpaceReflection?: boolean;
  /** Whether to also warm the masked variant (`SEED_WORLD_GLASS_MASK`) for LiquidGlass overlay icons mounted after startup. Defaults to true. */
  readonly includeLiquidGlassMask?: boolean;
  /** Whether to warm `SeedWorld/PhotoCopy` used by the assistant screenshot capture pipeline. Defaults to false. */
  readonly includePhotoCopy?: boolean;
  /** Roots that will activate at publication; their current inactive gate is ignored only for prediction. */
  readonly activatedLightRoots?: readonly Entity[];
  /** Accepted roots that will retire in that same publication. */
  readonly retiredLightRoots?: readonly Entity[];
  /** Intended profile effects, never the shared pass material left by another camera. */
  readonly postProcessState?: SeedWorldPostProcessWarmupState;
  /** Alternate background owners that may install after collection of scene.background.sky.material. */
  readonly additionalBackgroundMaterials?: readonly Material[];
  /** Invoked with collection metadata (such as whether transparent SSR receivers require depth verification). */
  readonly onCollectSummary?: (summary: { readonly hasTransparentSsr: boolean }) => void;
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
const ASSET_ASSEMBLY_COMPACT_INSTANCE_MACRO = ShaderMacro.getByName("RENDERER_ASSET_ASSEMBLY_COMPACT_INSTANCE");
const DETAIL_COMPACT_MACRO = ShaderMacro.getByName("RENDERER_SEED_WORLD_DETAIL_COMPACT");
const MASONRY_ENTRANCE_MACRO = ShaderMacro.getByName("RENDERER_MASONRY_ENTRANCE");
const GLOBAL_PROXY_ENTRANCE_MACRO = ShaderMacro.getByName("GLOBAL_PROXY_ENTRANCE");
const SSR_ALL_FORWARD_MACROS = new Set([
  "CAMERA_ENABLE_SSR",
  "CAMERA_SSR_VERIFY_RECEIVER_DEPTH",
  "CAMERA_SSR_BILATERAL_SAMPLE",
  "SSR_PACKED_DEPTH_RG8",
  "SSR_PACKED_NORMAL_OCT8"
]);

const PARTICLE_TRAJECTORY_FEEDBACK_MACRO = ShaderMacro.getByName("RENDERER_TRAJECTORY_FEEDBACK");
const PARTICLE_FEEDBACK_STATE_VARYINGS = ["v_FeedbackPosition", "v_FeedbackVelocity"];
const PARTICLE_FEEDBACK_TRAJECTORY_VARYINGS = [
  ...PARTICLE_FEEDBACK_STATE_VARYINGS,
  "v_FeedbackWorldPosition",
  "v_FeedbackTrajectoryVelocity"
];
const PARTICLE_FEEDBACK_GATHER_VARYINGS = ["v_ParentSampleWorldPosition", "v_ParentTrajectoryVelocity"];

function resolveTransformFeedbackVaryings(
  shaderName: string,
  pass: ShaderPass,
  macros: ShaderMacroCollection
): string[] | undefined {
  if (shaderName !== "Effect/ParticleFeedback") return undefined;
  if (pass.name === "SubEmitterTrajectoryGather") return PARTICLE_FEEDBACK_GATHER_VARYINGS;
  if (pass.name === "TransformFeedback") {
    return macros.isEnable(PARTICLE_TRAJECTORY_FEEDBACK_MACRO)
      ? PARTICLE_FEEDBACK_TRAJECTORY_VARYINGS
      : PARTICLE_FEEDBACK_STATE_VARYINGS;
  }
  return undefined;
}

type RuntimeSsrShaderProgram = RuntimeShaderProgram & {
  _errorLog?: string | null;
  activeTextureCount?: number;
  _ssrFallbackMaxUnits?: number;
  _ssrFallbackVerify?: RuntimeShaderProgram | null;
  _ssrFallbackNoVerify?: RuntimeShaderProgram | null;
};

function isTextureUnitOverflowError(errorLog: string | null | undefined): boolean {
  return Boolean(errorLog && /MAX_TEXTURE_IMAGE_UNITS|texture image units/i.test(errorLog));
}

function getCachedSsrFallback(
  program: RuntimeSsrShaderProgram,
  maxUnits: number,
  verifyDepth: boolean
): RuntimeSsrShaderProgram | null {
  if (maxUnits <= 0 || program._ssrFallbackMaxUnits !== maxUnits) return null;
  return (verifyDepth ? program._ssrFallbackVerify : program._ssrFallbackNoVerify) ?? null;
}

function cacheSsrFallback(
  rejectedPrograms: readonly RuntimeSsrShaderProgram[],
  fallbackProgram: RuntimeSsrShaderProgram,
  maxUnits: number,
  verifyDepth: boolean
): void {
  if (maxUnits <= 0 || !fallbackProgram.isValid) return;
  for (const rejected of rejectedPrograms) {
    if (rejected === fallbackProgram) continue;
    if (rejected._ssrFallbackMaxUnits !== maxUnits) {
      rejected._ssrFallbackVerify = null;
      rejected._ssrFallbackNoVerify = null;
      rejected._ssrFallbackMaxUnits = maxUnits;
    }
    if (verifyDepth) {
      rejected._ssrFallbackVerify = fallbackProgram;
    } else {
      rejected._ssrFallbackNoVerify = fallbackProgram;
    }
  }
}

function buildNextSsrFallbackEntry(
  entry: SeedWorldShaderVariantEntry,
  verifyDepth: boolean,
  rejectedProgram: RuntimeSsrShaderProgram,
  maxUnits: number
): SeedWorldShaderVariantEntry | null {
  if (!entry.macros.some((macro) => macro.n === "CAMERA_ENABLE_SSR")) return null;
  const hasBilateral = entry.macros.some((macro) => macro.n === "CAMERA_SSR_BILATERAL_SAMPLE");
  const hasVerify = entry.macros.some((macro) => macro.n === "CAMERA_SSR_VERIFY_RECEIVER_DEPTH");
  if (hasBilateral) {
    const level1Delta = verifyDepth ? 1 : 2;
    const canTryLevel1 =
      !rejectedProgram.isValid || maxUnits <= 0 || (rejectedProgram.activeTextureCount ?? 0) - level1Delta <= maxUnits;
    if (canTryLevel1) {
      const nextMacros = entry.macros.filter(
        (macro) =>
          macro.n !== "CAMERA_SSR_BILATERAL_SAMPLE" &&
          macro.n !== "CAMERA_SSR_VERIFY_RECEIVER_DEPTH" &&
          macro.n !== "SSR_PACKED_NORMAL_OCT8" &&
          (verifyDepth || macro.n !== "SSR_PACKED_DEPTH_RG8")
      );
      if (verifyDepth) {
        nextMacros.push({ n: "CAMERA_SSR_VERIFY_RECEIVER_DEPTH" });
      }
      return {
        shader: entry.shader,
        si: entry.si,
        pi: entry.pi,
        macros: nextMacros
      };
    }
  } else if (hasVerify && !verifyDepth) {
    const canTryDropVerify =
      !rejectedProgram.isValid || maxUnits <= 0 || (rejectedProgram.activeTextureCount ?? 0) - 1 <= maxUnits;
    if (canTryDropVerify) {
      const nextMacros = entry.macros.filter(
        (macro) => macro.n !== "CAMERA_SSR_VERIFY_RECEIVER_DEPTH" && macro.n !== "SSR_PACKED_DEPTH_RG8"
      );
      return {
        shader: entry.shader,
        si: entry.si,
        pi: entry.pi,
        macros: nextMacros
      };
    }
  }
  const strippedMacros = entry.macros.filter((macro) => !SSR_ALL_FORWARD_MACROS.has(macro.n));
  return {
    shader: entry.shader,
    si: entry.si,
    pi: entry.pi,
    macros: strippedMacros
  };
}

export function hasParallelShaderCompile(engine: Engine): boolean {
  const gl = (engine as unknown as { _hardwareRenderer?: { gl?: WebGLRenderingContext } })._hardwareRenderer?.gl;
  return Boolean(gl?.getExtension?.("KHR_parallel_shader_compile"));
}

export async function warmupSeedWorldShaderVariants(
  engine: Engine,
  sourceEntries: readonly SeedWorldShaderVariantEntry[],
  options: SeedWorldShaderWarmupOptions = {}
): Promise<SeedWorldShaderWarmupReport> {
  options.signal?.throwIfAborted();
  if (options.enabled === false) return skippedWarmupReport(sourceEntries.length);
  const entries = options.preserveOrder
    ? deduplicateOrderedShaderVariants(sourceEntries)
    : normalizeSeedWorldShaderVariants(sourceEntries);
  const issues: SeedWorldShaderWarmupIssue[] = [];
  const startedAt = performance.now();
  const frameBudgetMilliseconds = Math.max(0, options.frameBudgetMilliseconds ?? DEFAULT_FRAME_BUDGET_MILLISECONDS);
  const maxElapsedMilliseconds =
    options.maxElapsedMilliseconds !== undefined && Number.isFinite(options.maxElapsedMilliseconds)
      ? Math.max(0, options.maxElapsedMilliseconds)
      : undefined;
  let frameStartedAt = startedAt;
  let compiled = 0;
  let longestVariantMilliseconds = 0;
  const rawMaxUnits = (
    engine as unknown as { _hardwareRenderer?: { capability?: { maxFragmentTextureUnits?: number } } }
  )._hardwareRenderer?.capability?.maxFragmentTextureUnits;
  const maxFragmentTextureUnits =
    typeof rawMaxUnits === "number" && Number.isFinite(rawMaxUnits) && rawMaxUnits > 0 ? rawMaxUnits : 0;
  const ssrVerifyReceiverDepth = options.ssrVerifyReceiverDepth === true;
  type Alias = {
    key: string;
    entry: SeedWorldShaderVariantEntry;
    pass: RuntimeShaderPass;
    rejectedPrograms: RuntimeSsrShaderProgram[];
  };
  type ProgramState = {
    aliases: Alias[];
    settled: boolean;
    overflowFallback?: boolean;
    failure?: Pick<SeedWorldShaderWarmupIssue, "reason" | "message">;
  };
  const programs = new Map<RuntimeShaderProgram, ProgramState>();
  const pending = new Map<RuntimeShaderProgram, ProgramState>();
  // Slots belong to effective programs, not macro aliases. Refill as soon as any slot is freed.
  const maximumPendingPrograms = Math.max(1, Math.floor(options.maximumPendingPrograms ?? 16));
  const parallelCompileSupported = hasParallelShaderCompile(engine);
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
    options.signal?.throwIfAborted();
    frameStartedAt = performance.now();
  };
  const isProgramTextureUnitOverflow = (program: RuntimeSsrShaderProgram): boolean => {
    if (program.isValid) {
      return maxFragmentTextureUnits > 0 && (program.activeTextureCount ?? 0) > maxFragmentTextureUnits;
    }
    return isTextureUnitOverflowError(program._errorLog);
  };
  const submitFallbackOrFail = (
    alias: Alias,
    rejectedProgram: RuntimeSsrShaderProgram,
    failure: Pick<SeedWorldShaderWarmupIssue, "reason" | "message">
  ): void => {
    const cached = getCachedSsrFallback(rejectedProgram, maxFragmentTextureUnits, ssrVerifyReceiverDepth);
    if (
      cached &&
      cached.isValid &&
      (maxFragmentTextureUnits <= 0 || (cached.activeTextureCount ?? 0) <= maxFragmentTextureUnits)
    ) {
      cacheSsrFallback(alias.rejectedPrograms, cached, maxFragmentTextureUnits, ssrVerifyReceiverDepth);
      compiled++;
      return;
    }
    if (!options.cacheOnly) {
      const nextEntry = buildNextSsrFallbackEntry(
        alias.entry,
        ssrVerifyReceiverDepth,
        rejectedProgram,
        maxFragmentTextureUnits
      );
      if (nextEntry) {
        submitProgram({
          key: alias.key,
          entry: nextEntry,
          pass: alias.pass,
          rejectedPrograms: [...alias.rejectedPrograms, rejectedProgram]
        });
        return;
      }
    }
    issues.push({ key: alias.key, ...failure });
  };
  const submitProgram = (alias: Alias): void => {
    const macros = new ShaderMacroCollection();
    for (const macro of alias.entry.macros) {
      macros.enable(macro.v === undefined ? ShaderMacro.getByName(macro.n) : ShaderMacro.getByName(macro.n, macro.v));
    }
    const variantStartedAt = performance.now();
    try {
      const feedbackVaryings = resolveTransformFeedbackVaryings(alias.entry.shader, alias.pass, macros);
      const program = alias.pass._getShaderProgram(
        engine,
        macros,
        feedbackVaryings ?? true,
        options.cacheOnly
      ) as RuntimeSsrShaderProgram;
      const elapsed = performance.now() - variantStartedAt;
      longestVariantMilliseconds = Math.max(longestVariantMilliseconds, elapsed);
      const existing = programs.get(program);
      if (existing) {
        if (!existing.settled) {
          existing.aliases.push(alias);
        } else if (existing.overflowFallback) {
          if (
            !alias.rejectedPrograms.includes(program) &&
            alias.entry.macros.some((macro) => macro.n === "CAMERA_ENABLE_SSR")
          ) {
            submitFallbackOrFail(
              alias,
              program,
              existing.failure ?? {
                reason: "invalid-program",
                message: "Shader program exceeded fragment texture image units."
              }
            );
          } else if (existing.failure) {
            issues.push({ key: alias.key, ...existing.failure });
          } else {
            issues.push({
              key: alias.key,
              reason: "invalid-program",
              message: "Shader program failed texture unit budget without a valid fallback."
            });
          }
        } else if (existing.failure) {
          issues.push({ key: alias.key, ...existing.failure });
        } else {
          cacheSsrFallback(alias.rejectedPrograms, program, maxFragmentTextureUnits, ssrVerifyReceiverDepth);
          compiled++;
        }
      } else {
        const state: ProgramState = { aliases: [alias], settled: false };
        programs.set(program, state);
        pending.set(program, state);
      }
    } catch (error) {
      const elapsed = performance.now() - variantStartedAt;
      longestVariantMilliseconds = Math.max(longestVariantMilliseconds, elapsed);
      issues.push({
        key: alias.key,
        reason: "compile-error",
        message: error instanceof Error ? error.message : String(error)
      });
    }
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
    submitProgram({ key, entry, pass, rejectedPrograms: [] });
  };

  let nextEntry = 0;
  let budgetExceeded = false;
  while ((nextEntry < entries.length && !budgetExceeded) || pending.size > 0) {
    options.signal?.throwIfAborted();
    while (nextEntry < entries.length && !budgetExceeded && pending.size < maximumPendingPrograms) {
      if (
        maxElapsedMilliseconds !== undefined &&
        nextEntry > 0 &&
        performance.now() - startedAt >= maxElapsedMilliseconds
      ) {
        budgetExceeded = true;
        break;
      }
      submit(entries[nextEntry++]);
      if (performance.now() - frameStartedAt >= frameBudgetMilliseconds) await yieldFrame();
    }
    for (const [program, state] of pending) {
      const pollStartedAt = performance.now();
      try {
        if (program._pollReady()) {
          state.settled = true;
        }
      } catch (error) {
        state.settled = true;
        state.failure = { reason: "compile-error", message: error instanceof Error ? error.message : String(error) };
      } finally {
        longestVariantMilliseconds = Math.max(longestVariantMilliseconds, performance.now() - pollStartedAt);
      }
      if (state.settled) {
        pending.delete(program);
        const settledAliases = state.aliases.splice(0);
        if (state.failure) {
          for (const alias of settledAliases) issues.push({ key: alias.key, ...state.failure });
        } else {
          const ssrProgram = program as RuntimeSsrShaderProgram;
          if (isProgramTextureUnitOverflow(ssrProgram)) {
            const overflowFailure: Pick<SeedWorldShaderWarmupIssue, "reason" | "message"> = !ssrProgram.isValid
              ? {
                  reason: "invalid-program",
                  message: ssrProgram._errorLog
                    ? `Shader program compiled to an invalid program (${ssrProgram._errorLog}).`
                    : "Shader program compiled to an invalid program."
                }
              : {
                  reason: "invalid-program",
                  message: `Shader program exceeded maxFragmentTextureUnits (${ssrProgram.activeTextureCount}/${maxFragmentTextureUnits}).`
                };
            state.failure = overflowFailure;
            const hasSsrAlias = settledAliases.some((alias) =>
              alias.entry.macros.some((macro) => macro.n === "CAMERA_ENABLE_SSR")
            );
            if (hasSsrAlias) {
              state.overflowFallback = true;
              for (const alias of settledAliases) {
                if (alias.entry.macros.some((macro) => macro.n === "CAMERA_ENABLE_SSR")) {
                  submitFallbackOrFail(alias, ssrProgram, overflowFailure);
                } else {
                  issues.push({ key: alias.key, ...overflowFailure });
                }
              }
            } else {
              for (const alias of settledAliases) issues.push({ key: alias.key, ...overflowFailure });
            }
          } else if (!ssrProgram.isValid) {
            const detail = ssrProgram._errorLog;
            state.failure = {
              reason: "invalid-program",
              message: detail
                ? `Shader program compiled to an invalid program (${detail}).`
                : "Shader program compiled to an invalid program."
            };
            for (const alias of settledAliases) issues.push({ key: alias.key, ...state.failure });
          } else {
            for (const alias of settledAliases) {
              cacheSsrFallback(alias.rejectedPrograms, ssrProgram, maxFragmentTextureUnits, ssrVerifyReceiverDepth);
              compiled++;
            }
          }
        }
      }
      if (performance.now() - frameStartedAt >= frameBudgetMilliseconds) await yieldFrame();
      // Do not wait for the slowest program in the old batch before submitting more work.
      if (state.settled && !budgetExceeded && nextEntry < entries.length) break;
    }
    if (!budgetExceeded && nextEntry < entries.length && pending.size < maximumPendingPrograms) continue;
    if (pending.size > 0) await yieldFrame();
  }
  reportProgress();
  const deferred = nextEntry < entries.length ? Object.freeze(entries.slice(nextEntry)) : undefined;

  const report: SeedWorldShaderWarmupReport = Object.freeze({
    requested: entries.length,
    compiled,
    parallelCompileSupported,
    ...(deferred ? { deferred } : {}),
    issues: Object.freeze(issues),
    elapsedMilliseconds: performance.now() - startedAt,
    longestVariantMilliseconds
  });
  if (options.strict && issues.length > 0) {
    console.error("[Seed World Shader coverage]", JSON.stringify(issues));
    const details = issues
      .slice(0, 4)
      .map((issue) => `[${issue.key}] ${issue.message}`)
      .join(" | ");
    throw new Error(`Seed World Shader warmup failed for ${issues.length}/${entries.length} variants: ${details}`);
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
  const { variants, hasTransparentSsr } = collectSeedWorldRendererVariantsInternal(
    engine,
    scene,
    camera,
    roots,
    options
  );
  options.onVariants?.(variants);
  return warmupSeedWorldShaderVariants(engine, variants, {
    ...options,
    ssrVerifyReceiverDepth: options.ssrVerifyReceiverDepth ?? hasTransparentSsr
  });
}

function deduplicateOrderedShaderVariants(
  sourceEntries: readonly SeedWorldShaderVariantEntry[]
): readonly SeedWorldShaderVariantEntry[] {
  const seen = new Set<string>();
  const ordered: SeedWorldShaderVariantEntry[] = [];
  for (const entry of sourceEntries) {
    const normalized = normalizeSeedWorldShaderVariants([entry])[0]!;
    const key = seedWorldShaderVariantKey(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(normalized);
  }
  return Object.freeze(ordered);
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
  return collectSeedWorldRendererVariantsInternal(engine, scene, camera, roots, options).variants;
}

function collectSeedWorldRendererVariantsInternal(
  engine: Engine,
  scene: Scene,
  camera: Camera,
  roots: readonly Entity[],
  options: SeedWorldRendererWarmupOptions = {}
): { readonly variants: readonly SeedWorldShaderVariantEntry[]; readonly hasTransparentSsr: boolean } {
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
  // Active cameras can retain transient Forward SSR macros from the previous frame; strip them so warmup
  // never leaks stale SSR variants onto non-SSR passes or SSR-disabled collections.
  const activeCameraMacros: ShaderMacro[] = [];
  (ShaderMacro as unknown as RuntimeShaderMacroConstructor)._getMacrosElements(cameraMacros, activeCameraMacros);
  for (const macro of activeCameraMacros) {
    if (SSR_ALL_FORWARD_MACROS.has(macro.name)) cameraMacros.disable(macro);
  }

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
  const forcedRenderers = new Set<Renderer>(options.additionalRenderers ?? []);
  const forcedInstancedRenderers = new Set<Renderer>(options.additionalInstancedRenderers ?? []);
  for (const r of forcedInstancedRenderers) forcedRenderers.add(r);
  for (const root of roots) {
    // Entity replaces the supplied result array; retain previous roots explicitly.
    root.getComponentsIncludeChildren(Renderer, rootRenderers);
    renderers.push(...rootRenderers);
  }
  for (const root of options.includeInactiveRoots ?? []) {
    root.getComponentsIncludeChildren(Renderer, rootRenderers);
    for (const r of rootRenderers) {
      renderers.push(r);
      forcedRenderers.add(r);
    }
  }
  if (options.additionalRenderers?.length) {
    renderers.push(...options.additionalRenderers);
  }
  if (options.additionalInstancedRenderers?.length) {
    renderers.push(...options.additionalInstancedRenderers);
  }
  if (options.additionalRendererMaterials?.size) {
    for (const renderer of options.additionalRendererMaterials.keys()) {
      renderers.push(renderer);
      forcedRenderers.add(renderer);
    }
  }
  // Snow follows the camera, which is a separate scene root from the generated world.
  renderers.push(...(options.particleWindRenderers ?? []));
  const runtimeHardware = (
    engine as unknown as {
      _hardwareRenderer?: {
        isWebGL2?: boolean;
        canIUse?: (cap: GLCapabilityType) => boolean;
        capability?: { maxDrawBuffers?: number; isFragmentHighPrecision?: boolean };
      };
    }
  )._hardwareRenderer;
  const isWebGL2 = runtimeHardware?.isWebGL2 !== false;
  const depthPrepassEnabled = resolveDepthPrepassEnabled(engine, scene, camera);
  const rawSsrSettings =
    (
      camera as unknown as {
        screenSpaceReflectionOverride?: Partial<ScreenSpaceReflectionSettings> | ScreenSpaceReflectionSettings | null;
      }
    ).screenSpaceReflectionOverride ??
    (
      scene as unknown as {
        screenSpaceReflection?: Partial<ScreenSpaceReflectionSettings> | ScreenSpaceReflectionSettings;
      }
    ).screenSpaceReflection;
  const ssrCameraEnabled =
    (camera as unknown as { enableScreenSpaceReflection?: boolean }).enableScreenSpaceReflection !== false;
  const ssrSettingsValid = Boolean(
    rawSsrSettings &&
      (typeof (rawSsrSettings as { _isValid?: () => boolean })._isValid === "function"
        ? (rawSsrSettings as { _isValid: () => boolean })._isValid()
        : rawSsrSettings.enabled === true &&
          (rawSsrSettings.intensity ?? 1) > 0 &&
          (rawSsrSettings.maxRoughness ?? 0.6) > 0)
  );
  const hardwareSupportsSsr =
    isWebGL2 &&
    (runtimeHardware?.canIUse ? runtimeHardware.canIUse(GLCapabilityType.drawBuffers) : true) &&
    (runtimeHardware?.capability?.maxDrawBuffers ?? 2) >= 2 &&
    runtimeHardware?.capability?.isFragmentHighPrecision !== false;
  const ssrEnabled = ssrCameraEnabled && ssrSettingsValid && hardwareSupportsSsr;
  const ssrQuality = rawSsrSettings?.quality ?? ScreenSpaceReflectionQuality.Medium;
  const ssrMaxRoughness = rawSsrSettings?.maxRoughness ?? 0.6;
  const hwFormatSupport = (
    runtimeHardware as unknown as { supportsRenderTargetColorFormat?: (format: TextureFormat) => boolean } | undefined
  )?.supportsRenderTargetColorFormat;
  const supportsR16Float = hwFormatSupport ? hwFormatSupport.call(runtimeHardware, TextureFormat.R16_SFloat) : true;
  const supportsRGBA16 = hwFormatSupport ? hwFormatSupport.call(runtimeHardware, TextureFormat.R16G16B16A16) : true;
  const ssrPackedDepthRG8 = ssrEnabled && !supportsR16Float;
  const ssrHighPrecisionNormals =
    Boolean((camera as unknown as { enableHDR?: boolean }).enableHDR) ||
    ssrQuality === ScreenSpaceReflectionQuality.High ||
    ssrQuality === ScreenSpaceReflectionQuality.XHigh;
  const ssrPackedNormalOct8 = ssrEnabled && !(ssrHighPrecisionNormals && supportsRGBA16);
  const ssrRoughnessProp = ShaderProperty.getByName("material_Roughness");
  const ssrHasRoughnessTexMacro = ShaderMacro.getByName("MATERIAL_HAS_ROUGHNESS_METALLIC_TEXTURE");
  const ssrEnableClearCoatMacro = ShaderMacro.getByName("MATERIAL_ENABLE_CLEAR_COAT");
  const isSsrReceiver = (material: Material): boolean => {
    const intensity = (material as unknown as { screenSpaceReflectionIntensity?: number })
      .screenSpaceReflectionIntensity;
    if (intensity === undefined || intensity <= 0) return false;
    const shaderData = material.shaderData as unknown as {
      _macroCollection?: ShaderMacroCollection;
      getFloat?: (prop: ShaderProperty) => number | undefined;
    };
    const macros = shaderData?._macroCollection;
    if (macros && !macros.isEnable(ssrHasRoughnessTexMacro) && !macros.isEnable(ssrEnableClearCoatMacro)) {
      const roughness = shaderData.getFloat?.(ssrRoughnessProp);
      if (roughness !== undefined && roughness >= ssrMaxRoughness) return false;
    }
    return true;
  };
  const ssrReceiverExtraMacros: SeedWorldShaderVariantMacro[] = [];
  if (ssrPackedDepthRG8) ssrReceiverExtraMacros.push({ n: "SSR_PACKED_DEPTH_RG8" });
  if (ssrPackedNormalOct8) ssrReceiverExtraMacros.push({ n: "SSR_PACKED_NORMAL_OCT8" });
  const ssrContext: AppendShaderVariantContext = {
    depthPrepassEnabled,
    ssrEnabled,
    includeOpaqueSsr: options.includeOpaqueScreenSpaceReflection === true,
    isSsrReceiver,
    ssrReceiverExtraMacros,
    deferredSsrDepthOnly: [],
    deferredSsrForward: [],
    hasOpaqueSsr: false,
    hasTransparentSsr: false,
    hasContribDepth: false
  };
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

  const uniqueRenderers = [...new Set(renderers)];
  const subEmitterTargets = new Set<ParticleRenderer>();
  for (const sourceRenderer of uniqueRenderers) {
    if (!(sourceRenderer instanceof ParticleRenderer) || sourceRenderer.destroyed) continue;
    const subEmitters = (
      sourceRenderer.generator as unknown as {
        subEmitters?: { enabled?: boolean; subEmitters?: readonly { emitter?: ParticleRenderer | null }[] };
      }
    )?.subEmitters;
    if (subEmitters?.enabled && Array.isArray(subEmitters.subEmitters)) {
      for (const slot of subEmitters.subEmitters) {
        if (slot?.emitter) subEmitterTargets.add(slot.emitter);
      }
    }
  }
  const sharedMeshMaterialCounts = options.onlySharedMeshGpuInstancing
    ? new Map<object, Map<object, number>>()
    : undefined;
  if (sharedMeshMaterialCounts) {
    for (const sourceRenderer of uniqueRenderers) {
      if (
        !sourceRenderer ||
        sourceRenderer.destroyed ||
        !sourceRenderer.entity ||
        sourceRenderer.entity.destroyed ||
        !sourceRenderer.shaderData
      )
        continue;
      if (
        options.includeInactiveEntities === false &&
        !sourceRenderer.entity.isActiveInHierarchy &&
        !forcedRenderers.has(sourceRenderer)
      )
        continue;
      if (options.onlyEnabledRenderers && !sourceRenderer.enabled) continue;
      if (!(sourceRenderer instanceof MeshRenderer) || sourceRenderer instanceof SkinnedMeshRenderer) continue;
      const mesh = (sourceRenderer as unknown as RuntimeMeshRenderer).mesh;
      if (!mesh) continue;
      let materialMap = sharedMeshMaterialCounts.get(mesh);
      if (!materialMap) {
        materialMap = new Map<object, number>();
        sharedMeshMaterialCounts.set(mesh, materialMap);
      }
      const extraMaterials = options.additionalRendererMaterials?.get(sourceRenderer);
      const materials = extraMaterials?.length
        ? [...sourceRenderer.getMaterials(), ...extraMaterials]
        : sourceRenderer.getMaterials();
      for (const material of materials) {
        if (!material || material.destroyed || material.shader.destroyed) continue;
        materialMap.set(material, (materialMap.get(material) ?? 0) + 1);
      }
    }
  }

  for (const sourceRenderer of uniqueRenderers) {
    if (
      !sourceRenderer ||
      sourceRenderer.destroyed ||
      !sourceRenderer.entity ||
      sourceRenderer.entity.destroyed ||
      !sourceRenderer.shaderData
    )
      continue;
    if (
      options.includeInactiveEntities === false &&
      !sourceRenderer.entity.isActiveInHierarchy &&
      !forcedRenderers.has(sourceRenderer)
    )
      continue;
    if (options.onlyEnabledRenderers && !sourceRenderer.enabled) continue;
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
      const particleRenderer = sourceRenderer as ParticleRenderer;
      const generator = particleRenderer.generator as unknown as RuntimeParticleGenerator;
      generator._updateShaderData(sourceRenderer.shaderData);
      const particleMacros = (sourceRenderer.shaderData as unknown as RuntimeShaderData)._macroCollection;
      const useTransformFeedback =
        Boolean(generator._useTransformFeedback) ||
        particleMacros.isEnable(ShaderMacro.getByName("RENDERER_TRANSFORM_FEEDBACK"));
      const isWindParticle = Boolean(options.particleWindRenderers?.includes(particleRenderer));
      const isSubEmitterTarget = subEmitterTargets.has(particleRenderer);
      if (isWebGL2 && (useTransformFeedback || isWindParticle || isSubEmitterTarget)) {
        const feedback = Shader.find("Effect/ParticleFeedback");
        if (!feedback) throw new Error("Particle feedback shader is not registered");
        const pushFeedbackPass = (passIndex: number, macros: ShaderMacroCollection) => {
          if (!feedback.subShaders[0]?.passes[passIndex]) return;
          const elements: ShaderMacro[] = [];
          (ShaderMacro as unknown as RuntimeShaderMacroConstructor)._getMacrosElements(macros, elements);
          variants.push({
            shader: feedback.name,
            si: 0,
            pi: passIndex,
            macros: elements.map((m) => (m.value === undefined ? { n: m.name } : { n: m.name, v: m.value }))
          });
        };
        const feedbackMacros = new ShaderMacroCollection();
        feedbackMacros.unionCollection(particleMacros);
        if (useTransformFeedback) {
          pushFeedbackPass(0, feedbackMacros);
        }
        if (isSubEmitterTarget) {
          const subMacros = new ShaderMacroCollection();
          subMacros.unionCollection(feedbackMacros);
          subMacros.enable(ShaderMacro.getByName("RENDERER_HAS_SUB_EMITTER_SPAWNED_PARTICLES"));
          pushFeedbackPass(0, subMacros);
          pushFeedbackPass(1, new ShaderMacroCollection());
        }
        if (isWindParticle) {
          feedbackMacros.enable(ShaderMacro.getByName("RENDERER_WOL_MODULE_ENABLED"));
          feedbackMacros.enable(ShaderMacro.getByName("RENDERER_TRANSFORM_FEEDBACK"));
          pushFeedbackPass(0, feedbackMacros);
        }
      }
    }
    const renderer = sourceRenderer as unknown as RuntimeMeshRenderer;
    const rendererMacros = new ShaderMacroCollection();
    ShaderMacroCollection.unionCollection(cameraMacros, renderer.shaderData._macroCollection, rendererMacros);
    if (isMesh) enableMeshVertexMacros(renderer, rendererMacros);
    // Custom Asset Assembly / compact detail BufferMeshes own their instance attributes and never enter the generic batcher.
    const ownsInstanceGeometry =
      rendererMacros.isEnable(DETAIL_COMPACT_MACRO) ||
      rendererMacros.isEnable(ASSET_ASSEMBLY_COMPACT_INSTANCE_MACRO) ||
      (rendererMacros.isEnable(ASSET_ASSEMBLY_INSTANCE_MACRO) &&
        !rendererMacros.isEnable(ASSET_ASSEMBLY_RENDERER_INSTANCE_MACRO));
    // Particle instancing is generator-owned; mesh batching and asset entrance are not particle features.
    const canGpuInstanceRenderer =
      !isParticle && !ownsInstanceGeometry && !(sourceRenderer instanceof SkinnedMeshRenderer);
    const particleMacroVariants: readonly (readonly SeedWorldShaderVariantMacro[])[] =
      options.particleWindRenderers?.includes(sourceRenderer as ParticleRenderer)
        ? [[], [{ n: "RENDERER_WOL_MODULE_ENABLED" }, { n: "RENDERER_TRANSFORM_FEEDBACK" }]]
        : [[]];

    const extraMaterials = options.additionalRendererMaterials?.get(sourceRenderer);
    const materials = extraMaterials?.length
      ? [...renderer.getMaterials(), ...extraMaterials]
      : renderer.getMaterials();
    for (const material of materials) {
      if (!material || material.destroyed || material.shader.destroyed) continue;
      // Masonry shaders own their custom instance/packed vertex streams and never enter the generic UBO batcher.
      const useGpuInstancingForMaterial =
        canGpuInstanceRenderer &&
        !material.shader.name.startsWith("Masonry/") &&
        (!sharedMeshMaterialCounts ||
          forcedInstancedRenderers.has(sourceRenderer) ||
          (renderer.mesh !== undefined && (sharedMeshMaterialCounts.get(renderer.mesh)?.get(material) ?? 0) >= 2));
      const materialMacroVariants = isParticle
        ? particleMacroVariants
        : useGpuInstancingForMaterial
          ? gpuInstancedMacroVariants
          : authoredMacroVariants;
      // Material admission is not a shader macro: an opted-in contributor or SSR receiver must not be deduplicated
      // against an otherwise identical non-participant before its extra passes are collected.
      const contribDepthEnabled =
        ssrContext.ssrEnabled &&
        Boolean(
          (material as unknown as { contributeScreenSpaceReflectionDepth?: boolean })
            .contributeScreenSpaceReflectionDepth
        );
      const ssrBilateral =
        (material as unknown as { screenSpaceReflectionBilateral?: boolean }).screenSpaceReflectionBilateral !== false;
      const ssrReceiverKey =
        ssrContext.ssrEnabled && isSsrReceiver(material) ? (ssrBilateral ? "rx1b1" : "rx1b0") : "rx0";
      const contributionKey = contribDepthEnabled
        ? `${ssrReceiverKey}:${material.shader.subShaders
            .flatMap((subShader) =>
              subShader.passes.map((pass) =>
                pass._renderState._getRenderQueueByShaderData(pass._renderStateDataMap, material.shaderData)
              )
            )
            .join(",")}`
        : `${ssrReceiverKey}:off`;
      for (const extraMacros of materialMacroVariants) {
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
        const passCastShadows = sourceRenderer.castShadows || material.shader.name === "Masonry/GlobalProxyShadowOnly";
        const macroSetKey = `${material.shader.name}/${passCastShadows}/${contributionKey}?${shaderMacroCollectionKey(compileMacros)}`;
        const appendPointLightVariants = (targetShader: Shader, sourceMacros: ShaderMacroCollection): void => {
          if (!options.additionalPointLightCounts?.length || !shaderConsumesPointLights(targetShader.name)) return;
          // Startup entrance only runs under the scene's initial light state; steady-state gets alternate point-light counts.
          if (sourceMacros.isEnable(MASONRY_ENTRANCE_MACRO) || sourceMacros.isEnable(GLOBAL_PROXY_ENTRANCE_MACRO))
            return;
          const manager = (scene as unknown as { _lightManager?: { _pointData?: { color: Float32Array } } })
            ._lightManager;
          const rawCapacity = (manager?._pointData?.color.length ?? 0) / 3;
          const pointLightCapacity = Number.isInteger(rawCapacity) && rawCapacity > 0 ? rawCapacity : Infinity;
          const basePointMacros: ShaderMacro[] = [];
          (ShaderMacro as unknown as RuntimeShaderMacroConstructor)._getMacrosElements(sourceMacros, basePointMacros);
          let existingPointLightCount = 0;
          for (const macro of basePointMacros) {
            if (macro.name === "SCENE_POINT_LIGHT_COUNT") {
              existingPointLightCount = Number(macro.value ?? 0) || 0;
              break;
            }
          }
          for (const delta of options.additionalPointLightCounts) {
            if (!Number.isInteger(delta) || delta === 0) continue;
            const targetPointLightCount = Math.max(0, Math.min(existingPointLightCount + delta, pointLightCapacity));
            if (targetPointLightCount === existingPointLightCount) continue;
            const pointLightMacros = new ShaderMacroCollection();
            ShaderMacroCollection.unionCollection(sourceMacros, sourceMacros, pointLightMacros);
            for (const macro of basePointMacros) {
              if (macro.name === "SCENE_POINT_LIGHT_COUNT") pointLightMacros.disable(macro);
            }
            if (targetPointLightCount > 0) {
              pointLightMacros.enable(ShaderMacro.getByName("SCENE_POINT_LIGHT_COUNT", String(targetPointLightCount)));
            }
            const pointKey = `${targetShader.name}/pl=${targetPointLightCount}/${contributionKey}?${shaderMacroCollectionKey(pointLightMacros)}`;
            if (!collectedShaderMacroSets.has(pointKey)) {
              collectedShaderMacroSets.add(pointKey);
              appendShaderVariants(
                targetShader,
                pointLightMacros,
                variants,
                false,
                renderToTexture,
                material,
                isWebGL2,
                true,
                ssrContext
              );
            }
          }
        };
        if (!collectedShaderMacroSets.has(macroSetKey)) {
          collectedShaderMacroSets.add(macroSetKey);
          appendShaderVariants(
            material.shader,
            compileMacros,
            variants,
            passCastShadows,
            renderToTexture,
            material,
            isWebGL2,
            false,
            ssrContext
          );
          appendPointLightVariants(material.shader, compileMacros);
        }
        if (
          options.includeMasonryEntrance !== false &&
          (compileMacros.isEnable(MASONRY_ENTRANCE_MACRO) || compileMacros.isEnable(GLOBAL_PROXY_ENTRANCE_MACRO))
        ) {
          const steadyMacros = new ShaderMacroCollection();
          ShaderMacroCollection.unionCollection(compileMacros, compileMacros, steadyMacros);
          steadyMacros.disable(MASONRY_ENTRANCE_MACRO);
          steadyMacros.disable(GLOBAL_PROXY_ENTRANCE_MACRO);
          const steadyCastShadows =
            passCastShadows ||
            (material.shader.name === "Masonry/GlobalProxy" &&
              Boolean(extraMaterials?.some((m) => m.shader.name === "Masonry/GlobalProxyShadowOnly")));
          const steadyKey = `${material.shader.name}/${steadyCastShadows}/${contributionKey}?${shaderMacroCollectionKey(steadyMacros)}`;
          if (!collectedShaderMacroSets.has(steadyKey)) {
            collectedShaderMacroSets.add(steadyKey);
            appendShaderVariants(
              material.shader,
              steadyMacros,
              variants,
              steadyCastShadows,
              renderToTexture,
              material,
              isWebGL2,
              false,
              ssrContext
            );
          }
          appendPointLightVariants(material.shader, steadyMacros);
        }
        // BuildingGlobalProxy swaps between Masonry/GlobalProxy and Masonry/GlobalProxyShadowOnly
        // when cells transition between LOD2 and LOD1/LOD0; precompile both directions symmetrically.
        const companionShaderName =
          material.shader.name === "Masonry/GlobalProxy" && passCastShadows
            ? "Masonry/GlobalProxyShadowOnly"
            : material.shader.name === "Masonry/GlobalProxyShadowOnly"
              ? "Masonry/GlobalProxy"
              : undefined;
        if (companionShaderName) {
          const companionShader = Shader.find(companionShaderName);
          if (companionShader && !companionShader.destroyed) {
            const companionKey = `${companionShader.name}/${passCastShadows}/${contributionKey}?${shaderMacroCollectionKey(compileMacros)}`;
            if (!collectedShaderMacroSets.has(companionKey)) {
              collectedShaderMacroSets.add(companionKey);
              appendShaderVariants(
                companionShader,
                compileMacros,
                variants,
                passCastShadows,
                renderToTexture,
                material,
                isWebGL2,
                false,
                ssrContext
              );
            }
            appendPointLightVariants(companionShader, compileMacros);
          }
        }
      }
    }
  }

  // Camera passes and background materials are not Entity Renderer components.
  const auxiliary: [Material | undefined, boolean | undefined, ("bloom" | "uber")?][] = [];
  if (scene.background?.mode === BackgroundMode.Sky) auxiliary.push([scene.background.sky.material!, renderToTexture]);
  for (const material of options.additionalBackgroundMaterials ?? []) auxiliary.push([material, renderToTexture]);
  const runtimeEngine = engine as unknown as {
    _hardwareRenderer?: { isWebGL2?: boolean };
    _basicResources?: { blitMaterial?: Material };
    _getActivePostProcessPasses?: () => readonly {
      isActive: boolean;
      _uberMaterial?: Material;
      _bloomMaterial?: Material;
      _sunLensFlareMaterial?: Material | null;
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
      if (options.postProcessState?.sunLensFlare && pass._sunLensFlareMaterial) {
        auxiliary.push([pass._sunLensFlareMaterial, true]);
        if (isWebGL2) {
          const visibilityShader = Shader.find("PostProcess/SunLensFlareVisibility");
          if (visibilityShader && !visibilityShader.destroyed) {
            appendShaderVariants(
              visibilityShader,
              new ShaderMacroCollection(),
              variants,
              false,
              undefined,
              undefined,
              isWebGL2
            );
          }
        }
      }
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
              "ENABLE_EFFECT_SUN_LENS_FLARE",
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
        if (state.sunLensFlare) macros.enable(ShaderMacro.getByName("ENABLE_EFFECT_SUN_LENS_FLARE"));
        if (state.tonemappingMode !== undefined) {
          macros.enable(ShaderMacro.getByName("ENABLE_EFFECT_TONEMAPPING"));
          macros.enable(ShaderMacro.getByName("TONEMAPPING_MODE", String(state.tonemappingMode)));
        }
      }
    }
    appendShaderVariants(material.shader, macros, variants, false, target, undefined, isWebGL2);
  }
  // Warm deferred SSR DepthOnly / Forward SSR variants + exact Lighting/ScreenSpaceReflection v2 passes when receivers exist.
  const hasAnySsrReceivers = ssrContext.hasTransparentSsr || ssrContext.hasOpaqueSsr;
  if (ssrEnabled && hasAnySsrReceivers) {
    if (!depthPrepassEnabled && ssrContext.deferredSsrDepthOnly?.length) {
      variants.push(...ssrContext.deferredSsrDepthOnly);
    }
    if (ssrContext.deferredSsrForward?.length) {
      const camSSRBilateral = ssrQuality === ScreenSpaceReflectionQuality.High;
      const camSSRVerifyDepth = ssrContext.hasTransparentSsr;
      const buildForwardSsrMacros = (useBilateral: boolean, useVerifyDepth: boolean): SeedWorldShaderVariantMacro[] => {
        const macros: SeedWorldShaderVariantMacro[] = [{ n: "CAMERA_ENABLE_SSR" }];
        if (useBilateral) {
          macros.push({ n: "CAMERA_SSR_BILATERAL_SAMPLE" });
        } else if (useVerifyDepth) {
          macros.push({ n: "CAMERA_SSR_VERIFY_RECEIVER_DEPTH" });
        }
        if (ssrPackedDepthRG8 && (useVerifyDepth || useBilateral)) {
          macros.push({ n: "SSR_PACKED_DEPTH_RG8" });
        }
        if (ssrPackedNormalOct8 && useBilateral) {
          macros.push({ n: "SSR_PACKED_NORMAL_OCT8" });
        }
        return macros;
      };
      for (const entry of ssrContext.deferredSsrForward) {
        const useBilateral = camSSRBilateral && entry.allowBilateral;
        const useVerifyDepth = !useBilateral && (camSSRVerifyDepth || (camSSRBilateral && !entry.allowBilateral));
        variants.push({
          shader: entry.shader,
          si: entry.si,
          pi: entry.pi,
          macros: [...entry.macros, ...buildForwardSsrMacros(useBilateral, useVerifyDepth)]
        });
        // When both transparent and opaque SSR receivers exist under non-High quality, culling all
        // transparent receivers drops camSSRVerifyDepth at runtime; warm the opaque-only Forward variant too.
        if (
          ssrContext.hasTransparentSsr &&
          ssrContext.hasOpaqueSsr &&
          !useBilateral &&
          !camSSRBilateral &&
          entry.isOpaque
        ) {
          variants.push({
            shader: entry.shader,
            si: entry.si,
            pi: entry.pi,
            macros: [...entry.macros, ...buildForwardSsrMacros(false, false)]
          });
        }
      }
    }
    const ssrShader = Shader.find("Lighting/ScreenSpaceReflection");
    if (ssrShader && !ssrShader.destroyed) {
      const subShader = ssrShader.subShaders[0];
      if (subShader) {
        const baseSsrMacros = new ShaderMacroCollection();
        ShaderMacroCollection.unionCollection(cameraMacros, (engine as RuntimeEngine)._macroCollection, baseSsrMacros);
        if (ssrPackedDepthRG8) baseSsrMacros.enable(ShaderMacro.getByName("SSR_PACKED_DEPTH_RG8"));
        if (ssrPackedNormalOct8) baseSsrMacros.enable(ShaderMacro.getByName("SSR_PACKED_NORMAL_OCT8"));
        const baseElements: ShaderMacro[] = [];
        (ShaderMacro as unknown as RuntimeShaderMacroConstructor)._getMacrosElements(baseSsrMacros, baseElements);
        const baseRecorded = baseElements
          .filter((macro) => macro.name !== "ENGINE_OUTPUT_SRGB_CORRECT")
          .map((macro) => (macro.value === undefined ? { n: macro.name } : { n: macro.name, v: macro.value }));
        const appendSsrPass = (pi: number, extraMacros?: readonly SeedWorldShaderVariantMacro[]) => {
          if (!subShader.passes[pi]) return;
          variants.push({
            shader: ssrShader.name,
            si: 0,
            pi,
            macros: extraMacros?.length ? [...baseRecorded, ...extraMacros] : baseRecorded
          });
        };
        const useHighVirtual =
          ssrQuality === ScreenSpaceReflectionQuality.High || ssrQuality === ScreenSpaceReflectionQuality.XHigh;
        const isXHigh = ssrQuality === ScreenSpaceReflectionQuality.XHigh;
        if (depthPrepassEnabled) appendSsrPass(0); // Pass 0: DownsampleDepth
        const baseHiZ0Macros: SeedWorldShaderVariantMacro[] =
          depthPrepassEnabled && !isXHigh ? [{ n: "SSR_DOWNSAMPLE_FROM_FULL_DEPTH" }] : [];
        appendSsrPass(1, baseHiZ0Macros); // Pass 1: BuildHiZMip0 (without contrib depth)
        if (ssrContext.hasContribDepth) {
          appendSsrPass(1, [...baseHiZ0Macros, { n: "SSR_HAS_CONTRIB_DEPTH" }]); // Pass 1: BuildHiZMip0 (with contrib depth)
        }
        appendSsrPass(2); // Pass 2: BuildHiZMipN
        appendSsrPass(3); // Pass 3: CopyTexture
        appendSsrPass(4, useHighVirtual ? [{ n: "SSR_OUTPUT_HIT_DIST" }] : undefined); // Pass 4: HiZTrace
        if (ssrQuality !== ScreenSpaceReflectionQuality.Low) {
          appendSsrPass(5, useHighVirtual ? [{ n: "SSR_HIGH_VIRTUAL_REPROJECTION" }] : undefined); // Pass 5: TemporalResolve
        }
        const supportsColorPyramidR11G11B10 = hwFormatSupport
          ? hwFormatSupport.call(runtimeHardware, TextureFormat.R11G11B10_UFloat)
          : true;
        const colorPyramidFormat = supportsColorPyramidR11G11B10
          ? TextureFormat.R11G11B10_UFloat
          : supportsRGBA16
            ? TextureFormat.R16G16B16A16
            : TextureFormat.R8G8B8A8;
        const supportsColorPyramidHardwareMipmaps =
          !isXHigh && isWebGL2 && (!hwFormatSupport || hwFormatSupport.call(runtimeHardware, colorPyramidFormat));
        appendSsrPass(6, isXHigh ? [{ n: "SSR_COLOR_PYRAMID_FULL_RES" }] : undefined); // Pass 6: ColorPyramidPrefilter
        if (isXHigh || !supportsColorPyramidHardwareMipmaps) {
          appendSsrPass(7); // Pass 7: ColorPyramidDownsample (XHigh mips 2..N, or software fallback)
        }
        if (isXHigh) {
          appendSsrPass(7, [{ n: "SSR_COLOR_PYRAMID_KARIS_DOWNSAMPLE" }]); // Pass 7 mip 1
        }
      }
    }
  }
  if (options.includePhotoCopy) {
    const photoCopyShader = Shader.find("SeedWorld/PhotoCopy") ?? Shader.create(photoCopySource);
    if (photoCopyShader && !photoCopyShader.destroyed) {
      const photoMacros = new ShaderMacroCollection();
      ShaderMacroCollection.unionCollection(cameraMacros, (engine as RuntimeEngine)._macroCollection, photoMacros);
      appendShaderVariants(photoCopyShader, photoMacros, variants, false, true, undefined, isWebGL2);
    }
  }
  // Overlay UI uses a separate, empty camera macro set. Scene lighting, mesh
  // attributes and GPU instancing do not participate in this rendering path.
  for (const renderer of options.overlayRenderers ?? []) {
    for (const material of renderer.getMaterials()) {
      if (!material || material.destroyed || material.shader.destroyed) continue;
      const macros = new ShaderMacroCollection();
      ShaderMacroCollection.unionCollection(
        renderer.shaderData._macroCollection,
        material.shaderData._macroCollection,
        macros
      );
      macros.unionCollection(engine._macroCollection);
      macros.enable(ShaderMacro.getByName("ENGINE_SHOULD_SRGB_CORRECT"));
      appendShaderVariants(material.shader, macros, variants, false, false, material);
      if (
        options.includeLiquidGlassMask !== false &&
        material.shader.name === "SeedWorld/LiquidGlassUiV6" &&
        !macros.isEnable(ShaderMacro.getByName("SEED_WORLD_GLASS_MASK"))
      ) {
        const maskedMacros = new ShaderMacroCollection();
        ShaderMacroCollection.unionCollection(macros, macros, maskedMacros);
        maskedMacros.enable(ShaderMacro.getByName("SEED_WORLD_GLASS_MASK"));
        appendShaderVariants(material.shader, maskedMacros, variants, false, false, material);
      }
    }
  }
  // Resource preparation compiles the actual scene/material contract. A
  // speculative environment-blend macro is not valid for every shader and
  // must not be injected into an otherwise renderable candidate.
  let collected: readonly SeedWorldShaderVariantEntry[] = variants;
  if (options.includeGenerationReveal === true) collected = withSeedWorldGenerationRevealVariants(collected);
  if (options.includeInstanceEntrance !== false) collected = withSeedWorldInstanceEntranceVariants(collected);
  if (options.includeMasonryEntrance !== false) collected = withSeedWorldMasonryEntranceVariants(collected);
  if (options.includeMasonryDither !== false) collected = withSeedWorldMasonryDitherVariants(collected);
  if (options.includeLodDither === true) collected = withSeedWorldLodDitherVariants(collected);
  options.onCollectSummary?.({ hasTransparentSsr: ssrContext.hasTransparentSsr });
  return {
    variants: normalizeSeedWorldShaderVariants(collected),
    hasTransparentSsr: ssrContext.hasTransparentSsr
  };
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
  const registry = (Shader as unknown as { _shaderMap: Readonly<Record<string, Shader | readonly Shader[]>> })
    ._shaderMap;
  for (const entry of Object.values(registry)) {
    const shaders = Array.isArray(entry) ? entry : [entry];
    for (const shader of shaders) {
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
  }
  return undefined;
}

interface DeferredSsrForwardEntry extends SeedWorldShaderVariantEntry {
  readonly allowBilateral: boolean;
  readonly isOpaque: boolean;
}

interface AppendShaderVariantContext {
  readonly depthPrepassEnabled: boolean;
  readonly ssrEnabled: boolean;
  readonly includeOpaqueSsr: boolean;
  readonly isSsrReceiver?: (material: Material) => boolean;
  readonly ssrReceiverExtraMacros?: readonly SeedWorldShaderVariantMacro[];
  readonly deferredSsrDepthOnly?: SeedWorldShaderVariantEntry[];
  readonly deferredSsrForward?: DeferredSsrForwardEntry[];
  hasOpaqueSsr: boolean;
  hasTransparentSsr: boolean;
  hasContribDepth: boolean;
}

function resolveDepthPrepassEnabled(engine: Engine, scene: Scene, camera: Camera): boolean {
  const runtimeCamera = camera as unknown as {
    depthTextureMode?: DepthTextureMode;
    _enableForwardDepthResolve?: boolean;
    _isIndependentCanvasEnabled?: () => boolean;
  };
  // Preserve backward compatibility for minimal unit-test camera mocks without depthTextureMode.
  if (runtimeCamera.depthTextureMode === undefined) return true;
  const rhi = (
    engine as unknown as {
      _hardwareRenderer?: { isWebGL2?: boolean; canIUse?: (cap: GLCapabilityType) => boolean };
    }
  )._hardwareRenderer;
  const supportDepthTexture = rhi?.canIUse ? rhi.canIUse(GLCapabilityType.depthTexture) : true;
  if (!supportDepthTexture) return false;
  const ambientOcclusionEnabled = Boolean(
    (scene as unknown as { ambientOcclusion?: { _isValid?: () => boolean } }).ambientOcclusion?._isValid?.()
  );
  const cameraDepthTextureRequested = runtimeCamera.depthTextureMode === DepthTextureMode.PrePass;
  const baseIndependentCanvasEnabled = Boolean(runtimeCamera._isIndependentCanvasEnabled?.());
  const forwardDepthResolveEnabled =
    cameraDepthTextureRequested &&
    Boolean(runtimeCamera._enableForwardDepthResolve) &&
    !ambientOcclusionEnabled &&
    rhi?.isWebGL2 !== false &&
    baseIndependentCanvasEnabled;
  return ambientOcclusionEnabled || (cameraDepthTextureRequested && !forwardDepthResolveEnabled);
}

function shaderConsumesPointLights(shaderName: string): boolean {
  if (shaderName === "PBR" || shaderName === "BlinnPhong") return true;
  if (shaderName.startsWith("Terrain/") || shaderName.startsWith("Farming/")) return true;
  if (
    shaderName.startsWith("Masonry/") &&
    shaderName !== "Masonry/GlobalProxyShadowOnly" &&
    shaderName !== "Masonry/ShadowSurface"
  ) {
    return true;
  }
  return false;
}

function appendShaderVariants(
  shader: Shader,
  macros: ShaderMacroCollection,
  variants: SeedWorldShaderVariantEntry[],
  castShadows = true,
  renderToTexture?: boolean,
  material?: Material,
  isWebGL2 = true,
  forwardOnly = false,
  context?: AppendShaderVariantContext
): void {
  const macroElements: ShaderMacro[] = [];
  (ShaderMacro as unknown as RuntimeShaderMacroConstructor)._getMacrosElements(macros, macroElements);
  const recordedMacros = macroElements.map((macro) =>
    macro.value === undefined ? { n: macro.name } : { n: macro.name, v: macro.value }
  );
  for (let si = 0; si < shader.subShaders.length; si++) {
    for (let pi = 0; pi < shader.subShaders[si].passes.length; pi++) {
      const pass = shader.subShaders[si].passes[pi];
      const stage = pass.getTagValue("pipelineStage");
      if (forwardOnly && stage !== "Forward") continue;
      // Match shadow culling even while candidate roots are intentionally inactive.
      if (!castShadows && stage === "ShadowCaster") continue;
      if (stage === "TransformFeedback" && !isWebGL2) continue;
      if (stage === "DepthOnly" && context && !context.depthPrepassEnabled) {
        if (context.ssrEnabled && context.deferredSsrDepthOnly) {
          if (
            (material as { screenSpaceReflectionOccluder?: boolean } | undefined)?.screenSpaceReflectionOccluder ===
            false
          ) {
            continue;
          }
          const queue = material
            ? (pass._renderState?._getRenderQueueByShaderData?.(pass._renderStateDataMap, material.shaderData) ??
              ((material as { isTransparent?: boolean }).isTransparent
                ? RenderQueueType.Transparent
                : RenderQueueType.Opaque))
            : RenderQueueType.Opaque;
          if (queue !== RenderQueueType.Transparent) {
            const depthMacros =
              renderToTexture !== undefined
                ? recordedMacros.filter((macro) => macro.n !== "ENGINE_OUTPUT_SRGB_CORRECT")
                : recordedMacros;
            context.deferredSsrDepthOnly.push({ shader: shader.name, si, pi, macros: depthMacros });
          }
        }
        continue;
      }
      if (stage === "SSRReceiver" && material && context) {
        if (!context.ssrEnabled) continue;
        const queue =
          pass._renderState?._getRenderQueueByShaderData?.(pass._renderStateDataMap, material.shaderData) ??
          ((material as { isTransparent?: boolean }).isTransparent
            ? RenderQueueType.Transparent
            : RenderQueueType.Opaque);
        const isReceiver = context.isSsrReceiver
          ? context.isSsrReceiver(material)
          : ((material as unknown as { screenSpaceReflectionIntensity?: number }).screenSpaceReflectionIntensity ?? 0) >
            0;
        const forceTerrainOpaque =
          !isReceiver &&
          queue !== RenderQueueType.Transparent &&
          context.includeOpaqueSsr &&
          shader.name.startsWith("Terrain/");
        if (!isReceiver && !forceTerrainOpaque) continue;
        if (queue === RenderQueueType.Transparent) {
          context.hasTransparentSsr = true;
        } else {
          context.hasOpaqueSsr = true;
        }
      }
      // Contribution depth capture only visits opted-in transparent materials. Merely having the pass in PBR
      // does not make it reachable (opaque objects already contribute through their Forward color).
      if (stage === "SSRContributionDepth") {
        if (context && !context.ssrEnabled) continue;
        if (
          material &&
          (!(material as unknown as { contributeScreenSpaceReflectionDepth?: boolean })
            .contributeScreenSpaceReflectionDepth ||
            pass._renderState._getRenderQueueByShaderData(pass._renderStateDataMap, material.shaderData) !==
              RenderQueueType.Transparent)
        )
          continue;
        if (material && context) {
          context.hasContribDepth = true;
        }
      }
      let passMacros = recordedMacros;
      if (renderToTexture !== undefined) {
        passMacros = recordedMacros.filter((macro) => macro.n !== "ENGINE_OUTPUT_SRGB_CORRECT");
        if (
          !renderToTexture &&
          stage !== "ShadowCaster" &&
          stage !== "DepthOnly" &&
          stage !== "SSRReceiver" &&
          stage !== "SSRContributionDepth"
        ) {
          passMacros.push({ n: "ENGINE_OUTPUT_SRGB_CORRECT" });
        }
      }
      if (stage === "SSRReceiver" && context?.ssrReceiverExtraMacros?.length) {
        passMacros = [...passMacros, ...context.ssrReceiverExtraMacros];
      }
      if (stage === "Forward" && context?.ssrEnabled && context.deferredSsrForward && material) {
        const ssrIntensity =
          (material as unknown as { screenSpaceReflectionIntensity?: number }).screenSpaceReflectionIntensity ?? 0;
        const queue =
          pass._renderState?._getRenderQueueByShaderData?.(pass._renderStateDataMap, material.shaderData) ??
          ((material as { isTransparent?: boolean }).isTransparent
            ? RenderQueueType.Transparent
            : RenderQueueType.Opaque);
        const forceTerrainOpaque =
          ssrIntensity <= 0 &&
          queue !== RenderQueueType.Transparent &&
          context.includeOpaqueSsr &&
          shader.name.startsWith("Terrain/");
        if (ssrIntensity > 0 || forceTerrainOpaque) {
          const allowBilateral =
            (material as unknown as { screenSpaceReflectionBilateral?: boolean }).screenSpaceReflectionBilateral !==
            false;
          context.deferredSsrForward.push({
            shader: shader.name,
            si,
            pi,
            macros: passMacros,
            allowBilateral,
            isOpaque: queue !== RenderQueueType.Transparent
          });
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
