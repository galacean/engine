import {
  AntiAliasing,
  BackgroundMode,
  BoundingBox,
  BoundingFrustum,
  type Camera,
  DepthTextureMode,
  type Engine,
  type Entity,
  DirectLight,
  GLCapabilityType,
  Light,
  Matrix,
  PointLight,
  SpotLight,
  type Material,
  MeshRenderer,
  ParticleRenderer,
  type Primitive,
  Renderer,
  RenderQueueType,
  type RenderTarget,
  ScreenSpaceReflectionQuality,
  type ScreenSpaceReflectionSettings,
  SkinnedMeshRenderer,
  type Scene,
  Shader,
  type ShaderData,
  ShaderMacro,
  ShaderMacroCollection,
  ShaderPass,
  ShaderProperty,
  ShadowType,
  type SubPrimitive,
  SunLensFlareEffect,
  TextureFormat,
  Vector3,
  VolumetricLightQuality
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
  /**
   * Optional timer polling interval (ms) used instead of `requestAnimationFrame` when
   * `cooldownFrames === 0` and `maxFrameIntervalMs === 0` (e.g. `4` during pre-reveal startup warmup).
   * Pass `0` to force animation-frame polling.
   */
  readonly pollIntervalMilliseconds?: number;
  /** Optional wall-clock cap for startup warmup; remaining unsubmitted entries are returned in `report.deferred`. */
  readonly maxElapsedMilliseconds?: number;
  /** Minimum clean animation frames to wait between newly submitted background shader compilations. */
  readonly cooldownFrames?: number;
  /** Wall-clock rAF interval threshold (ms) above which background warmup backs off to relieve GPU-process pressure. */
  readonly maxFrameIntervalMs?: number;
  /** Backoff pause duration (ms) applied when observed rAF interval exceeds `maxFrameIntervalMs`. */
  readonly backoffMilliseconds?: number;
  /** Optional predicate (e.g. active pointer/touch drag) that temporarily pauses new background submissions. */
  readonly isPaused?: () => boolean;
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
  /** Optional world-space sun travel direction override (same convention as `SunLensFlareEffect.sunDirectionOverride`). */
  readonly sunDirectionOverride?:
    | readonly [x: number, y: number, z: number]
    | { readonly x: number; readonly y: number; readonly z: number };
  readonly volumetricLight?: boolean;
  readonly volumetricLightQuality?: number;
  readonly volumetricLightHeightFog?: boolean;
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
  /** Explicit view-culled renderers submitted only to Camera passes (Forward/DepthOnly/SSR), skipping ShadowCaster. */
  readonly additionalCameraOnlyRenderers?: readonly Renderer[];
  /** Explicit view-culled shadow-cascade renderers submitted only to ShadowCaster passes. */
  readonly additionalShadowOnlyRenderers?: readonly Renderer[];
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
  /**
   * Restrict non-global MeshRenderers to those intersecting the camera's spawn frustum for Forward/Depth/SSR passes,
   * while still keeping ShadowCaster passes for offscreen shadow casters within shadow distance so first-screen
   * reveals have zero compile misses without over-compiling behind-camera variants.
   */
  readonly onlyFrustumVisible?: boolean;
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
  /**
   * Whether to also warm the history-color SSR fallback variants (Pass 1 `BuildHiZMip0` and
   * Pass 4 `HiZTrace` without `SSR_CURRENT_FRAME_COLOR`) when `canReuseCurrentFrameColor` is true,
   * preventing synchronous mid-exploration compilation hitches if runtime falls back to history color.
   * Defaults to false (omitted from primary first-frame warmup; enabled in post-reveal background warmup).
   */
  readonly includeSsrHistoryFallback?: boolean;
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

type RuntimeShaderPass = ShaderPass & {
  _getShaderProgram(
    engine: Engine,
    macroCollection: ShaderMacroCollection,
    feedbackOrDefer?: string[] | boolean,
    primitiveOrCache?: Primitive | boolean,
    renderer?: ShaderData,
    material?: ShaderData,
    element?: ShaderData,
    camera?: Camera
  ): RuntimeShaderProgram;
};

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
const MASONRY_DITHER_MACRO = ShaderMacro.getByName("RENDERER_MASONRY_DITHER");
const GLOBAL_PROXY_DITHER_MACRO = ShaderMacro.getByName("GLOBAL_PROXY_DITHER");
const MASONRY_RESIDENT_SHADER_PATTERN = /^Masonry\/[0-9a-f]{64}$/;
const SSR_ALL_FORWARD_MACROS = new Set([
  "CAMERA_ENABLE_SSR",
  "CAMERA_SSR_VERIFY_RECEIVER_DEPTH",
  "CAMERA_SSR_BILATERAL_SAMPLE",
  "SSR_PACKED_DEPTH_RG8",
  "SSR_PACKED_NORMAL_OCT8",
  "SSR_PACKED_HDR_REINHARD"
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

interface WebGPUWarmupTarget {
  readonly primitive?: Primitive;
  readonly subPrimitives?: readonly SubPrimitive[];
  readonly material?: Material;
  readonly renderer?: Renderer;
  readonly camera: Camera;
  readonly renderToTexture?: boolean;
  readonly frontFaceInvert: boolean;
  readonly isOverlay?: boolean;
  readonly stage: string;
}

interface WebGPUWarmupRegistry {
  readonly byVariantKey: Map<string, WebGPUWarmupTarget[]>;
  readonly byPassKey: Map<string, WebGPUWarmupTarget[]>;
  readonly targetSignatures: Map<string, Set<string>>;
}

const webgpuWarmupRegistries = new WeakMap<Engine, WebGPUWarmupRegistry>();

function isWebGPUEngine(engine: Engine): boolean {
  return (engine as unknown as { _hardwareRenderer?: { backend?: string } })._hardwareRenderer?.backend === "webgpu";
}

function getOrCreateWebGPUWarmupRegistry(engine: Engine): WebGPUWarmupRegistry {
  let reg = webgpuWarmupRegistries.get(engine);
  if (!reg) {
    reg = {
      byVariantKey: new Map(),
      byPassKey: new Map(),
      targetSignatures: new Map()
    };
    webgpuWarmupRegistries.set(engine, reg);
  }
  return reg;
}

function webGPUWarmupTargetSignature(target: WebGPUWarmupTarget): string {
  const inputKey = target.primitive?._getShaderInputs?.()?.key ?? "";
  const topologies = target.subPrimitives?.map((s) => s.topology).join(",") ?? "";
  const matId = target.material ? String((target.material as unknown as { instanceId?: number }).instanceId ?? 0) : "";
  return `${inputKey}|${topologies}|${matId}|${target.frontFaceInvert ? 1 : 0}|${target.renderToTexture === undefined ? "u" : target.renderToTexture ? 1 : 0}|${target.isOverlay ? 1 : 0}|${target.stage}`;
}

function recordWebGPUWarmupTarget(
  registry: WebGPUWarmupRegistry | undefined,
  entry: SeedWorldShaderVariantEntry,
  target: WebGPUWarmupTarget | undefined
): void {
  if (!registry || !target) return;
  const sig = webGPUWarmupTargetSignature(target);
  const variantKey = seedWorldShaderVariantKey(normalizeSeedWorldShaderVariants([entry])[0]!);
  let variantSigs = registry.targetSignatures.get(variantKey);
  if (!variantSigs) {
    variantSigs = new Set();
    registry.targetSignatures.set(variantKey, variantSigs);
  }
  if (!variantSigs.has(sig)) {
    variantSigs.add(sig);
    let list = registry.byVariantKey.get(variantKey);
    if (!list) {
      list = [];
      registry.byVariantKey.set(variantKey, list);
    }
    list.push(target);
  }
  const passKey = `${entry.shader}|${entry.si}|${entry.pi}`;
  let passSigs = registry.targetSignatures.get(`pass:${passKey}`);
  if (!passSigs) {
    passSigs = new Set();
    registry.targetSignatures.set(`pass:${passKey}`, passSigs);
  }
  if (!passSigs.has(sig) && passSigs.size < 8) {
    passSigs.add(sig);
    let passList = registry.byPassKey.get(passKey);
    if (!passList) {
      passList = [];
      registry.byPassKey.set(passKey, passList);
    }
    passList.push(target);
  }
}

export function hasParallelShaderCompile(engine: Engine): boolean {
  if (isWebGPUEngine(engine)) return true;
  const gl = (engine as unknown as { _hardwareRenderer?: { gl?: WebGL2RenderingContext } })._hardwareRenderer?.gl;
  return Boolean(gl?.getExtension?.("KHR_parallel_shader_compile"));
}

async function warmupSeedWorldShaderVariantsWebGPU(
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
  const maximumPendingPipelines = Math.max(1, Math.floor(options.maximumPendingPrograms ?? 28));
  const cooldownFrames = Math.max(0, Math.floor(options.cooldownFrames ?? 0));
  const maxFrameIntervalMs =
    options.maxFrameIntervalMs !== undefined && Number.isFinite(options.maxFrameIntervalMs)
      ? Math.max(0, options.maxFrameIntervalMs)
      : 0;
  const backoffMilliseconds = Math.max(0, options.backoffMilliseconds ?? 250);

  let frameStartedAt = startedAt;
  let compiled = 0;
  let longestVariantMilliseconds = 0;
  let reportedCompleted = -1;
  let cooldownRemaining = 0;
  let backoffUntil = 0;

  const reportProgress = () => {
    const completed = compiled + issues.length;
    if (completed !== reportedCompleted) {
      reportedCompleted = completed;
      options.onProgress?.(completed, entries.length);
    }
  };
  const canSubmitNow = (): boolean => {
    if (options.isPaused?.()) return false;
    if (cooldownRemaining > 0) return false;
    if (backoffUntil > 0 && performance.now() < backoffUntil) return false;
    return true;
  };
  const yieldFrame = async () => {
    reportProgress();
    const beforeYield = performance.now();
    if (cooldownFrames === 0 && maxFrameIntervalMs === 0) {
      await nextTimerTick(Math.max(1, Math.floor(options.pollIntervalMilliseconds ?? 4)));
    } else {
      await nextAnimationFrame();
    }
    options.signal?.throwIfAborted();
    const now = performance.now();
    frameStartedAt = now;
    if (maxFrameIntervalMs > 0 && now - beforeYield > maxFrameIntervalMs) {
      backoffUntil = Math.max(backoffUntil, now + backoffMilliseconds);
    }
    if (cooldownRemaining > 0) cooldownRemaining--;
  };

  const registry = webgpuWarmupRegistries.get(engine);
  const allocatedTargets: RenderTarget[] = [];
  const rtPool = (
    engine as unknown as {
      _renderTargetPool?: {
        allocateRenderTarget: (
          width: number,
          height: number,
          colorFormat: TextureFormat | null,
          depthFormat: TextureFormat | null,
          needDepthTexture: boolean,
          mipMap: boolean,
          isSRGB: boolean,
          msaaSamples: number
        ) => RenderTarget;
        freeRenderTarget: (rt: RenderTarget) => void;
      };
    }
  )._renderTargetPool;
  const maxAntiAliasing =
    (engine as unknown as { _hardwareRenderer?: { capability?: { maxAntiAliasing?: number } } })._hardwareRenderer
      ?.capability?.maxAntiAliasing ?? 1;

  let shadowRT: RenderTarget | null | undefined;
  let depthOnlyRT: RenderTarget | null | undefined;
  let ldrNoDepthRT: RenderTarget | null | undefined;
  const forwardTargetsByCamera = new WeakMap<Camera, RenderTarget | null>();
  const hdrNoDepthTargetsByCamera = new WeakMap<Camera, RenderTarget | null>();

  const allocateTempRT = (
    colorFormat: TextureFormat | null,
    depthFormat: TextureFormat | null,
    needDepthTexture: boolean,
    isSRGB: boolean,
    msaaSamples: number
  ): RenderTarget | null => {
    if (!rtPool) return null;
    try {
      const rt = rtPool.allocateRenderTarget(
        4,
        4,
        colorFormat,
        depthFormat,
        needDepthTexture,
        false,
        isSRGB,
        msaaSamples
      );
      allocatedTargets.push(rt);
      return rt;
    } catch {
      return null;
    }
  };

  const getTargetsForStage = (target: WebGPUWarmupTarget): readonly (RenderTarget | null)[] => {
    const cam = target.camera as unknown as {
      renderTarget?: RenderTarget | null;
      msaaSamples?: number;
      _isIndependentCanvasEnabled?: () => boolean;
      _getInternalColorTextureFormat?: () => TextureFormat;
      _isInternalFormatHDR?: () => boolean;
      _renderPipeline?: { _allocatePrewarmInternalColorTarget?: (msaa: number) => RenderTarget };
    };
    if (target.isOverlay || target.renderToTexture === false) {
      return [null];
    }
    if (target.stage === "ShadowCaster") {
      if (shadowRT === undefined) {
        shadowRT = allocateTempRT(null, TextureFormat.Depth16, true, false, 1);
      }
      return shadowRT ? [shadowRT] : [];
    }
    if (target.stage === "DepthOnly") {
      if (depthOnlyRT === undefined) {
        depthOnlyRT = allocateTempRT(null, TextureFormat.Depth24, true, false, 1);
      }
      return depthOnlyRT ? [depthOnlyRT] : [];
    }
    if (target.stage === "SSRReceiver" || target.stage === "SSRContributionDepth") {
      return [];
    }
    const isBlitOrPost = target.stage === "Forward" && target.renderer === undefined && target.renderToTexture === true;
    if (isBlitOrPost) {
      const rts: (RenderTarget | null)[] = [];
      if (!hdrNoDepthTargetsByCamera.has(target.camera)) {
        const fmt = cam._getInternalColorTextureFormat?.() ?? TextureFormat.R8G8B8A8_UNorm;
        const isSRGB = !(cam._isInternalFormatHDR?.() ?? false);
        hdrNoDepthTargetsByCamera.set(target.camera, allocateTempRT(fmt, null, false, isSRGB, 1));
      }
      const hdrRt = hdrNoDepthTargetsByCamera.get(target.camera);
      if (hdrRt) rts.push(hdrRt);
      if (ldrNoDepthRT === undefined) {
        ldrNoDepthRT = allocateTempRT(TextureFormat.R8G8B8A8_UNorm, null, false, false, 1);
      }
      if (ldrNoDepthRT && ldrNoDepthRT !== hdrRt) rts.push(ldrNoDepthRT);
      return rts;
    }
    // Forward / Sky / Particle renderers targeting the camera's internal color target (or swapchain).
    if (cam.renderTarget) {
      return [cam.renderTarget];
    }
    if (cam._isIndependentCanvasEnabled?.()) {
      if (!forwardTargetsByCamera.has(target.camera)) {
        const msaa = Math.min(cam.msaaSamples ?? 1, maxAntiAliasing);
        let rt: RenderTarget | null = null;
        try {
          rt = cam._renderPipeline?._allocatePrewarmInternalColorTarget?.(msaa) ?? null;
          if (rt) allocatedTargets.push(rt);
        } catch {
          rt = null;
        }
        forwardTargetsByCamera.set(target.camera, rt);
      }
      const fwd = forwardTargetsByCamera.get(target.camera);
      return fwd ? [fwd] : [null];
    }
    return [null];
  };

  const inFlight = new Set<Promise<void>>();
  let nextEntry = 0;
  let budgetExceeded = false;

  try {
    while (nextEntry < entries.length && !budgetExceeded) {
      options.signal?.throwIfAborted();
      if (!canSubmitNow() || inFlight.size >= maximumPendingPipelines) {
        if (inFlight.size >= maximumPendingPipelines) {
          await Promise.race(inFlight);
        } else {
          await yieldFrame();
        }
        continue;
      }
      if (
        maxElapsedMilliseconds !== undefined &&
        nextEntry > 0 &&
        performance.now() - startedAt >= maxElapsedMilliseconds
      ) {
        budgetExceeded = true;
        break;
      }
      const entry = entries[nextEntry++]!;
      const key = seedWorldShaderVariantKey(entry);
      const shader = Shader.find(entry.shader);
      if (!shader) {
        issues.push({ key, reason: "missing-shader", message: `Shader '${entry.shader}' is not registered.` });
        continue;
      }
      const pass = shader.subShaders[entry.si]?.passes[entry.pi] as RuntimeShaderPass | undefined;
      if (!pass) {
        issues.push({
          key,
          reason: "missing-pass",
          message: `Shader '${entry.shader}' has no subShader ${entry.si}, pass ${entry.pi}.`
        });
        continue;
      }
      const macros = new ShaderMacroCollection();
      for (const macro of entry.macros) {
        macros.enable(macro.v === undefined ? ShaderMacro.getByName(macro.n) : ShaderMacro.getByName(macro.n, macro.v));
      }
      const variantStartedAt = performance.now();
      try {
        const passKey = `${entry.shader}|${entry.si}|${entry.pi}`;
        const targets = registry?.byVariantKey.get(key) ?? registry?.byPassKey.get(passKey);
        if (targets && targets.length > 0 && !options.cacheOnly) {
          let validAny = false;
          for (let ti = 0; ti < targets.length; ti++) {
            const target = targets[ti]!;
            const program = pass._getShaderProgram(
              engine,
              macros,
              undefined,
              target.primitive,
              target.renderer?.shaderData,
              target.material?.shaderData,
              undefined,
              target.camera
            );
            if (!program.isValid) continue;
            validAny = true;
            const platform = (
              program as unknown as {
                _platformProgram?: {
                  prewarm?: (
                    primitive: Primitive,
                    sub: SubPrimitive,
                    rt: RenderTarget | null,
                    state: unknown,
                    frontFaceInvert: boolean
                  ) => Promise<void>;
                };
              }
            )._platformProgram;
            if (platform?.prewarm && target.primitive && target.subPrimitives?.length) {
              const state = (
                pass as unknown as {
                  _renderState?: {
                    _resolve?: (eng: Engine, map: unknown, matData?: ShaderData) => unknown;
                  };
                  _renderStateDataMap?: unknown;
                }
              )._renderState?._resolve?.(engine, pass._renderStateDataMap, target.material?.shaderData);
              if (state) {
                const renderTargets = getTargetsForStage(target);
                const seenTopologies = new Set<number>();
                for (let si = 0; si < target.subPrimitives.length; si++) {
                  const sub = target.subPrimitives[si]!;
                  if (seenTopologies.has(sub.topology)) continue;
                  seenTopologies.add(sub.topology);
                  for (let ri = 0; ri < renderTargets.length; ri++) {
                    const rt = renderTargets[ri]!;
                    const task = Promise.resolve()
                      .then(() => platform.prewarm!(target.primitive!, sub, rt, state, target.frontFaceInvert))
                      .catch(() => {
                        // Speculative RT attachment mismatch must not abort valid shader warmup.
                      });
                    inFlight.add(task);
                    void task.finally(() => inFlight.delete(task));
                  }
                }
              }
            }
          }
          if (validAny) {
            compiled++;
          } else {
            issues.push({
              key,
              reason: "invalid-program",
              message: "WebGPU shader program compiled to an invalid program."
            });
          }
        } else {
          const program = pass._getShaderProgram(engine, macros, undefined, options.cacheOnly);
          if (program.isValid) {
            compiled++;
          } else {
            issues.push({
              key,
              reason: "invalid-program",
              message: "WebGPU shader program compiled to an invalid program."
            });
          }
        }
        if (cooldownFrames > 0) cooldownRemaining = Math.max(cooldownRemaining, cooldownFrames);
      } catch (error) {
        issues.push({
          key,
          reason: "compile-error",
          message: error instanceof Error ? error.message : String(error)
        });
      } finally {
        longestVariantMilliseconds = Math.max(longestVariantMilliseconds, performance.now() - variantStartedAt);
      }
      if (performance.now() - frameStartedAt >= frameBudgetMilliseconds) {
        await yieldFrame();
      }
    }
    if (inFlight.size > 0) {
      await Promise.all(inFlight);
    }
  } finally {
    if (rtPool) {
      for (let i = 0; i < allocatedTargets.length; i++) {
        rtPool.freeRenderTarget(allocatedTargets[i]!);
      }
    }
  }

  reportProgress();
  const deferred = nextEntry < entries.length ? Object.freeze(entries.slice(nextEntry)) : undefined;
  const report: SeedWorldShaderWarmupReport = Object.freeze({
    requested: entries.length,
    compiled,
    parallelCompileSupported: true,
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

export async function warmupSeedWorldShaderVariants(
  engine: Engine,
  sourceEntries: readonly SeedWorldShaderVariantEntry[],
  options: SeedWorldShaderWarmupOptions = {}
): Promise<SeedWorldShaderWarmupReport> {
  if (isWebGPUEngine(engine)) {
    return warmupSeedWorldShaderVariantsWebGPU(engine, sourceEntries, options);
  }
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
  const maximumPendingPrograms = Math.max(1, Math.floor(options.maximumPendingPrograms ?? 28));
  const cooldownFrames = Math.max(0, Math.floor(options.cooldownFrames ?? 0));
  const maxFrameIntervalMs =
    options.maxFrameIntervalMs !== undefined && Number.isFinite(options.maxFrameIntervalMs)
      ? Math.max(0, options.maxFrameIntervalMs)
      : 0;
  const backoffMilliseconds = Math.max(0, options.backoffMilliseconds ?? 250);
  const parallelCompileSupported = hasParallelShaderCompile(engine);
  const defaultPollIntervalMs = parallelCompileSupported && cooldownFrames === 0 && maxFrameIntervalMs === 0 ? 4 : 0;
  const rawPollIntervalMs = options.pollIntervalMilliseconds ?? defaultPollIntervalMs;
  const pollIntervalMilliseconds =
    Number.isFinite(rawPollIntervalMs) && rawPollIntervalMs > 0 ? Math.max(1, Math.floor(rawPollIntervalMs)) : 0;
  const useTimerPoll = pollIntervalMilliseconds > 0 && cooldownFrames === 0 && maxFrameIntervalMs === 0;
  let cooldownRemaining = 0;
  let backoffUntil = 0;
  let reportedCompleted = -1;
  const reportProgress = () => {
    const completed = compiled + issues.length;
    if (completed !== reportedCompleted) {
      reportedCompleted = completed;
      options.onProgress?.(completed, entries.length);
    }
  };
  const canSubmitNow = (): boolean => {
    if (options.isPaused?.()) return false;
    if (cooldownRemaining > 0) return false;
    if (backoffUntil > 0 && performance.now() < backoffUntil) return false;
    return true;
  };
  const yieldFrame = async () => {
    reportProgress();
    const beforeYield = performance.now();
    if (useTimerPoll) {
      await nextTimerTick(pollIntervalMilliseconds);
    } else {
      await nextAnimationFrame();
    }
    options.signal?.throwIfAborted();
    const now = performance.now();
    const frameInterval = now - beforeYield;
    frameStartedAt = now;
    if (maxFrameIntervalMs > 0 && frameInterval > maxFrameIntervalMs) {
      backoffUntil = Math.max(backoffUntil, now + backoffMilliseconds);
    }
    if (cooldownRemaining > 0) cooldownRemaining--;
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
      const program = (
        feedbackVaryings
          ? alias.pass._getShaderProgram(engine, macros, feedbackVaryings, options.cacheOnly, true)
          : alias.pass._getShaderProgram(engine, macros, true, options.cacheOnly)
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
        if (cooldownFrames > 0) cooldownRemaining = Math.max(cooldownRemaining, cooldownFrames);
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
    while (nextEntry < entries.length && !budgetExceeded && pending.size < maximumPendingPrograms && canSubmitNow()) {
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
      if (state.settled && !budgetExceeded && nextEntry < entries.length && canSubmitNow()) break;
    }
    if (!budgetExceeded && nextEntry < entries.length && pending.size < maximumPendingPrograms && canSubmitNow()) {
      continue;
    }
    if (pending.size > 0 || (!budgetExceeded && nextEntry < entries.length)) await yieldFrame();
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
  const forcedCameraOnlyRenderers = new Set<Renderer>(options.additionalCameraOnlyRenderers ?? []);
  const forcedShadowOnlyRenderers = new Set<Renderer>(options.additionalShadowOnlyRenderers ?? []);
  const forcedInstancedRenderers = new Set<Renderer>(options.additionalInstancedRenderers ?? []);
  for (const r of forcedCameraOnlyRenderers) forcedRenderers.add(r);
  for (const r of forcedShadowOnlyRenderers) forcedRenderers.add(r);
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
  if (options.additionalCameraOnlyRenderers?.length) {
    renderers.push(...options.additionalCameraOnlyRenderers);
  }
  if (options.additionalShadowOnlyRenderers?.length) {
    renderers.push(...options.additionalShadowOnlyRenderers);
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
        backend?: string;
        supportsRendering?: boolean;
        supportsTransformFeedback?: boolean;
        canIUse?: (cap: GLCapabilityType) => boolean;
        capability?: { maxDrawBuffers?: number };
      };
    }
  )._hardwareRenderer;
  const isWebGPU = runtimeHardware?.backend === "webgpu";
  const supportsRendering = runtimeHardware?.supportsRendering !== false;
  const supportsTransformFeedback = runtimeHardware?.supportsTransformFeedback ?? !isWebGPU;
  const webgpuRegistry = isWebGPU ? getOrCreateWebGPUWarmupRegistry(engine) : undefined;
  const { depthPrepassEnabled, forwardDepthResolveEnabled } = resolveDepthMode(engine, scene, camera);
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
  const hardwareSupportsSsr = supportsRendering && (runtimeHardware?.capability?.maxDrawBuffers ?? 2) >= 2;
  const ssrEnabled = ssrCameraEnabled && ssrSettingsValid && hardwareSupportsSsr;
  const ssrQuality = rawSsrSettings?.quality ?? ScreenSpaceReflectionQuality.Medium;
  const ssrUseLinearTrace = Boolean(rawSsrSettings?.useLinearTrace);
  const ssrMaxRoughness = rawSsrSettings?.maxRoughness ?? 0.6;
  const hwFormatSupport = (
    runtimeHardware as unknown as { supportsRenderTargetColorFormat?: (format: TextureFormat) => boolean } | undefined
  )?.supportsRenderTargetColorFormat;
  const supportsR16Float = hwFormatSupport ? hwFormatSupport.call(runtimeHardware, TextureFormat.R16_SFloat) : true;
  const supportsRGBA16 = hwFormatSupport
    ? hwFormatSupport.call(runtimeHardware, TextureFormat.R16G16B16A16_SFloat)
    : true;
  const ssrPackedDepthRG8 = ssrEnabled && !supportsR16Float;
  const ssrIsHDR = Boolean((camera as unknown as { enableHDR?: boolean }).enableHDR);
  // Matches ScreenSpaceReflectionPass._detectCapabilities: Low/Medium keep compact RGBA8 + Oct8 + Reinhard HDR;
  // only High/XHigh request RGBA16F normal/color precision.
  const ssrHighPrecisionNormals =
    ssrQuality === ScreenSpaceReflectionQuality.High || ssrQuality === ScreenSpaceReflectionQuality.XHigh;
  const ssrPackedNormalOct8 = ssrEnabled && !(ssrHighPrecisionNormals && supportsRGBA16);
  const ssrPackedHDRReinhard = ssrEnabled && ssrIsHDR && !(ssrHighPrecisionNormals && supportsRGBA16);
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
    supportsTransformFeedback,
    recordWebGPUWarmupTarget: webgpuRegistry
      ? (entry, target) => recordWebGPUWarmupTarget(webgpuRegistry, entry, target)
      : undefined,
    includeOpaqueSsr: options.includeOpaqueScreenSpaceReflection === true,
    skipNonSsrForwardForReceivers: Boolean(options.onlyFrustumVisible) && ssrEnabled,
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
  const gpuInstancedOnlyMacroVariants: readonly (readonly SeedWorldShaderVariantMacro[])[] = Object.freeze(
    authoredMacroVariants.map((set) => Object.freeze([...set, { n: "RENDERER_GPU_INSTANCE" }]))
  );
  const gpuInstancedMacroVariants: readonly (readonly SeedWorldShaderVariantMacro[])[] =
    options.includeGpuInstancing === false
      ? authoredMacroVariants
      : Object.freeze([...authoredMacroVariants, ...gpuInstancedOnlyMacroVariants]);

  const uniqueRenderers = [...new Set(renderers)];
  let cameraFrustum: BoundingFrustum | undefined;
  let cameraWorldPosition: Vector3 | undefined;
  const shadowDistance =
    Math.max(0, Number((scene as unknown as { shadowDistance?: number }).shadowDistance ?? 120)) + 32;
  if (options.onlyFrustumVisible && camera.entity?.transform) {
    const proj = (camera as unknown as { projectionMatrix?: Matrix }).projectionMatrix;
    const view = (camera as unknown as { viewMatrix?: Matrix }).viewMatrix;
    if (proj && view) {
      const vp = new Matrix();
      Matrix.multiply(proj, view, vp);
      cameraFrustum = new BoundingFrustum();
      cameraFrustum.calculateFromMatrix(vp);
      cameraWorldPosition = camera.entity.transform.worldPosition;
    }
  }
  // Finite Water/* chunks (Ocean/Lake/River) participate in frustum culling when they expose
  // valid world bounds so offscreen water bodies and unused SSR passes defer to post-ready warmup.
  // WaterFar/* remains global because it spans the distant horizon ring.
  const isGlobalWarmupShader = (shaderName: string): boolean =>
    shaderName.startsWith("Sky/") ||
    shaderName === "Terrain/Terrain" ||
    shaderName.startsWith("WaterFar/") ||
    shaderName.startsWith("AIWorld/") ||
    shaderName.startsWith("World/") ||
    shaderName.startsWith("SeedWorld/") ||
    shaderName.startsWith("PostProcess/") ||
    shaderName.startsWith("Blit/") ||
    shaderName.startsWith("2D/");
  const isBoxWithinShadowDistance = (box: BoundingBox, origin: Vector3, maxDist: number): boolean => {
    const dx = origin.x < box.min.x ? box.min.x - origin.x : origin.x > box.max.x ? origin.x - box.max.x : 0;
    const dy = origin.y < box.min.y ? box.min.y - origin.y : origin.y > box.max.y ? origin.y - box.max.y : 0;
    const dz = origin.z < box.min.z ? box.min.z - origin.z : origin.z > box.max.z ? origin.z - box.max.z : 0;
    return dx * dx + dy * dy + dz * dz <= maxDist * maxDist;
  };
  const hasFiniteBoundedBox = (box: BoundingBox | undefined, maxExtent = 1000): box is BoundingBox => {
    if (!box) return false;
    const { min, max } = box;
    if (
      !Number.isFinite(min.x) ||
      !Number.isFinite(min.y) ||
      !Number.isFinite(min.z) ||
      !Number.isFinite(max.x) ||
      !Number.isFinite(max.y) ||
      !Number.isFinite(max.z)
    ) {
      return false;
    }
    const ex = max.x - min.x;
    const ey = max.y - min.y;
    const ez = max.z - min.z;
    return ex >= 0 && ey >= 0 && ez >= 0 && ex + ey + ez > 1e-4 && Math.max(ex, ey, ez) < maxExtent;
  };
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
  type VisibleBatchBucket = { readonly leader: Renderer; count: number };
  type PriorityBatchMap = Map<number, Map<string, VisibleBatchBucket[]>>;
  const visibleBatchBuckets =
    options.onlySharedMeshGpuInstancing && cameraFrustum ? new Map<object, Map<object, PriorityBatchMap>>() : undefined;
  const rendererPriority = (sourceRenderer: Renderer): number =>
    Number((sourceRenderer as unknown as { priority?: number }).priority ?? 0);
  const meshHasSingleSubMesh = (mesh: unknown): boolean => {
    const subMeshes = (mesh as { subMeshes?: readonly unknown[] } | undefined)?.subMeshes;
    return !Array.isArray(subMeshes) || subMeshes.length === 1;
  };
  const batchSignatureForRenderer = (sourceRenderer: Renderer): string => {
    const rMacros = (sourceRenderer.shaderData as unknown as RuntimeShaderData)._macroCollection;
    const receiveShadows = Boolean((sourceRenderer as unknown as { receiveShadows?: boolean }).receiveShadows);
    const layer = Number((sourceRenderer.entity as unknown as { layer?: number }).layer ?? 0);
    const priority = rendererPriority(sourceRenderer);
    const transform =
      (
        sourceRenderer as unknown as {
          _entity?: { transform?: { _isFrontFaceInvert?: () => boolean } };
          entity?: { transform?: { _isFrontFaceInvert?: () => boolean } };
        }
      )._entity?.transform ??
      (sourceRenderer.entity as unknown as { transform?: { _isFrontFaceInvert?: () => boolean } })?.transform;
    const frontFaceInvert =
      typeof transform?._isFrontFaceInvert === "function" ? (transform._isFrontFaceInvert() ? 1 : 0) : 0;
    return `${sourceRenderer.castShadows ? 1 : 0}|${receiveShadows ? 1 : 0}|${layer}|${priority}|${frontFaceInvert}|${shaderMacroCollectionKey(rMacros)}`;
  };
  const rendererBatchSharedMatches = (a: Renderer, b: Renderer): boolean => {
    const fn = (a.shaderData as unknown as { _matchesRendererBatchShared?: (other: unknown) => boolean })
      ._matchesRendererBatchShared;
    return typeof fn === "function" ? fn.call(a.shaderData, b.shaderData) : true;
  };
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
      if (options.onlyEnabledRenderers && !sourceRenderer.enabled && !forcedRenderers.has(sourceRenderer)) {
        const keepActiveResidentMasonry =
          sourceRenderer instanceof MeshRenderer &&
          sourceRenderer.entity.isActiveInHierarchy &&
          sourceRenderer
            .getMaterials()
            .some(
              (m) =>
                m &&
                !m.destroyed &&
                m.shader &&
                !m.shader.destroyed &&
                MASONRY_RESIDENT_SHADER_PATTERN.test(m.shader.name)
            );
        if (!keepActiveResidentMasonry) continue;
      }
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
      // Only count real, active, enabled, non-forced, frustum-visible single-subMesh MeshRenderers
      // into visibleBatchBuckets so forced/inactive/multi-subMesh renderers never inflate visible
      // batch counts or suppress non-instanced primary variants.
      let countIntoVisibleBatch = false;
      if (
        visibleBatchBuckets &&
        cameraFrustum &&
        !forcedRenderers.has(sourceRenderer) &&
        sourceRenderer.entity.isActiveInHierarchy &&
        sourceRenderer.enabled &&
        meshHasSingleSubMesh(mesh)
      ) {
        const rawBounds = (sourceRenderer as unknown as { bounds?: BoundingBox }).bounds;
        if (hasFiniteBoundedBox(rawBounds, 10000)) {
          countIntoVisibleBatch = cameraFrustum.intersectsBox(rawBounds);
        }
      }
      const batchPriority = countIntoVisibleBatch ? rendererPriority(sourceRenderer) : 0;
      const batchSig = countIntoVisibleBatch ? batchSignatureForRenderer(sourceRenderer) : "";
      const seenVisibleMaterials = countIntoVisibleBatch ? new Set<object>() : undefined;
      for (const material of materials) {
        if (!material || material.destroyed || material.shader.destroyed) continue;
        materialMap.set(material, (materialMap.get(material) ?? 0) + 1);
        if (visibleBatchBuckets && countIntoVisibleBatch && !seenVisibleMaterials!.has(material)) {
          seenVisibleMaterials!.add(material);
          let matBatches = visibleBatchBuckets.get(mesh);
          if (!matBatches) {
            matBatches = new Map<object, PriorityBatchMap>();
            visibleBatchBuckets.set(mesh, matBatches);
          }
          let priorityMap = matBatches.get(material);
          if (!priorityMap) {
            priorityMap = new Map<number, Map<string, VisibleBatchBucket[]>>();
            matBatches.set(material, priorityMap);
          }
          let sigMap = priorityMap.get(batchPriority);
          if (!sigMap) {
            sigMap = new Map<string, VisibleBatchBucket[]>();
            priorityMap.set(batchPriority, sigMap);
          }
          let buckets = sigMap.get(batchSig);
          if (!buckets) {
            buckets = [];
            sigMap.set(batchSig, buckets);
          }
          let matchedBucket: VisibleBatchBucket | undefined;
          for (let bi = 0; bi < buckets.length; bi++) {
            if (rendererBatchSharedMatches(buckets[bi]!.leader, sourceRenderer)) {
              matchedBucket = buckets[bi]!;
              break;
            }
          }
          if (matchedBucket) matchedBucket.count++;
          else buckets.push({ leader: sourceRenderer, count: 1 });
        }
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
    if (options.onlyEnabledRenderers && !sourceRenderer.enabled && !forcedRenderers.has(sourceRenderer)) {
      // Newly flushed resident Masonry/<sha256> unitLod draws sit under an active building root
      // (`isActiveInHierarchy === true`) with `renderer.enabled === false` until the first engine
      // `syncCamera()` tick populates unit-LOD counts. Retain active resident masonry renderers
      // so portrait/wide spawn views never hit a frame-0 reveal compile miss.
      const keepActiveResidentMasonry =
        sourceRenderer instanceof MeshRenderer &&
        sourceRenderer.entity.isActiveInHierarchy &&
        sourceRenderer
          .getMaterials()
          .some(
            (m) =>
              m &&
              !m.destroyed &&
              m.shader &&
              !m.shader.destroyed &&
              MASONRY_RESIDENT_SHADER_PATTERN.test(m.shader.name)
          );
      if (!keepActiveResidentMasonry) continue;
    }
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
      if (
        supportsRendering &&
        supportsTransformFeedback &&
        (useTransformFeedback || isWindParticle || isSubEmitterTarget)
      ) {
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
    const isWaterMaterial = materials.some(
      (m) => m && !m.destroyed && m.shader && !m.shader.destroyed && m.shader.name.startsWith("Water/")
    );
    const isSupportSurfaceMaterial = materials.some(
      (m) => m && !m.destroyed && m.shader && !m.shader.destroyed && m.shader.name === "Masonry/SupportSurface"
    );
    let frustumShadowOnly = forcedShadowOnlyRenderers.has(sourceRenderer);
    if (
      !frustumShadowOnly &&
      cameraFrustum &&
      !forcedRenderers.has(sourceRenderer) &&
      !ownsInstanceGeometry &&
      isMesh &&
      !materials.some(
        (m) =>
          m &&
          !m.destroyed &&
          m.shader &&
          !m.shader.destroyed &&
          (isGlobalWarmupShader(m.shader.name) ||
            (m.shader.name.startsWith("Masonry/") && m.shader.name !== "Masonry/SupportSurface"))
      )
    ) {
      const rawBounds = (sourceRenderer as unknown as { bounds?: BoundingBox }).bounds;
      const maxBoxExtent = isWaterMaterial ? 10000 : 1000;
      if (hasFiniteBoundedBox(rawBounds, maxBoxExtent)) {
        // Pad animated SkinnedMeshRenderer, displaced Water/*, and LOD1 SupportSurface bounds slightly
        // so boundary motion / waves during orb.reveal never cause a first-frame compile miss.
        const needsPadding =
          sourceRenderer instanceof SkinnedMeshRenderer || isWaterMaterial || isSupportSurfaceMaterial;
        const testBounds = needsPadding
          ? new BoundingBox(
              new Vector3(rawBounds.min.x - 2, rawBounds.min.y - 1, rawBounds.min.z - 2),
              new Vector3(rawBounds.max.x + 2, rawBounds.max.y + 1, rawBounds.max.z + 2)
            )
          : rawBounds;
        if (!cameraFrustum.intersectsBox(testBounds)) {
          const canCastShadowInRange =
            Boolean(scene.castShadows) &&
            (sourceRenderer.castShadows ||
              materials.some((m) => m && !m.destroyed && m.shader?.name === "Masonry/GlobalProxyShadowOnly")) &&
            (!cameraWorldPosition || isBoxWithinShadowDistance(testBounds, cameraWorldPosition, shadowDistance));
          if (!canCastShadowInRange) continue;
          frustumShadowOnly = true;
        }
      }
    }
    const sourcePriority = visibleBatchBuckets ? rendererPriority(sourceRenderer) : 0;
    const sourceBatchSig = visibleBatchBuckets ? batchSignatureForRenderer(sourceRenderer) : "";
    const sourceBounds = visibleBatchBuckets
      ? (sourceRenderer as unknown as { bounds?: BoundingBox }).bounds
      : undefined;
    const sourceHasFiniteBounds = visibleBatchBuckets ? hasFiniteBoundedBox(sourceBounds, 10000) : false;
    const sourceIsSingleSubMesh = visibleBatchBuckets ? meshHasSingleSubMesh(renderer.mesh) : false;
    const isRealVisibleBatchMember = Boolean(
      visibleBatchBuckets &&
        !forcedRenderers.has(sourceRenderer) &&
        !forcedInstancedRenderers.has(sourceRenderer) &&
        !frustumShadowOnly &&
        sourceRenderer.entity.isActiveInHierarchy &&
        sourceRenderer.enabled &&
        sourceHasFiniteBounds &&
        sourceIsSingleSubMesh
    );
    const rendererBaseTarget = webgpuRegistry
      ? (() => {
          const rendererPrimitive: Primitive | undefined = isMesh
            ? (renderer.mesh as unknown as { _primitive?: Primitive } | undefined)?._primitive
            : (sourceRenderer as unknown as { generator?: { _primitive?: Primitive } }).generator?._primitive;
          const rendererSubPrimitives: readonly SubPrimitive[] | undefined = isMesh
            ? (renderer.mesh as unknown as { subMeshes?: readonly SubPrimitive[] } | undefined)?.subMeshes
            : (() => {
                const sp = (sourceRenderer as unknown as { generator?: { _subPrimitive?: SubPrimitive } }).generator
                  ?._subPrimitive;
                return sp ? [sp] : undefined;
              })();
          const transformEntity = (
            sourceRenderer as unknown as { _transformEntity?: { transform?: { _isFrontFaceInvert?: () => boolean } } }
          )._transformEntity;
          const rendererFrontFaceInvert =
            typeof transformEntity?.transform?._isFrontFaceInvert === "function"
              ? transformEntity.transform._isFrontFaceInvert()
              : false;
          return {
            primitive: rendererPrimitive,
            subPrimitives: rendererSubPrimitives,
            renderer: sourceRenderer,
            camera,
            frontFaceInvert: rendererFrontFaceInvert,
            renderToTexture
          };
        })()
      : undefined;
    for (const material of materials) {
      if (!material || material.destroyed || material.shader.destroyed) continue;
      // Masonry shaders own their custom instance/packed vertex streams and never enter the generic UBO batcher.
      const totalSharedCount =
        renderer.mesh !== undefined ? (sharedMeshMaterialCounts?.get(renderer.mesh)?.get(material) ?? 0) : 0;
      let visibleBatchCount = totalSharedCount;
      let distinctBucketsForSortKey = 0;
      if (isRealVisibleBatchMember && visibleBatchBuckets && renderer.mesh !== undefined) {
        const sigMap = visibleBatchBuckets.get(renderer.mesh)?.get(material)?.get(sourcePriority);
        visibleBatchCount = 0;
        if (sigMap) {
          for (const bucketList of sigMap.values()) {
            distinctBucketsForSortKey += bucketList.length;
          }
          const buckets = sigMap.get(sourceBatchSig);
          if (buckets) {
            for (let bi = 0; bi < buckets.length; bi++) {
              if (rendererBatchSharedMatches(buckets[bi]!.leader, sourceRenderer)) {
                visibleBatchCount = buckets[bi]!.count;
                break;
              }
            }
          }
        }
      }
      const useVisibleBatchCheck = isRealVisibleBatchMember;
      const useGpuInstancingForMaterial =
        canGpuInstanceRenderer &&
        !material.shader.name.startsWith("Masonry/") &&
        (!sharedMeshMaterialCounts ||
          forcedInstancedRenderers.has(sourceRenderer) ||
          (useVisibleBatchCheck ? visibleBatchCount >= 2 : totalSharedCount >= 2));
      const isTransparentMaterial = Boolean((material as unknown as { isTransparent?: boolean }).isTransparent);
      // Only suppress the non-instanced primary variant when every visible renderer under the
      // RenderQueue.compareForOpaque sort key (priority, material, mesh) falls into a single
      // compatible batch bucket with >= 3 real visible instances (guarantees adjacency under quicksort).
      const onlyGpuInstancingInPrimary =
        useGpuInstancingForMaterial &&
        options.includeGpuInstancing !== false &&
        useVisibleBatchCheck &&
        !sourceRenderer.castShadows &&
        !isTransparentMaterial &&
        distinctBucketsForSortKey === 1 &&
        visibleBatchCount >= 3;
      const materialMacroVariants = isParticle
        ? particleMacroVariants
        : onlyGpuInstancingInPrimary
          ? gpuInstancedOnlyMacroVariants
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
        if (options.includeMasonryDither === false && material.shader.name.startsWith("Masonry/")) {
          // Transient pre-reveal LOD crossfades settle before frame 0 renders; strip dither macros
          // during primary warmup so startup compiles the settled reveal variant instead of a wasted dither pair.
          compileMacros.disable(MASONRY_DITHER_MACRO);
          compileMacros.disable(GLOBAL_PROXY_DITHER_MACRO);
        }
        for (const macro of extraMacros) {
          compileMacros.enable(
            macro.v === undefined ? ShaderMacro.getByName(macro.n) : ShaderMacro.getByName(macro.n, macro.v)
          );
        }
        const passCastShadows =
          !forcedCameraOnlyRenderers.has(sourceRenderer) &&
          (sourceRenderer.castShadows || material.shader.name === "Masonry/GlobalProxyShadowOnly");
        const macroSetKey = `${material.shader.name}/${passCastShadows}/${frustumShadowOnly ? "shadow" : "full"}/${contributionKey}?${shaderMacroCollectionKey(compileMacros)}`;
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
                supportsRendering,
                true,
                ssrContext,
                false,
                rendererBaseTarget ? { ...rendererBaseTarget, material } : undefined
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
            supportsRendering,
            false,
            ssrContext,
            frustumShadowOnly,
            rendererBaseTarget ? { ...rendererBaseTarget, material } : undefined
          );
          if (!frustumShadowOnly) appendPointLightVariants(material.shader, compileMacros);
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
              supportsRendering,
              false,
              ssrContext,
              false,
              rendererBaseTarget ? { ...rendererBaseTarget, material } : undefined
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
                supportsRendering,
                false,
                ssrContext,
                false,
                rendererBaseTarget ? { ...rendererBaseTarget, material } : undefined
              );
            }
            appendPointLightVariants(companionShader, compileMacros);
          }
        }
      }
    }
  }

  // Camera passes and background materials are not Entity Renderer components.
  const auxiliary: [Material | undefined, boolean | undefined, ("bloom" | "uber" | "sky")?][] = [];
  if (scene.background?.mode === BackgroundMode.Sky)
    auxiliary.push([scene.background.sky.material!, renderToTexture, "sky"]);
  for (const material of options.additionalBackgroundMaterials ?? [])
    auxiliary.push([material, renderToTexture, "sky"]);
  const runtimeEngine = engine as unknown as {
    _hardwareRenderer?: { supportsRendering?: boolean };
    _basicResources?: {
      blitMaterial?: Material;
      blitMesh?: { _primitive?: Primitive; subMeshes?: readonly SubPrimitive[] };
    };
    _getActivePostProcessPasses?: () => readonly {
      isActive: boolean;
      _uberMaterial?: Material;
      _bloomMaterial?: Material;
      _sunLensFlareMaterial?: Material | null;
      _volumetricLightMaterial?: Material | null;
      _material?: Material | null;
    }[];
  };
  const blitMesh = runtimeEngine._basicResources?.blitMesh;
  const skyMesh = (
    scene.background?.sky as unknown as
      | { mesh?: { _primitive?: Primitive; subMeshes?: readonly SubPrimitive[] } }
      | undefined
  )?.mesh;
  const makeBlitWebGPUTarget = (
    material: Material | undefined,
    targetFlag: boolean | undefined,
    isSky = false
  ): Omit<WebGPUWarmupTarget, "stage"> | undefined => {
    if (!webgpuRegistry) return undefined;
    const mesh = isSky ? skyMesh : blitMesh;
    return {
      primitive: mesh?._primitive,
      subPrimitives: mesh?.subMeshes,
      material,
      camera,
      renderToTexture: targetFlag,
      frontFaceInvert: false
    };
  };
  const blit = runtimeEngine._basicResources?.blitMaterial;
  if (blit) {
    if (options.onlyFrustumVisible) {
      auxiliary.push([blit, renderToTexture]);
    } else {
      auxiliary.push([blit, true], [blit, false]);
    }
  }
  const pipeline = camera as unknown as {
    _renderPipeline?: {
      _finalPass?: { _sRGBmaterial?: Material; _antiAliasingMaterial?: Material };
    };
    _needFinalPass?: () => boolean;
  };
  const needFinalPass = Boolean(pipeline._needFinalPass?.());
  if (needFinalPass) {
    const final = pipeline._renderPipeline?._finalPass;
    const fxaa = camera.antiAliasing === AntiAliasing.FXAA;
    auxiliary.push([final?._sRGBmaterial, fxaa || Boolean(camera.renderTarget)]);
    if (fxaa) auxiliary.push([final?._antiAliasingMaterial, Boolean(camera.renderTarget)]);
  }
  const sunLensFlareVisibleInPrimary =
    !options.onlyFrustumVisible || isSunLensFlareVisibleForCamera(camera, scene, options.postProcessState);
  const volumetricLightWarmup = resolveVolumetricLightWarmupMode(
    camera,
    scene,
    options.postProcessState,
    depthPrepassEnabled || forwardDepthResolveEnabled
  );
  const volumetricLightActiveInPass =
    Boolean(options.postProcessState?.volumetricLight) &&
    (!options.onlyFrustumVisible || volumetricLightWarmup.visibleAtSpawn);
  const finalPostProcessTarget = needFinalPass || Boolean(camera.renderTarget);
  if (camera.enablePostProcess && options.postProcessState?.enabled !== false)
    for (const pass of runtimeEngine._getActivePostProcessPasses?.() ?? []) {
      if (!pass.isActive) continue;
      if (!options.postProcessState || options.postProcessState.bloom)
        auxiliary.push([pass._bloomMaterial, true, "bloom"]);
      if (options.postProcessState?.sunLensFlare && pass._sunLensFlareMaterial && sunLensFlareVisibleInPrimary) {
        auxiliary.push([pass._sunLensFlareMaterial, true]);
        if (supportsRendering && supportsTransformFeedback) {
          const visibilityShader = Shader.find("PostProcess/SunLensFlareVisibility");
          if (visibilityShader && !visibilityShader.destroyed) {
            appendShaderVariants(
              visibilityShader,
              new ShaderMacroCollection(),
              variants,
              false,
              undefined,
              undefined,
              supportsRendering
            );
          }
        }
      }
      if (volumetricLightActiveInPass && pass._volumetricLightMaterial) {
        const vlMaterial = pass._volumetricLightMaterial;
        if (!vlMaterial.destroyed && !vlMaterial.shader.destroyed) {
          const vlSubShader = vlMaterial.shader.subShaders[0];
          if (vlSubShader) {
            const vlMacros = new ShaderMacroCollection();
            ShaderMacroCollection.unionCollection(
              cameraMacros,
              (vlMaterial.shaderData as unknown as RuntimeShaderData)._macroCollection,
              vlMacros
            );
            vlMacros.unionCollection((engine as RuntimeEngine)._macroCollection);
            const vlOld: ShaderMacro[] = [];
            (ShaderMacro as unknown as RuntimeShaderMacroConstructor)._getMacrosElements(vlMacros, vlOld);
            for (const macro of vlOld) {
              if (
                macro.name === "VOLUMETRIC_LIGHT_QUALITY" ||
                macro.name === "VOLUMETRIC_LIGHT_HEIGHT_FOG" ||
                macro.name === "ENGINE_OUTPUT_SRGB_CORRECT"
              ) {
                vlMacros.disable(macro);
              }
            }
            if (volumetricLightWarmup.useRaymarch) {
              vlMacros.enable(ShaderMacro.getByName("VOLUMETRIC_LIGHT_QUALITY", String(volumetricLightWarmup.quality)));
              if (options.postProcessState?.volumetricLightHeightFog) {
                vlMacros.enable(ShaderMacro.getByName("VOLUMETRIC_LIGHT_HEIGHT_FOG"));
              }
            }
            const vlElements: ShaderMacro[] = [];
            (ShaderMacro as unknown as RuntimeShaderMacroConstructor)._getMacrosElements(vlMacros, vlElements);
            const vlRecorded = vlElements.map((macro) =>
              macro.value === undefined ? { n: macro.name } : { n: macro.name, v: macro.value }
            );
            const vlPassIndices = volumetricLightWarmup.useRaymarch ? [3, 4] : [0, 1, 2];
            for (const pi of vlPassIndices) {
              if (!vlSubShader.passes[pi]) continue;
              const vlEntry: SeedWorldShaderVariantEntry = {
                shader: vlMaterial.shader.name,
                si: 0,
                pi,
                macros: vlRecorded
              };
              variants.push(vlEntry);
              if (webgpuRegistry) {
                const bt = makeBlitWebGPUTarget(vlMaterial, true, false);
                if (bt) recordWebGPUWarmupTarget(webgpuRegistry, vlEntry, { ...bt, stage: "Forward" });
              }
            }
          }
        }
      }
      if (pass._uberMaterial) {
        auxiliary.push([pass._uberMaterial, true, "uber"]);
      } else if (pass._material) {
        auxiliary.push([pass._material, finalPostProcessTarget]);
      }
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
    if (state && (kind === "bloom" || kind === "uber")) {
      const names = new Set(
        kind === "bloom"
          ? ["BLOOM_HQ"]
          : [
              "BLOOM_HQ",
              "BLOOM_DIRT",
              "ENABLE_EFFECT_BLOOM",
              "ENABLE_EFFECT_COLOR_ADJUSTMENTS",
              "ENABLE_EFFECT_SUN_LENS_FLARE",
              "ENABLE_EFFECT_VOLUMETRIC_LIGHT",
              "VOLUMETRIC_LIGHT_RAYMARCH",
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
        if (volumetricLightActiveInPass) {
          macros.enable(ShaderMacro.getByName("ENABLE_EFFECT_VOLUMETRIC_LIGHT"));
          if (volumetricLightWarmup.useRaymarch) {
            macros.enable(ShaderMacro.getByName("VOLUMETRIC_LIGHT_RAYMARCH"));
          }
        }
        if (state.tonemappingMode !== undefined) {
          macros.enable(ShaderMacro.getByName("ENABLE_EFFECT_TONEMAPPING"));
          macros.enable(ShaderMacro.getByName("TONEMAPPING_MODE", String(state.tonemappingMode)));
        }
      }
    }
    const auxWebgpuTarget = makeBlitWebGPUTarget(material, target, kind === "sky");
    appendShaderVariants(
      material.shader,
      macros,
      variants,
      false,
      target,
      undefined,
      supportsRendering,
      false,
      ssrContext,
      false,
      auxWebgpuTarget
    );
    // In 2D Low volumetric-light mode, rotating the camera away from the sun toggles
    // ENABLE_EFFECT_VOLUMETRIC_LIGHT off dynamically; warm the off-state partner during
    // full/background warmup so 360-degree exploration never misses PostProcess/Uber.
    if (
      state &&
      kind === "uber" &&
      volumetricLightActiveInPass &&
      !options.onlyFrustumVisible &&
      !volumetricLightWarmup.useRaymarch
    ) {
      const noVlMacros = new ShaderMacroCollection();
      noVlMacros.unionCollection(macros);
      noVlMacros.disable(ShaderMacro.getByName("ENABLE_EFFECT_VOLUMETRIC_LIGHT"));
      noVlMacros.disable(ShaderMacro.getByName("VOLUMETRIC_LIGHT_RAYMARCH"));
      appendShaderVariants(
        material.shader,
        noVlMacros,
        variants,
        false,
        target,
        undefined,
        supportsRendering,
        false,
        ssrContext,
        false,
        auxWebgpuTarget
      );
    }
  }
  // Warm deferred SSR DepthOnly / Forward SSR variants + exact Lighting/ScreenSpaceReflection v2 passes when receivers exist.
  const hasAnySsrReceivers = ssrContext.hasTransparentSsr || ssrContext.hasOpaqueSsr;
  const useHighVirtual =
    ssrQuality === ScreenSpaceReflectionQuality.High || ssrQuality === ScreenSpaceReflectionQuality.XHigh;
  const isXHigh = ssrQuality === ScreenSpaceReflectionQuality.XHigh;
  const deferSSRToPostOpaque =
    !ssrContext.hasOpaqueSsr && ssrContext.hasTransparentSsr && forwardDepthResolveEnabled && !depthPrepassEnabled;
  const hasFullDepthForSsr = depthPrepassEnabled || deferSSRToPostOpaque;
  const cameraOpaqueTextureEnabled = Boolean(
    (camera as unknown as { opaqueTextureEnabled?: boolean }).opaqueTextureEnabled
  );
  const canReuseCurrentFrameColor =
    deferSSRToPostOpaque && cameraOpaqueTextureEnabled && !isXHigh && !ssrContext.hasContribDepth;
  if (ssrContext.skipNonSsrForwardForReceivers && (!(ssrEnabled && hasAnySsrReceivers) || !canReuseCurrentFrameColor)) {
    // Safety net: keep non-SSR Forward variants whenever SSR will not run on Frame 0 — either because
    // no SSRReceiver pass is active or because `!canReuseCurrentFrameColor` enters `WarmupColor` on
    // cold Frame 0 (clearing `ssrState.enabled = false` before Forward).
    for (const entry of ssrContext.deferredSsrForward ?? []) {
      variants.push({ shader: entry.shader, si: entry.si, pi: entry.pi, macros: entry.macros });
    }
  }
  if (ssrEnabled && hasAnySsrReceivers) {
    if (!hasFullDepthForSsr && ssrContext.deferredSsrDepthOnly?.length) {
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
        if (ssrPackedHDRReinhard) {
          macros.push({ n: "SSR_PACKED_HDR_REINHARD" });
        }
        return macros;
      };
      for (const entry of ssrContext.deferredSsrForward) {
        const useBilateral = camSSRBilateral && entry.allowBilateral;
        const useVerifyDepth = !useBilateral && (camSSRVerifyDepth || (camSSRBilateral && !entry.allowBilateral));
        const ssrForwardEntry: SeedWorldShaderVariantEntry = {
          shader: entry.shader,
          si: entry.si,
          pi: entry.pi,
          macros: [...entry.macros, ...buildForwardSsrMacros(useBilateral, useVerifyDepth)]
        };
        variants.push(ssrForwardEntry);
        recordWebGPUWarmupTarget(webgpuRegistry, ssrForwardEntry, entry.webgpuTarget);
        // When both transparent and opaque SSR receivers exist under non-High quality, culling all
        // transparent receivers drops camSSRVerifyDepth at runtime; warm the opaque-only Forward variant too.
        if (
          ssrContext.hasTransparentSsr &&
          ssrContext.hasOpaqueSsr &&
          !useBilateral &&
          !camSSRBilateral &&
          entry.isOpaque
        ) {
          const opaqueSsrEntry: SeedWorldShaderVariantEntry = {
            shader: entry.shader,
            si: entry.si,
            pi: entry.pi,
            macros: [...entry.macros, ...buildForwardSsrMacros(false, false)]
          };
          variants.push(opaqueSsrEntry);
          recordWebGPUWarmupTarget(webgpuRegistry, opaqueSsrEntry, entry.webgpuTarget);
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
        if (ssrPackedHDRReinhard) baseSsrMacros.enable(ShaderMacro.getByName("SSR_PACKED_HDR_REINHARD"));
        const baseElements: ShaderMacro[] = [];
        (ShaderMacro as unknown as RuntimeShaderMacroConstructor)._getMacrosElements(baseSsrMacros, baseElements);
        const baseRecorded = baseElements
          .filter((macro) => macro.name !== "ENGINE_OUTPUT_SRGB_CORRECT")
          .map((macro) => (macro.value === undefined ? { n: macro.name } : { n: macro.name, v: macro.value }));
        const appendSsrPass = (pi: number, extraMacros?: readonly SeedWorldShaderVariantMacro[]) => {
          if (!subShader.passes[pi]) return;
          const ssrEntry: SeedWorldShaderVariantEntry = {
            shader: ssrShader.name,
            si: 0,
            pi,
            macros: extraMacros?.length ? [...baseRecorded, ...extraMacros] : baseRecorded
          };
          variants.push(ssrEntry);
          if (webgpuRegistry) {
            const bt = makeBlitWebGPUTarget(undefined, true, false);
            if (bt) recordWebGPUWarmupTarget(webgpuRegistry, ssrEntry, { ...bt, stage: "Forward" });
          }
        };
        const baseHiZ0Macros: SeedWorldShaderVariantMacro[] =
          hasFullDepthForSsr && !isXHigh ? [{ n: "SSR_DOWNSAMPLE_FROM_FULL_DEPTH" }] : [];
        if (hasFullDepthForSsr && subShader.passes[8]) {
          // Steady-state WebGL2 merged DownsampleDepth + BuildHiZMip0 (Pass 8).
          appendSsrPass(8, baseHiZ0Macros);
          if (ssrContext.hasContribDepth) {
            appendSsrPass(8, [...baseHiZ0Macros, { n: "SSR_HAS_CONTRIB_DEPTH" }]);
          }
        }
        const warmHistoryFallback = Boolean(options.includeSsrHistoryFallback) && canReuseCurrentFrameColor;
        if (!hasFullDepthForSsr || !canReuseCurrentFrameColor || warmHistoryFallback || !subShader.passes[8]) {
          // WarmupColor frame 0 (when history color isn't reused) or fallback DepthOnly path uses Pass 1.
          appendSsrPass(1, baseHiZ0Macros);
          if (ssrContext.hasContribDepth) {
            appendSsrPass(1, [...baseHiZ0Macros, { n: "SSR_HAS_CONTRIB_DEPTH" }]);
          }
        }
        if (!ssrUseLinearTrace) {
          appendSsrPass(2); // Pass 2: BuildHiZMipN
        }
        appendSsrPass(3); // Pass 3: CopyTexture
        const traceMacros: SeedWorldShaderVariantMacro[] = [];
        if (useHighVirtual) traceMacros.push({ n: "SSR_OUTPUT_HIT_DIST" });
        if (canReuseCurrentFrameColor) traceMacros.push({ n: "SSR_CURRENT_FRAME_COLOR" });
        if (ssrUseLinearTrace) traceMacros.push({ n: "SSR_LINEAR_TRACE" });
        appendSsrPass(4, traceMacros.length > 0 ? traceMacros : undefined); // Pass 4: HiZTrace
        if (warmHistoryFallback) {
          const fallbackTraceMacros = traceMacros.filter((macro) => macro.n !== "SSR_CURRENT_FRAME_COLOR");
          appendSsrPass(4, fallbackTraceMacros.length > 0 ? fallbackTraceMacros : undefined);
        }
        if (ssrQuality !== ScreenSpaceReflectionQuality.Low) {
          appendSsrPass(
            5,
            useHighVirtual ? [{ n: "SSR_HIGH_VIRTUAL_REPROJECTION" }] : [{ n: "SSR_TEMPORAL_5TAP_CLAMP" }]
          ); // Pass 5: TemporalResolve
        }
        const supportsColorPyramidR11G11B10 = hwFormatSupport
          ? hwFormatSupport.call(runtimeHardware, TextureFormat.R11G11B10_UFloat)
          : true;
        const colorPyramidFormat = supportsColorPyramidR11G11B10
          ? TextureFormat.R11G11B10_UFloat
          : supportsRGBA16
            ? TextureFormat.R16G16B16A16_SFloat
            : TextureFormat.R8G8B8A8_UNorm;
        const supportsColorPyramidHardwareMipmaps =
          !isXHigh &&
          supportsRendering &&
          (!hwFormatSupport || hwFormatSupport.call(runtimeHardware, colorPyramidFormat));
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
      appendShaderVariants(photoCopyShader, photoMacros, variants, false, true, undefined, supportsRendering);
    }
  }
  // Overlay UI uses a separate, empty camera macro set. Scene lighting, mesh
  // attributes and GPU instancing do not participate in this rendering path.
  for (const renderer of options.overlayRenderers ?? []) {
    const overlayMesh = webgpuRegistry
      ? (renderer as unknown as { mesh?: { _primitive?: Primitive; subMeshes?: readonly SubPrimitive[] } }).mesh
      : undefined;
    const overlayTransformEntity = webgpuRegistry
      ? (renderer as unknown as { _transformEntity?: { transform?: { _isFrontFaceInvert?: () => boolean } } })
          ._transformEntity
      : undefined;
    const overlayFrontFaceInvert =
      typeof overlayTransformEntity?.transform?._isFrontFaceInvert === "function"
        ? overlayTransformEntity.transform._isFrontFaceInvert()
        : false;
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
      const overlayTarget: Omit<WebGPUWarmupTarget, "stage"> | undefined = webgpuRegistry
        ? {
            primitive: overlayMesh?._primitive,
            subPrimitives: overlayMesh?.subMeshes,
            material,
            renderer,
            camera,
            renderToTexture: false,
            frontFaceInvert: overlayFrontFaceInvert,
            isOverlay: true
          }
        : undefined;
      appendShaderVariants(
        material.shader,
        macros,
        variants,
        false,
        false,
        material,
        supportsRendering,
        false,
        ssrContext,
        false,
        overlayTarget
      );
      if (
        options.includeLiquidGlassMask !== false &&
        material.shader.name === "SeedWorld/LiquidGlassUiV6" &&
        !macros.isEnable(ShaderMacro.getByName("SEED_WORLD_GLASS_MASK"))
      ) {
        const maskedMacros = new ShaderMacroCollection();
        ShaderMacroCollection.unionCollection(macros, macros, maskedMacros);
        maskedMacros.enable(ShaderMacro.getByName("SEED_WORLD_GLASS_MASK"));
        appendShaderVariants(
          material.shader,
          maskedMacros,
          variants,
          false,
          false,
          material,
          supportsRendering,
          false,
          ssrContext,
          false,
          overlayTarget
        );
      }
      if (material.shader.name === "SeedWorld/VoiceOrbDisplayV1") {
        const bakeShader = Shader.find("SeedWorld/VoiceOrbBakeV1");
        if (bakeShader && !bakeShader.destroyed) {
          const bakeMacros = new ShaderMacroCollection();
          bakeMacros.unionCollection(engine._macroCollection);
          appendShaderVariants(
            bakeShader,
            bakeMacros,
            variants,
            false,
            true,
            undefined,
            supportsRendering,
            false,
            ssrContext,
            false,
            makeBlitWebGPUTarget(undefined, true, false)
          );
        }
      }
    }
  }
  if ((options.overlayRenderers?.length ?? 0) > 0 || options.includePhotoCopy) {
    const atlasTileShader = Shader.find("SeedWorld/UIAtlasTileV1");
    if (atlasTileShader && !atlasTileShader.destroyed) {
      const atlasMacros = new ShaderMacroCollection();
      atlasMacros.unionCollection(engine._macroCollection);
      atlasMacros.enable(ShaderMacro.getByName("ENGINE_SHOULD_SRGB_CORRECT"));
      atlasMacros.enable(ShaderMacro.getByName("RENDERER_IS_RECEIVE_SHADOWS"));
      appendShaderVariants(atlasTileShader, atlasMacros, variants, false, false, undefined, supportsRendering);
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
  readonly webgpuTarget?: WebGPUWarmupTarget;
}

interface AppendShaderVariantContext {
  readonly depthPrepassEnabled: boolean;
  readonly ssrEnabled: boolean;
  readonly supportsTransformFeedback?: boolean;
  readonly recordWebGPUWarmupTarget?: (
    entry: SeedWorldShaderVariantEntry,
    target: WebGPUWarmupTarget | undefined
  ) => void;
  readonly includeOpaqueSsr: boolean;
  /** When true (primary startup warmup with SSR active), active SSR receivers only warm their SSR Forward variant and defer their non-SSR fallback to secondary warmup. */
  readonly skipNonSsrForwardForReceivers?: boolean;
  readonly isSsrReceiver?: (material: Material) => boolean;
  readonly ssrReceiverExtraMacros?: readonly SeedWorldShaderVariantMacro[];
  readonly deferredSsrDepthOnly?: SeedWorldShaderVariantEntry[];
  readonly deferredSsrForward?: DeferredSsrForwardEntry[];
  hasOpaqueSsr: boolean;
  hasTransparentSsr: boolean;
  hasContribDepth: boolean;
}

function readSunDirectionOverrideXYZ(value: unknown): readonly [x: number, y: number, z: number] | undefined {
  if (!value) return undefined;
  let x: number;
  let y: number;
  let z: number;
  if (Array.isArray(value)) {
    if (value.length < 3) return undefined;
    x = Number(value[0]);
    y = Number(value[1]);
    z = Number(value[2]);
  } else if (typeof value === "object") {
    const v = value as { x?: unknown; y?: unknown; z?: unknown };
    x = Number(v.x);
    y = Number(v.y);
    z = Number(v.z);
  } else {
    return undefined;
  }
  const lenSq = x * x + y * y + z * z;
  if (!Number.isFinite(lenSq) || lenSq <= 1e-6) return undefined;
  return [x, y, z];
}

function resolveSunLensFlareDirectionOverride(
  scene: Scene,
  postProcessState?: SeedWorldPostProcessWarmupState
): readonly [x: number, y: number, z: number] | undefined {
  const fromState = readSunDirectionOverrideXYZ(postProcessState?.sunDirectionOverride);
  if (fromState) return fromState;
  const ppm = (
    scene as unknown as {
      postProcessManager?: {
        getBlendEffect?: (
          effectType: typeof SunLensFlareEffect
        ) => { sunDirectionOverride?: { value?: unknown } } | undefined;
        _activePostProcesses?: readonly {
          enabled?: boolean;
          isGlobal?: boolean;
          entity?: { isActiveInHierarchy?: boolean };
          getEffect?: (
            effectType: typeof SunLensFlareEffect
          ) => { enabled?: boolean; sunDirectionOverride?: { value?: unknown } } | undefined;
          _effects?: readonly { enabled?: boolean; sunDirectionOverride?: { value?: unknown } }[];
        }[];
      };
    }
  ).postProcessManager;
  if (!ppm) return undefined;
  const blendEffect = typeof ppm.getBlendEffect === "function" ? ppm.getBlendEffect(SunLensFlareEffect) : undefined;
  const fromBlend = readSunDirectionOverrideXYZ(blendEffect?.sunDirectionOverride?.value);
  if (fromBlend) return fromBlend;
  const active = ppm._activePostProcesses;
  if (Array.isArray(active)) {
    for (let i = active.length - 1; i >= 0; i--) {
      const pp = active[i];
      if (!pp || pp.enabled === false || pp.isGlobal === false || pp.entity?.isActiveInHierarchy === false) continue;
      const effect =
        typeof pp.getEffect === "function"
          ? pp.getEffect(SunLensFlareEffect)
          : pp._effects?.find(
              (item: { enabled?: boolean; sunDirectionOverride?: { value?: unknown } }) =>
                item && "sunDirectionOverride" in item
            );
      if (!effect || effect.enabled === false) continue;
      const fromActive = readSunDirectionOverrideXYZ(effect.sunDirectionOverride?.value);
      if (fromActive) return fromActive;
    }
  }
  return undefined;
}

/**
 * Mirrors `SunLensFlareEffect._resolveScreenState` with a slightly generous screen-border margin so
 * primary warmup only compiles `PostProcess/SunLensFlare*` when the sun is actually in front of the
 * spawn camera (deferring behind-camera sun lens flare shaders to post-ready secondary warmup).
 */
function isSunLensFlareVisibleForCamera(
  camera: Camera,
  scene: Scene,
  postProcessState?: SeedWorldPostProcessWarmupState
): boolean {
  if ((camera as unknown as { isOrthographic?: boolean }).isOrthographic) return false;
  const viewMatrix = (camera as unknown as { viewMatrix?: Matrix }).viewMatrix;
  const projectionMatrix = (camera as unknown as { projectionMatrix?: Matrix }).projectionMatrix;
  if (!viewMatrix || !projectionMatrix) return true;
  let dx: number;
  let dy: number;
  let dz: number;
  const overrideDir = resolveSunLensFlareDirectionOverride(scene, postProcessState);
  if (overrideDir) {
    const lenSq = overrideDir[0] * overrideDir[0] + overrideDir[1] * overrideDir[1] + overrideDir[2] * overrideDir[2];
    const invLen = -1 / Math.sqrt(lenSq);
    dx = overrideDir[0] * invLen;
    dy = overrideDir[1] * invLen;
    dz = overrideDir[2] * invLen;
  } else {
    const sceneLights = scene as unknown as {
      _lightManager?: { _sunlight?: { reverseDirection?: Vector3 } | null };
      sun?: { reverseDirection?: Vector3 } | null;
    };
    const sunlight = sceneLights._lightManager?._sunlight ?? sceneLights.sun;
    if (!sunlight) return true;
    const reverseDir = sunlight.reverseDirection;
    if (!reverseDir) return true;
    const lenSq = reverseDir.x * reverseDir.x + reverseDir.y * reverseDir.y + reverseDir.z * reverseDir.z;
    if (!Number.isFinite(lenSq) || lenSq <= 1e-6) return false;
    const invLen = 1 / Math.sqrt(lenSq);
    dx = reverseDir.x * invLen;
    dy = reverseDir.y * invLen;
    dz = reverseDir.z * invLen;
  }
  // Below-horizon fade drops to 0 at y <= -0.02; keep a conservative -0.05 floor.
  if (dy <= -0.05) return false;
  const dirToSun = new Vector3(dx, dy, dz);
  const viewDir = new Vector3();
  Vector3.transformNormal(dirToSun, viewMatrix, viewDir);
  const forwardDot = -viewDir.z;
  if (forwardDot <= 1e-3) return false;
  const p = projectionMatrix.elements;
  const clipX = p[0] * viewDir.x + p[4] * viewDir.y + p[8] * viewDir.z;
  const clipY = p[1] * viewDir.x + p[5] * viewDir.y + p[9] * viewDir.z;
  const clipW = p[3] * viewDir.x + p[7] * viewDir.y + p[11] * viewDir.z;
  if (clipW <= 1e-4) return false;
  const sunU = (clipX / clipW + 1) * 0.5;
  const sunV = (1 - clipY / clipW) * 0.5;
  const edgeDist = Math.max(Math.abs(sunU - 0.5), Math.abs(sunV - 0.5));
  // Runtime fades to 0 at edgeDist >= 0.88; keep a generous 0.95 margin for startup safety.
  return edgeDist < 0.95;
}

/**
 * Mirrors `VolumetricLightEffect._resolveScreenState` + `PostProcessUberPass._setupVolumetricLight`
 * with a slightly generous phase margin so primary warmup compiles the exact active VolumetricLight
 * tier (`Low` passes 0..2 vs `Medium`/`High` raymarch passes 3..4) and `PostProcess/Uber` macro state
 * without over-compiling behind-camera Low passes at spawn.
 */
function resolveVolumetricLightWarmupMode(
  camera: Camera,
  scene: Scene,
  postProcessState: SeedWorldPostProcessWarmupState | undefined,
  hasDepthTexture: boolean
): { readonly visibleAtSpawn: boolean; readonly useRaymarch: boolean; readonly quality: number } {
  const quality = postProcessState?.volumetricLightQuality ?? VolumetricLightQuality.Low;
  if (!postProcessState?.volumetricLight) {
    return { visibleAtSpawn: false, useRaymarch: false, quality };
  }
  const sceneLights = scene as unknown as {
    castShadows?: boolean;
    shadowDistance?: number;
    _lightManager?: {
      _sunlight?: { reverseDirection?: Vector3; shadowType?: ShadowType; shadowStrength?: number } | null;
    };
    sun?: { reverseDirection?: Vector3; shadowType?: ShadowType; shadowStrength?: number } | null;
  };
  const sunlight = sceneLights._lightManager?._sunlight ?? sceneLights.sun;
  const canRaymarch =
    quality !== VolumetricLightQuality.Low &&
    hasDepthTexture &&
    Boolean(
      sceneLights.castShadows &&
        (sceneLights.shadowDistance ?? 0) > 0.01 &&
        sunlight &&
        sunlight.shadowType !== ShadowType.None &&
        (sunlight.shadowStrength ?? 0) > 0
    );
  if ((camera as unknown as { isOrthographic?: boolean }).isOrthographic) {
    return { visibleAtSpawn: false, useRaymarch: canRaymarch, quality };
  }
  const viewMatrix = (camera as unknown as { viewMatrix?: Matrix }).viewMatrix;
  if (!viewMatrix) {
    return { visibleAtSpawn: true, useRaymarch: canRaymarch, quality };
  }
  let dx: number;
  let dy: number;
  let dz: number;
  const overrideDir = resolveSunLensFlareDirectionOverride(scene, postProcessState);
  if (overrideDir) {
    const lenSq = overrideDir[0] * overrideDir[0] + overrideDir[1] * overrideDir[1] + overrideDir[2] * overrideDir[2];
    const invLen = -1 / Math.sqrt(lenSq);
    dx = overrideDir[0] * invLen;
    dy = overrideDir[1] * invLen;
    dz = overrideDir[2] * invLen;
  } else {
    const reverseDir = sunlight?.reverseDirection;
    if (!reverseDir) {
      return { visibleAtSpawn: true, useRaymarch: canRaymarch, quality };
    }
    const lenSq = reverseDir.x * reverseDir.x + reverseDir.y * reverseDir.y + reverseDir.z * reverseDir.z;
    if (!Number.isFinite(lenSq) || lenSq <= 1e-6) {
      return { visibleAtSpawn: false, useRaymarch: canRaymarch, quality };
    }
    const invLen = 1 / Math.sqrt(lenSq);
    dx = reverseDir.x * invLen;
    dy = reverseDir.y * invLen;
    dz = reverseDir.z * invLen;
  }
  // Horizon fade drops to 0 at dirToSun.y <= -0.04; keep a conservative -0.06 floor.
  if (dy <= -0.06) {
    return { visibleAtSpawn: false, useRaymarch: canRaymarch, quality };
  }
  if (canRaymarch) {
    return { visibleAtSpawn: true, useRaymarch: true, quality };
  }
  const dirToSun = new Vector3(dx, dy, dz);
  const viewDir = new Vector3();
  Vector3.transformNormal(dirToSun, viewMatrix, viewDir);
  const forwardDot = -viewDir.z;
  // Runtime Low phaseVisibility reaches 0 below -0.34 - 0.147 = -0.487; keep a generous -0.55 margin.
  return { visibleAtSpawn: forwardDot > -0.55, useRaymarch: false, quality };
}

function resolveDepthMode(
  engine: Engine,
  scene: Scene,
  camera: Camera
): { readonly depthPrepassEnabled: boolean; readonly forwardDepthResolveEnabled: boolean } {
  const runtimeCamera = camera as unknown as {
    depthTextureMode?: DepthTextureMode;
    _enableForwardDepthResolve?: boolean;
    _isIndependentCanvasEnabled?: () => boolean;
  };
  // Preserve backward compatibility for minimal unit-test camera mocks without depthTextureMode.
  if (runtimeCamera.depthTextureMode === undefined) {
    return { depthPrepassEnabled: true, forwardDepthResolveEnabled: false };
  }
  const rhi = (
    engine as unknown as {
      _hardwareRenderer?: { supportsRendering?: boolean; canIUse?: (cap: GLCapabilityType) => boolean };
    }
  )._hardwareRenderer;
  const ambientOcclusionEnabled = Boolean(
    (scene as unknown as { ambientOcclusion?: { _isValid?: () => boolean } }).ambientOcclusion?._isValid?.()
  );
  const cameraDepthTextureRequested = runtimeCamera.depthTextureMode === DepthTextureMode.PrePass;
  const baseIndependentCanvasEnabled = Boolean(runtimeCamera._isIndependentCanvasEnabled?.());
  const forwardDepthResolveEnabled =
    cameraDepthTextureRequested &&
    Boolean(runtimeCamera._enableForwardDepthResolve) &&
    !ambientOcclusionEnabled &&
    rhi?.supportsRendering !== false &&
    baseIndependentCanvasEnabled;
  const depthPrepassEnabled = ambientOcclusionEnabled || (cameraDepthTextureRequested && !forwardDepthResolveEnabled);
  return { depthPrepassEnabled, forwardDepthResolveEnabled };
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
  supportsRendering = true,
  forwardOnly = false,
  context?: AppendShaderVariantContext,
  shadowOnly = false,
  webgpuTargetBase?: Omit<WebGPUWarmupTarget, "stage">
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
      if (shadowOnly && stage !== "ShadowCaster") continue;
      if (forwardOnly && stage !== "Forward") continue;
      // Match shadow culling even while candidate roots are intentionally inactive.
      if (!castShadows && stage === "ShadowCaster") continue;
      if (stage === "TransformFeedback" && (!supportsRendering || context?.supportsTransformFeedback === false))
        continue;
      const stageName = typeof stage === "string" ? stage : "Forward";
      const passWebgpuTarget: WebGPUWarmupTarget | undefined = webgpuTargetBase
        ? { ...webgpuTargetBase, stage: stageName }
        : undefined;
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
            const depthEntry: SeedWorldShaderVariantEntry = { shader: shader.name, si, pi, macros: depthMacros };
            context.deferredSsrDepthOnly.push(depthEntry);
            context.recordWebGPUWarmupTarget?.(depthEntry, passWebgpuTarget);
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
        const materialIsSsrReceiver = context.isSsrReceiver ? context.isSsrReceiver(material) : ssrIntensity > 0;
        const forceTerrainOpaque =
          ssrIntensity <= 0 &&
          queue !== RenderQueueType.Transparent &&
          context.includeOpaqueSsr &&
          shader.name.startsWith("Terrain/");
        if (materialIsSsrReceiver || ssrIntensity > 0 || forceTerrainOpaque) {
          const allowBilateral =
            (material as unknown as { screenSpaceReflectionBilateral?: boolean }).screenSpaceReflectionBilateral !==
            false;
          context.deferredSsrForward.push({
            shader: shader.name,
            si,
            pi,
            macros: passMacros,
            allowBilateral,
            isOpaque: queue !== RenderQueueType.Transparent,
            webgpuTarget: passWebgpuTarget
          });
          // When SSR is active during primary startup warmup, RenderQueue always resolves active SSR
          // receivers through SSRProgramResolver (CAMERA_ENABLE_SSR) and only falls back on texture-unit
          // overflow (already handled by warmupSeedWorldShaderVariants). Defer the non-SSR Forward twin.
          if (context.skipNonSsrForwardForReceivers && materialIsSsrReceiver) {
            continue;
          }
        }
      }
      const entry: SeedWorldShaderVariantEntry = { shader: shader.name, si, pi, macros: passMacros };
      variants.push(entry);
      context?.recordWebGPUWarmupTarget?.(entry, passWebgpuTarget);
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

function nextTimerTick(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
