import { Shader, ShaderMacro, ShaderPass, type Engine } from "@galacean/engine";
import { meshPickShader } from "./runtime-mesh-picking";
import { isPickOcclusionPass, pickOcclusionPass } from "./runtime-pick-occlusion";

const PICK = "RENDERER_WORLD_PICK";
type Work = { pass: ShaderPass; macros: readonly ShaderMacro[] };

const ENGINE_NON_SCENE_PICK_SHADER_PREFIXES = ["PostProcess/", "Blit/", "Sky/", "Lighting/", "2D/"] as const;
/** Engine-generic source Forward macros (e.g. orthographic UI/overlay cameras) that do not need eager pick clones. */
const ENGINE_SKIPPED_PICK_SOURCE_MACROS = ["CAMERA_ORTHOGRAPHIC"] as const;
/**
 * Macros never active on the offscreen identity/pick camera (`AO=false`, `SSR=false`, offscreen RT).
 * Note: `SCENE_SHADOW_TYPE` is intentionally NOT stripped because `scene.castShadows = false` skips
 * `CascadedShadowCasterPass` without running `Scene._updateShaderData()`, so `SCENE_SHADOW_TYPE`
 * remains set on `scene.shaderData` during `camera.render()`.
 */
const PICK_STRIPPED_MACROS = new Set([
  "ENGINE_OUTPUT_SRGB_CORRECT",
  "SCENE_ENABLE_AMBIENT_OCCLUSION",
  "CAMERA_ENABLE_SSR",
  "CAMERA_SSR_VERIFY_RECEIVER_DEPTH",
  "CAMERA_SSR_BILATERAL_SAMPLE",
  "SSR_PACKED_DEPTH_RG8",
  "SSR_PACKED_NORMAL_OCT8",
  "SSR_PACKED_HDR_REINHARD"
]);

function isNonScenePickPass(
  pass: ShaderPass,
  prefixes: readonly string[],
  cache: WeakMap<ShaderPass, boolean>,
  scannedShaders: WeakSet<Shader>
): boolean {
  const cached = cache.get(pass);
  if (cached !== undefined) return cached;
  if ((pass as unknown as { _feedbackVaryings?: readonly string[] })._feedbackVaryings?.length) {
    cache.set(pass, true);
    return true;
  }
  const registry = (Shader as unknown as { _shaderMap?: Readonly<Record<string, Shader | readonly Shader[]>> })
    ._shaderMap;
  if (registry) {
    for (const entry of Object.values(registry)) {
      const shaders = Array.isArray(entry) ? entry : [entry];
      for (const shader of shaders) {
        if (!shader || scannedShaders.has(shader) || !Array.isArray(shader.subShaders)) continue;
        scannedShaders.add(shader);
        const skip = prefixes.some((prefix) => shader.name.startsWith(prefix));
        for (const sub of shader.subShaders) {
          for (const candidate of sub.passes) {
            cache.set(candidate, skip);
          }
        }
      }
    }
    const resolved = cache.get(pass);
    if (resolved !== undefined) return resolved;
  }
  cache.set(pass, false);
  return false;
}

export interface RuntimePickPreparationOptions {
  /**
   * When true, defers building replacement pick shaders (`PBR`/`Unlit`/`BlinnPhong`) and draining
   * `RENDERER_WORLD_PICK` compilations until `resume()` or `flush()` is called. Variants observed
   * while paused are still buffered so nothing is lost once resumed.
   */
  readonly deferStart?: boolean;
  /** Max concurrent compilations during idle background draining (defaults to 2 with parallel compile, 1 without). */
  readonly backgroundConcurrency?: number;
  /** Max concurrent compilations while a caller awaits `flush()` (defaults to 24 with parallel compile, 4 without). */
  readonly flushConcurrency?: number;
  /** Optional delay in milliseconds between background batches; ignored while `flush()` is active. */
  readonly backgroundCooldownMs?: number;
}

/** Prepare companion picking programs when normal rendering prepares a new variant.
 * No Entity traversal, frame polling, domain names or business-specific macro lists.
 */
export class RuntimePickPreparation {
  private readonly controller = new AbortController();
  private readonly unsubscribe: () => void;
  private readonly targets = new WeakMap<ShaderPass, ShaderPass>();
  private readonly generated = new WeakSet<ShaderPass>();
  private readonly ignoredPrefixes: string[] = [...ENGINE_NON_SCENE_PICK_SHADER_PREFIXES];
  private readonly ignoredSourceMacros = new Set<string>(ENGINE_SKIPPED_PICK_SOURCE_MACROS);
  private nonScenePassCache = new WeakMap<ShaderPass, boolean>();
  private scannedShaders = new WeakSet<Shader>();
  private readonly requested = new WeakMap<ShaderPass, Set<string>>();
  private readonly queue: Work[] = [];
  private readonly deferredObserved: { pass: ShaderPass; macros: readonly ShaderMacro[] }[] = [];
  private readonly backgroundConcurrency?: number;
  private readonly flushConcurrency?: number;
  private readonly backgroundCooldownMs?: number;
  private parallelCompileSupported?: boolean;
  private urgentFlushCount = 0;
  private wakeDrain?: () => void;
  private wakeRaceSlot?: () => boolean;
  private paused = false;
  private meshReplacementsInitialized = false;
  private processing?: Promise<void>;
  private failure?: unknown;
  private disposed = false;

  constructor(
    private readonly engine: Engine,
    options?: RuntimePickPreparationOptions
  ) {
    this.paused = Boolean(options?.deferStart);
    this.backgroundConcurrency = options?.backgroundConcurrency;
    this.flushConcurrency = options?.flushConcurrency;
    this.backgroundCooldownMs = options?.backgroundCooldownMs;
    if (!this.paused) {
      this.ensureMeshReplacements();
    }
    this.unsubscribe = ShaderPass.observeVariants(engine, (pass, macros) => {
      if (this.disposed || this.failure) return;
      if (this.paused) {
        this.deferredObserved.push({ pass, macros: [...macros] });
        return;
      }
      this.request(pass, macros);
    });
  }

  private ensureMeshReplacements(): void {
    if (this.meshReplacementsInitialized) return;
    this.meshReplacementsInitialized = true;
    // The built-in mesh port and capture use the very same replacement pass.
    for (const name of ["PBR", "Unlit", "BlinnPhong"]) {
      const original = Shader.find(name);
      if (!original) continue;
      const replacement = meshPickShader(original).subShaders[0].passes[0];
      this.generated.add(replacement);
      this.meshReplacements.add(replacement);
      for (const sub of original.subShaders)
        for (const pass of sub.passes) {
          if (pass.getTagValue("pipelineStage") === "Forward") this.targets.set(pass, replacement);
        }
    }
  }

  /** Pause draining newly observed variants into pick compilations until `resume()` or `flush()` is called. */
  pause(): void {
    if (this.disposed) return;
    this.paused = true;
  }

  /** Activate replacement shader compilation and drain all variants observed while paused. */
  resume(): void {
    if (!this.paused || this.disposed || this.failure) return;
    this.paused = false;
    this.ensureMeshReplacements();
    const buffered = this.deferredObserved.splice(0, this.deferredObserved.length);
    for (const entry of buffered) {
      this.request(entry.pass, entry.macros);
    }
  }

  /** Register host-owned non-scene shader prefixes (e.g. UI, compute kernels, sky backdrops) to skip pick preparation. */
  ignoreShaderPrefixes(prefixes: readonly string[]): void {
    let changed = false;
    for (const prefix of prefixes) {
      if (prefix && !this.ignoredPrefixes.includes(prefix)) {
        this.ignoredPrefixes.push(prefix);
        changed = true;
      }
    }
    if (changed) {
      this.nonScenePassCache = new WeakMap<ShaderPass, boolean>();
      this.scannedShaders = new WeakSet<Shader>();
    }
  }

  /** Register host-owned transient/domain source macros whose Forward variants should not queue eager pick clones. */
  ignoreSourceMacros(macros: readonly string[]): void {
    for (const macro of macros) {
      if (macro) this.ignoredSourceMacros.add(macro);
    }
  }

  private request(source: ShaderPass, macros: readonly ShaderMacro[]): void {
    if (
      this.disposed ||
      this.failure ||
      this.generated.has(source) ||
      isPickOcclusionPass(source) ||
      isNonScenePickPass(source, this.ignoredPrefixes, this.nonScenePassCache, this.scannedShaders) ||
      source.getTagValue("pipelineStage") !== "Forward" ||
      macros.some((m) => m.name === PICK || this.ignoredSourceMacros.has(m.name))
    )
      return;
    let target = this.targets.get(source);
    if (!target) {
      // This bridge inspects the existing public picking branch; it does not invent
      // a replacement vertex program for an unknown custom renderer.
      const instructions = source as unknown as { _fragmentShaderInstructions: readonly unknown[] };
      const contains = (value: unknown): boolean => value === PICK || (Array.isArray(value) && value.some(contains));
      target = contains(instructions._fragmentShaderInstructions) ? source : pickOcclusionPass(source).pass;
      this.targets.set(source, target);
      if (target !== source) this.generated.add(target);
    }
    const variant = macros.filter((m) => !PICK_STRIPPED_MACROS.has(m.name));
    if (target === source || this.meshReplacements.has(target)) variant.push(ShaderMacro.getByName(PICK));
    let keys = this.requested.get(target);
    if (!keys) this.requested.set(target, (keys = new Set()));
    const key = variant
      .map((m) => `${m.name}=${m.value ?? ""}`)
      .sort()
      .join(",");
    if (keys.has(key)) return;
    keys.add(key);
    this.queue.push({ pass: target, macros: variant });
    this.start();
    this.wakeForWork();
  }

  private start(): void {
    this.processing ??= this.drain()
      .catch((error) => {
        if (!this.disposed) this.failure = error;
        this.queue.length = 0;
      })
      .finally(() => {
        this.processing = undefined;
        if (this.queue.length && !this.disposed && !this.failure) this.start();
      });
  }

  private readonly meshReplacements = new WeakSet<ShaderPass>();

  private hasParallelCompile(): boolean {
    if (this.parallelCompileSupported !== undefined) return this.parallelCompileSupported;
    const gl = (
      this.engine as unknown as {
        _hardwareRenderer?: { gl?: { getExtension?: (name: string) => unknown } };
      }
    )?._hardwareRenderer?.gl;
    this.parallelCompileSupported = Boolean(gl?.getExtension?.("KHR_parallel_shader_compile"));
    return this.parallelCompileSupported;
  }

  private wake(): void {
    const callback = this.wakeDrain;
    this.wakeDrain = undefined;
    this.wakeRaceSlot = undefined;
    callback?.();
  }

  /** Notify an active sliding-window wait only when a free concurrency slot exists; never cancels timers/cooldowns. */
  private wakeForWork(): void {
    this.wakeRaceSlot?.();
  }

  private waitOrWake(delayMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (this.wakeDrain === finish) this.wakeDrain = undefined;
        resolve();
      };
      const timer = setTimeout(finish, delayMs);
      this.wakeDrain = finish;
    });
  }

  private raceInFlightOrWake(inFlight: ReadonlySet<Promise<void>>, canAcceptMore: () => boolean): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let done = false;
      const finish = (wokenByNewWork: boolean) => {
        if (done) return;
        done = true;
        if (this.wakeDrain === onUrgentWake) this.wakeDrain = undefined;
        if (this.wakeRaceSlot === tryWakeForSlot) this.wakeRaceSlot = undefined;
        resolve(wokenByNewWork);
      };
      const onUrgentWake = () => finish(false);
      const tryWakeForSlot = (): boolean => {
        if (!canAcceptMore()) return false;
        finish(true);
        return true;
      };
      this.wakeDrain = onUrgentWake;
      this.wakeRaceSlot = tryWakeForSlot;
      void Promise.race(inFlight).finally(() => finish(false));
    });
  }

  private async drain(): Promise<void> {
    const parallel = this.hasParallelCompile();
    const bgConcurrency = Math.max(1, Math.floor(this.backgroundConcurrency ?? (parallel ? 2 : 1)));
    const urgentConcurrency = Math.max(bgConcurrency, Math.floor(this.flushConcurrency ?? (parallel ? 24 : 4)));
    const bgCooldownMs = Math.max(0, Math.floor(this.backgroundCooldownMs ?? 0));
    const inFlight = new Set<Promise<void>>();
    let firstError: unknown;
    let hasError = false;
    let initialYieldDone = false;

    const launch = (work: Work): void => {
      const task = work.pass
        .compileVariantAsync(this.engine, work.macros, this.controller.signal)
        .then(
          (valid) => {
            if (!valid && !hasError) {
              hasError = true;
              firstError = new Error("Runtime picking shader preparation failed");
            }
          },
          (error) => {
            if (!hasError) {
              hasError = true;
              firstError = error;
            }
          }
        )
        .finally(() => {
          inFlight.delete(task);
        });
      inFlight.add(task);
    };

    while ((this.queue.length > 0 || inFlight.size > 0) && !this.disposed && !hasError) {
      if (!initialYieldDone) {
        initialYieldDone = true;
        if (this.urgentFlushCount === 0) {
          // Yield before source generation/GL submission in background mode so observer callbacks stay cheap.
          await this.waitOrWake(0);
          if (this.disposed) break;
        }
      }

      const urgent = this.urgentFlushCount > 0;
      const limit = urgent ? urgentConcurrency : bgConcurrency;
      const submitBudgetMs = urgent ? (parallel ? 24 : 12) : 4;
      let submitted = 0;

      if (this.queue.length > 0 && inFlight.size < limit) {
        const started = performance.now();
        while (
          this.queue.length > 0 &&
          inFlight.size < limit &&
          (submitted === 0 || performance.now() - started < submitBudgetMs) &&
          !this.disposed &&
          !hasError
        ) {
          const work = this.queue.shift()!;
          launch(work);
          submitted++;
        }
      }

      if (hasError || this.disposed) break;

      const activeLimit = this.urgentFlushCount > 0 ? urgentConcurrency : bgConcurrency;
      if (this.queue.length > 0 && inFlight.size < activeLimit) {
        // Yield briefly only because submitBudgetMs elapsed, then continue filling the sliding window.
        await this.waitOrWake(this.urgentFlushCount > 0 ? 0 : bgCooldownMs);
      } else if (inFlight.size > 0) {
        // Sliding window: wake as soon as any single program settles, flush() escalates, or new work arrives for a free slot.
        const wokenByNewWork = await this.raceInFlightOrWake(inFlight, () => {
          const currentLimit = this.urgentFlushCount > 0 ? urgentConcurrency : bgConcurrency;
          return inFlight.size < currentLimit;
        });
        if (!wokenByNewWork && this.queue.length > 0 && this.urgentFlushCount === 0 && bgCooldownMs > 0) {
          await this.waitOrWake(bgCooldownMs);
        }
      }
    }

    if (inFlight.size > 0) {
      await Promise.allSettled(inFlight);
    }
    if (hasError && !this.disposed) {
      throw firstError;
    }
  }

  /** Cheap frame-boundary check; never scans or compiles. */
  get ready(): boolean {
    if (this.disposed) throw new DOMException("Picking preparation disposed", "AbortError");
    if (this.failure) throw this.failure;
    return !this.paused && !this.processing;
  }

  /** Keep urgent concurrency active across a multi-step capture window; call the returned function in finally. */
  beginUrgent(): () => void {
    let released = false;
    this.urgentFlushCount++;
    this.wake();
    return () => {
      if (released) return;
      released = true;
      this.urgentFlushCount--;
    };
  }

  /** Join queued preparation, e.g. before enabling the shutter or requesting a snapshot. */
  async flush(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    this.urgentFlushCount++;
    try {
      if (this.paused) this.resume();
      this.wake();
      while (this.processing) {
        const pending = this.processing;
        await new Promise<void>((resolve, reject) => {
          const abort = () => reject(signal!.reason);
          signal?.addEventListener("abort", abort, { once: true });
          pending.then(resolve, reject).finally(() => signal?.removeEventListener("abort", abort));
        });
        signal?.throwIfAborted();
      }
      if (this.disposed) throw new DOMException("Picking preparation disposed", "AbortError");
      if (this.failure) throw this.failure;
    } finally {
      this.urgentFlushCount--;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.paused = false;
    this.deferredObserved.length = 0;
    this.unsubscribe();
    this.controller.abort();
    this.queue.length = 0;
    this.wake();
  }
}
