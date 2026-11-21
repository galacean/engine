import { Shader, ShaderMacro, ShaderPass, type Engine } from "@galacean/engine";
import { meshPickShader } from "./runtime-mesh-picking";
import { isPickOcclusionPass, pickOcclusionPass } from "./runtime-pick-occlusion";

const PICK = "RENDERER_WORLD_PICK";
type Work = { pass: ShaderPass; macros: readonly ShaderMacro[] };

const ENGINE_NON_SCENE_PICK_SHADER_PREFIXES = ["PostProcess/", "Blit/", "Sky/", "Lighting/", "2D/"] as const;

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
  private nonScenePassCache = new WeakMap<ShaderPass, boolean>();
  private scannedShaders = new WeakSet<Shader>();
  private readonly requested = new WeakMap<ShaderPass, Set<string>>();
  private readonly queue: Work[] = [];
  private readonly deferredObserved: { pass: ShaderPass; macros: readonly ShaderMacro[] }[] = [];
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

  private request(source: ShaderPass, macros: readonly ShaderMacro[]): void {
    if (
      this.disposed ||
      this.failure ||
      this.generated.has(source) ||
      isPickOcclusionPass(source) ||
      isNonScenePickPass(source, this.ignoredPrefixes, this.nonScenePassCache, this.scannedShaders) ||
      source.getTagValue("pipelineStage") !== "Forward" ||
      macros.some((m) => m.name === PICK)
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
    const variant = macros.filter((m) => m.name !== "ENGINE_OUTPUT_SRGB_CORRECT");
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

  private async drain(): Promise<void> {
    while (this.queue.length && !this.disposed) {
      // Yield before source generation/GL submission; the notification itself is cheap.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const started = performance.now(),
        pending: Promise<boolean>[] = [];
      while (this.queue.length && pending.length < 4 && performance.now() - started < 4 && !this.disposed) {
        const work = this.queue.shift()!;
        pending.push(work.pass.compileVariantAsync(this.engine, work.macros, this.controller.signal));
      }
      const valid = await Promise.all(pending);
      if (valid.some((value) => !value)) throw new Error("Runtime picking shader preparation failed");
    }
  }

  /** Cheap frame-boundary check; never scans or compiles. */
  get ready(): boolean {
    if (this.disposed) throw new DOMException("Picking preparation disposed", "AbortError");
    if (this.failure) throw this.failure;
    return !this.paused && !this.processing;
  }

  /** Join queued preparation, e.g. before enabling the shutter or requesting a snapshot. */
  async flush(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    if (this.paused) this.resume();
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
  }

  dispose(): void {
    this.disposed = true;
    this.paused = false;
    this.deferredObserved.length = 0;
    this.unsubscribe();
    this.controller.abort();
    this.queue.length = 0;
  }
}
