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
  readonly elapsedMs: number;
}

export interface SeedWorldShaderAuditHandle {
  setPhase(phase: string): void;
  setParallelCompile(supported: boolean): void;
  recordWarmupRequested(count: number, deferredCount: number): void;
  snapshot(): {
    readonly parallelCompile: boolean;
    readonly warmupRequested: number;
    readonly warmupDeferred: number;
    readonly compiled: readonly AuditedShaderCompile[];
    readonly boundProgramIds: readonly number[];
    readonly boundByPhase: Readonly<Record<string, readonly number[]>>;
  };
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
    joined.includes("SeedWorldInstantCamera") ||
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
