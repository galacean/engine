import { Shader, ShaderMacro, ShaderPass, type Engine, type ShaderMacroCollection } from "@galacean/engine";

export interface AuditedShaderCompile {
  readonly programId: number;
  readonly shader: string;
  readonly si: number;
  readonly pi: number;
  readonly stage: string;
  readonly macros: readonly string[];
  readonly phase: string;
  readonly caller: string;
  readonly stack: readonly string[];
  readonly compiledAtMs: number;
  readonly elapsedMs: number;
}

export interface SeedWorldShaderAuditSnapshot {
  readonly parallelCompile: boolean;
  readonly warmupRequested: number;
  readonly warmupDeferred: number;
  readonly compiled: readonly AuditedShaderCompile[];
  readonly boundProgramIds: readonly number[];
  readonly boundByPhase: Readonly<Record<string, readonly number[]>>;
}

export interface SeedWorldShaderAuditSummaryEntry {
  readonly shader: string;
  readonly stage: string;
  readonly si: number;
  readonly pi: number;
  readonly phase: string;
  readonly caller: string;
  readonly compiledAtMs: number;
  readonly elapsedMs: number;
  readonly boundInReveal: boolean;
  readonly boundEver: boolean;
  readonly macros: readonly string[];
}

export interface SeedWorldShaderAuditSummary {
  readonly parallelCompile: boolean;
  readonly warmupRequested: number;
  readonly warmupDeferred: number;
  readonly compiledTotal: number;
  readonly totalCompileMs: number;
  readonly boundTotalCount: number;
  readonly boundInRevealCount: number;
  readonly compiledInStartupCount: number;
  readonly compiledInStartupMs: number;
  readonly startupBoundInRevealCount: number;
  readonly startupWastedInRevealCount: number;
  readonly revealCompileMissCount: number;
  readonly postReadyRenderCompileMissCount: number;
  readonly byPhase: Readonly<Record<string, { readonly count: number; readonly totalMs: number; readonly maxMs: number }>>;
  readonly byCaller: Readonly<Record<string, { readonly count: number; readonly totalMs: number; readonly maxMs: number }>>;
  readonly byShader: readonly {
    readonly shader: string;
    readonly count: number;
    readonly totalMs: number;
    readonly maxMs: number;
    readonly startupCount: number;
    readonly boundInRevealCount: number;
    readonly renderMissCount: number;
  }[];
  readonly revealCompileMisses: readonly SeedWorldShaderAuditSummaryEntry[];
  readonly startupWastedInReveal: readonly SeedWorldShaderAuditSummaryEntry[];
  readonly slowestCompiles: readonly SeedWorldShaderAuditSummaryEntry[];
}

export interface SeedWorldShaderAuditHandle {
  setPhase(phase: string): void;
  setParallelCompile(supported: boolean): void;
  recordWarmupRequested(count: number, deferredCount: number): void;
  snapshot(): SeedWorldShaderAuditSnapshot;
  dispose(): void;
}

interface InternalShaderProgram {
  readonly id: number;
  bind(): boolean;
}

function locatePass(
  target: ShaderPass,
  cache: Map<ShaderPass, { shader: string; si: number; pi: number; stage: string }>
): { shader: string; si: number; pi: number; stage: string } | undefined {
  const cached = cache.get(target);
  if (cached) return cached;
  const registry = (Shader as unknown as { _shaderMap: Record<string, Shader | Shader[]> })._shaderMap;
  for (const entry of Object.values(registry)) {
    const shaders = Array.isArray(entry) ? entry : [entry];
    for (const shader of shaders) {
      if (!shader || !Array.isArray(shader.subShaders)) continue;
      for (let si = 0; si < shader.subShaders.length; si++) {
        const passes = shader.subShaders[si].passes;
        for (let pi = 0; pi < passes.length; pi++) {
          const pass = passes[pi];
          const info = {
            shader: shader.name,
            si,
            pi,
            stage: String(pass.getTagValue("pipelineStage") ?? "Forward")
          };
          cache.set(pass, info);
          if (pass === target) return info;
        }
      }
    }
  }
  return undefined;
}

function classifyCaller(stack: readonly string[]): string {
  const joined = stack.join(" | ");
  if (joined.includes("warmupSeedWorldShaderVariants") || joined.includes("warmupSeedWorldRendererVariants")) {
    return "warmup";
  }
  if (
    joined.includes("RuntimePickPreparation") ||
    joined.includes("runtime-pick-preparation") ||
    joined.includes("SeedWorldPicker") ||
    joined.includes("SeedWorldPhotoWarmup") ||
    joined.includes("SeedWorldLassoPanel") ||
    joined.includes("compileVariantAsync")
  ) {
    return "pick-photo-bg";
  }
  if (joined.includes("WorldBubbleLoadingScene")) {
    return "loading-scene";
  }
  if (joined.includes("RealtimeIBL") || joined.includes("IBL")) {
    return "ibl";
  }
  if (joined.includes("RenderQueue") || joined.includes("BasicRenderPipeline") || joined.includes("PostProcess")) {
    return "render-loop";
  }
  return "other";
}

export function installSeedWorldShaderAudit(): SeedWorldShaderAuditHandle {
  const passProto = ShaderPass.prototype as unknown as {
    _compileShaderProgram: (
      engine: Engine,
      macroCollection: ShaderMacroCollection,
      deferCompletion?: boolean,
      cacheOnly?: boolean,
      requestedFeedback?: readonly string[]
    ) => InternalShaderProgram;
  };
  const origCompile = passProto._compileShaderProgram;

  let patchedProgProto: { bind: (this: InternalShaderProgram) => boolean } | undefined;
  let origBind: ((this: InternalShaderProgram) => boolean) | undefined;
  let hookedBind: ((this: InternalShaderProgram) => boolean) | undefined;

  const seenPrograms = new WeakSet<InternalShaderProgram>();
  const passCache = new Map<ShaderPass, { shader: string; si: number; pi: number; stage: string }>();
  const compiled: AuditedShaderCompile[] = [];
  const boundAll = new Set<number>();
  const boundByPhase = new Map<string, Set<number>>();
  let currentPhase = "boot-pre-warmup";
  let parallelCompile = false;
  let warmupRequested = 0;
  let warmupDeferred = 0;
  let disposed = false;

  const ensureBindHooked = (program: InternalShaderProgram) => {
    if (patchedProgProto || !program) return;
    const proto = Object.getPrototypeOf(program) as { bind?: (this: InternalShaderProgram) => boolean } | null;
    if (!proto || typeof proto.bind !== "function") return;
    patchedProgProto = proto as { bind: (this: InternalShaderProgram) => boolean };
    origBind = proto.bind;
    hookedBind = function (this: InternalShaderProgram): boolean {
      if (!disposed) {
        boundAll.add(this.id);
        let set = boundByPhase.get(currentPhase);
        if (!set) {
          set = new Set<number>();
          boundByPhase.set(currentPhase, set);
        }
        set.add(this.id);
      }
      return origBind!.call(this);
    };
    patchedProgProto.bind = hookedBind;
  };

  const hookedCompile = function (
    this: ShaderPass,
    engine: Engine,
    macroCollection: ShaderMacroCollection,
    deferCompletion?: boolean,
    cacheOnly?: boolean,
    requestedFeedback?: readonly string[]
  ): InternalShaderProgram {
    const t0 = performance.now();
    const program = origCompile.call(this, engine, macroCollection, deferCompletion, cacheOnly, requestedFeedback);
    const elapsedMs = Math.round((performance.now() - t0) * 100) / 100;
    ensureBindHooked(program);
    if (!disposed && !seenPrograms.has(program)) {
      seenPrograms.add(program);
      const loc = locatePass(this, passCache) ?? {
        shader: `unknown(${this.name})`,
        si: -1,
        pi: -1,
        stage: String(this.getTagValue("pipelineStage") ?? "unknown")
      };
      const elements: ShaderMacro[] = [];
      (
        ShaderMacro as unknown as { _getMacrosElements(m: ShaderMacroCollection, out: ShaderMacro[]): void }
      )._getMacrosElements(macroCollection, elements);
      const macros = elements.map((m) => (m.value === undefined ? m.name : `${m.name}=${m.value}`)).sort();
      const stack = (new Error().stack ?? "")
        .split("\n")
        .slice(2, 10)
        .map((line) => line.trim());
      compiled.push({
        programId: program.id,
        shader: loc.shader,
        si: loc.si,
        pi: loc.pi,
        stage: loc.stage,
        macros,
        phase: currentPhase,
        caller: classifyCaller(stack),
        stack,
        compiledAtMs: Math.round(t0 * 100) / 100,
        elapsedMs
      });
    }
    return program;
  };

  passProto._compileShaderProgram = hookedCompile;

  const handle: SeedWorldShaderAuditHandle = {
    setPhase(phase: string) {
      currentPhase = phase;
    },
    setParallelCompile(supported: boolean) {
      parallelCompile = supported;
    },
    recordWarmupRequested(count: number, deferredCount: number) {
      warmupRequested = count;
      warmupDeferred = deferredCount;
    },
    snapshot() {
      const byPhase: Record<string, number[]> = {};
      for (const [k, v] of boundByPhase.entries()) byPhase[k] = [...v];
      return {
        parallelCompile,
        warmupRequested,
        warmupDeferred,
        compiled: [...compiled],
        boundProgramIds: [...boundAll],
        boundByPhase: byPhase
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (passProto._compileShaderProgram === hookedCompile) passProto._compileShaderProgram = origCompile;
      if (patchedProgProto && origBind && patchedProgProto.bind === hookedBind) {
        patchedProgProto.bind = origBind;
      }
      const win = window as unknown as { __seedWorldShaderAudit?: SeedWorldShaderAuditHandle };
      if (win.__seedWorldShaderAudit === handle) delete win.__seedWorldShaderAudit;
    }
  };

  (window as unknown as { __seedWorldShaderAudit?: SeedWorldShaderAuditHandle }).__seedWorldShaderAudit = handle;
  return handle;
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}

export function summarizeSeedWorldShaderAudit(snapshot: SeedWorldShaderAuditSnapshot): SeedWorldShaderAuditSummary {
  const boundAll = new Set(snapshot.boundProgramIds);
  const boundReveal = new Set(snapshot.boundByPhase.reveal ?? []);
  const byPhase: Record<string, { count: number; totalMs: number; maxMs: number }> = {};
  const byCaller: Record<string, { count: number; totalMs: number; maxMs: number }> = {};
  const byShaderMap = new Map<
    string,
    {
      shader: string;
      count: number;
      totalMs: number;
      maxMs: number;
      startupCount: number;
      boundInRevealCount: number;
      renderMissCount: number;
    }
  >();

  let totalCompileMs = 0;
  let compiledInStartupCount = 0;
  let compiledInStartupMs = 0;
  let startupBoundInRevealCount = 0;
  let revealCompileMissCount = 0;
  let postReadyRenderCompileMissCount = 0;

  const entries: SeedWorldShaderAuditSummaryEntry[] = [];
  const revealCompileMisses: SeedWorldShaderAuditSummaryEntry[] = [];
  const startupWastedInReveal: SeedWorldShaderAuditSummaryEntry[] = [];

  for (const item of snapshot.compiled) {
    const boundInReveal = boundReveal.has(item.programId);
    const boundEver = boundAll.has(item.programId);
    const summaryEntry: SeedWorldShaderAuditSummaryEntry = {
      shader: item.shader,
      stage: item.stage,
      si: item.si,
      pi: item.pi,
      phase: item.phase,
      caller: item.caller,
      compiledAtMs: item.compiledAtMs,
      elapsedMs: item.elapsedMs,
      boundInReveal,
      boundEver,
      macros: item.macros
    };
    entries.push(summaryEntry);
    totalCompileMs += item.elapsedMs;

    const phaseBucket = (byPhase[item.phase] ??= { count: 0, totalMs: 0, maxMs: 0 });
    phaseBucket.count += 1;
    phaseBucket.totalMs += item.elapsedMs;
    if (item.elapsedMs > phaseBucket.maxMs) phaseBucket.maxMs = item.elapsedMs;

    const callerBucket = (byCaller[item.caller] ??= { count: 0, totalMs: 0, maxMs: 0 });
    callerBucket.count += 1;
    callerBucket.totalMs += item.elapsedMs;
    if (item.elapsedMs > callerBucket.maxMs) callerBucket.maxMs = item.elapsedMs;

    let shaderBucket = byShaderMap.get(item.shader);
    if (!shaderBucket) {
      shaderBucket = {
        shader: item.shader,
        count: 0,
        totalMs: 0,
        maxMs: 0,
        startupCount: 0,
        boundInRevealCount: 0,
        renderMissCount: 0
      };
      byShaderMap.set(item.shader, shaderBucket);
    }
    shaderBucket.count += 1;
    shaderBucket.totalMs += item.elapsedMs;
    if (item.elapsedMs > shaderBucket.maxMs) shaderBucket.maxMs = item.elapsedMs;
    if (boundInReveal) shaderBucket.boundInRevealCount += 1;

    if (item.phase === "startup-warmup") {
      compiledInStartupCount += 1;
      compiledInStartupMs += item.elapsedMs;
      shaderBucket.startupCount += 1;
      if (boundInReveal) {
        startupBoundInRevealCount += 1;
      } else {
        startupWastedInReveal.push(summaryEntry);
      }
    }

    const isRenderMiss =
      item.phase === "reveal" || (item.phase === "post-ready" && item.caller === "render-loop");
    if (isRenderMiss) {
      shaderBucket.renderMissCount += 1;
      revealCompileMisses.push(summaryEntry);
      if (item.phase === "reveal") revealCompileMissCount += 1;
      else postReadyRenderCompileMissCount += 1;
    }
  }

  for (const bucket of Object.values(byPhase)) {
    bucket.totalMs = roundMs(bucket.totalMs);
    bucket.maxMs = roundMs(bucket.maxMs);
  }
  for (const bucket of Object.values(byCaller)) {
    bucket.totalMs = roundMs(bucket.totalMs);
    bucket.maxMs = roundMs(bucket.maxMs);
  }

  const byShader = [...byShaderMap.values()]
    .map((b) => ({
      ...b,
      totalMs: roundMs(b.totalMs),
      maxMs: roundMs(b.maxMs)
    }))
    .sort((a, b) => b.totalMs - a.totalMs || b.count - a.count);

  startupWastedInReveal.sort((a, b) => b.elapsedMs - a.elapsedMs || a.shader.localeCompare(b.shader));
  revealCompileMisses.sort((a, b) => a.compiledAtMs - b.compiledAtMs);
  const slowestCompiles = [...entries]
    .sort((a, b) => b.elapsedMs - a.elapsedMs || a.shader.localeCompare(b.shader))
    .slice(0, 35);

  return {
    parallelCompile: snapshot.parallelCompile,
    warmupRequested: snapshot.warmupRequested,
    warmupDeferred: snapshot.warmupDeferred,
    compiledTotal: snapshot.compiled.length,
    totalCompileMs: roundMs(totalCompileMs),
    boundTotalCount: boundAll.size,
    boundInRevealCount: boundReveal.size,
    compiledInStartupCount,
    compiledInStartupMs: roundMs(compiledInStartupMs),
    startupBoundInRevealCount,
    startupWastedInRevealCount: startupWastedInReveal.length,
    revealCompileMissCount,
    postReadyRenderCompileMissCount,
    byPhase,
    byCaller,
    byShader,
    revealCompileMisses: revealCompileMisses.slice(0, 80),
    startupWastedInReveal: startupWastedInReveal.slice(0, 80),
    slowestCompiles
  };
}
