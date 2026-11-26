import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Camera,
  Layer,
  Logger,
  Material,
  ParticleRenderer,
  Shader,
  ShaderLanguage,
  ShaderMacro,
  ShaderPass
} from "@galacean/engine";
import { HeadlessEngine } from "../../rhi-null/src/HeadlessEngine";
import { RuntimePickOcclusion, pickOcclusionPass } from "../src/runtime-inspection/runtime-pick-occlusion";
import { RuntimePickPreparation } from "../src/runtime-inspection/runtime-pick-preparation";

function makeForwardPass(name = "Forward"): ShaderPass {
  return new ShaderPass(
    name,
    [[0, "void main(){gl_Position=vec4(0.0);}"]],
    [[0, "void main(){gl_FragColor=vec4(1.0);}"]],
    ShaderLanguage.GLSLES300,
    { pipelineStage: "Forward" }
  );
}

describe("RuntimePickPreparation non-scene shader filtering", () => {
  const createdShaders: Shader[] = [];
  const preparations: RuntimePickPreparation[] = [];

  function trackShader(name: string): Shader {
    const shader = Shader.create(name, [makeForwardPass()])!;
    createdShaders.push(shader);
    return shader;
  }

  function createHarness() {
    let observer: ((pass: ShaderPass, macros: readonly ShaderMacro[]) => void) | undefined;
    vi.spyOn(ShaderPass, "observeVariants").mockImplementation((_engine, cb) => {
      observer = cb;
      return () => {
        observer = undefined;
      };
    });
    // Avoid compiling built-in PBR/Unlit/BlinnPhong replacement shaders when ShaderCompiler is not initialized.
    const findSpy = vi.spyOn(Shader, "find").mockReturnValue(null);
    const prep = new RuntimePickPreparation({} as never);
    findSpy.mockRestore();
    preparations.push(prep);

    const queue = (prep as unknown as { queue: Array<{ pass: ShaderPass; macros: readonly ShaderMacro[] }> }).queue;
    vi.spyOn(prep as unknown as { start(): void }, "start").mockImplementation(() => {});

    return {
      prep,
      queue,
      emit(pass: ShaderPass, macros: readonly ShaderMacro[] = []) {
        observer!(pass, macros);
      }
    };
  }

  afterEach(() => {
    for (const prep of preparations.splice(0)) prep.dispose();
    for (const shader of createdShaders.splice(0)) {
      if (!shader.destroyed) shader.destroy(true);
    }
    vi.restoreAllMocks();
  });

  it("retains the compiled layout when deriving an occlusion pass", () => {
    const blocks = [{ name: "Camera" as const, bindingName: "gs_Camera", byteLength: 16, members: [] }];
    const base = new ShaderPass(
      "Forward",
      [[0, "void main(){gl_Position=vec4(0.0);}"]],
      [[0, "void main(){gl_FragColor=vec4(1.0);}"]],
      ShaderLanguage.GLSLES300,
      undefined,
      undefined,
      blocks
    );
    const { pass } = pickOcclusionPass(base);
    expect((pass as unknown as { _uniformBlocks: typeof blocks })._uniformBlocks).toBe(blocks);
  });

  it("skips built-in and host-registered non-scene prefixes while queuing scene shaders", () => {
    const { prep, queue, emit } = createHarness();
    prep.ignoreShaderPrefixes(["HostNonScene/"]);

    const sceneShader = trackShader("TestScene/Surface");
    const enginePost = trackShader("PostProcess/TestBloom");
    const hostIgnored = trackShader("HostNonScene/Overlay");

    emit(sceneShader.subShaders[0].passes[0]);
    emit(enginePost.subShaders[0].passes[0]);
    emit(hostIgnored.subShaders[0].passes[0]);

    expect(queue).toHaveLength(1);
  });

  it("re-scans after a shader is destroyed and a lazily created ignored shader restores the same registry key count", () => {
    const { prep, queue, emit } = createHarness();
    prep.ignoreShaderPrefixes(["SeedWorld/SnapshotSurfacePack"]);

    const transientScene = trackShader("WaterFar/test-transient-uuid");
    emit(transientScene.subShaders[0].passes[0]);
    expect(queue).toHaveLength(1);

    const registry = (Shader as unknown as { _shaderMap: Record<string, Shader[]> })._shaderMap;
    const countBeforeDestroy = Object.keys(registry).length;

    transientScene.destroy(true);
    expect(Object.keys(registry).length).toBe(countBeforeDestroy - 1);

    const lazyIgnored = trackShader("SeedWorld/SnapshotSurfacePack");
    expect(Object.keys(registry).length).toBe(countBeforeDestroy);

    emit(lazyIgnored.subShaders[0].passes[0]);
    expect(queue).toHaveLength(1);
  });

  it("ignores a newly created namesake shader appended to an existing Shader[] entry", () => {
    const { prep, queue, emit } = createHarness();
    prep.ignoreShaderPrefixes(["HostNonScene/"]);

    const first = trackShader("HostNonScene/SharedName");
    emit(first.subShaders[0].passes[0]);
    expect(queue).toHaveLength(0);

    const registry = (Shader as unknown as { _shaderMap: Record<string, Shader[]> })._shaderMap;
    const countBeforeNamesake = Object.keys(registry).length;

    const second = trackShader("HostNonScene/SharedName");
    expect(Object.keys(registry).length).toBe(countBeforeNamesake);
    expect(registry["HostNonScene/SharedName"].length).toBeGreaterThanOrEqual(2);

    emit(second.subShaders[0].passes[0]);
    expect(queue).toHaveLength(0);
  });

  it("invalidates cached pass classifications when ignoreShaderPrefixes adds a new prefix", () => {
    const { prep, queue, emit } = createHarness();
    const custom = trackShader("LateIgnored/HudPass");
    const pass = custom.subShaders[0].passes[0];

    emit(pass, []);
    expect(queue).toHaveLength(1);

    prep.ignoreShaderPrefixes(["LateIgnored/"]);
    emit(pass, [ShaderMacro.getByName("TEST_SECOND_VARIANT")]);
    expect(queue).toHaveLength(1);
  });

  it("negative-caches unregistered standalone ShaderPass instances to avoid repeated registry scans", () => {
    const { queue, emit } = createHarness();
    const standalonePass = makeForwardPass("StandaloneForward");
    const valuesSpy = vi.spyOn(Object, "values");

    emit(standalonePass, []);
    expect(queue).toHaveLength(1);
    const scansAfterFirst = valuesSpy.mock.calls.length;
    expect(scansAfterFirst).toBe(1);

    emit(standalonePass, [ShaderMacro.getByName("TEST_STANDALONE_SECOND")]);
    expect(queue).toHaveLength(2);
    expect(valuesSpy.mock.calls.length).toBe(scansAfterFirst);
  });

  it("skips orthographic and host-registered transient macros and strips SSR/AO macros from pick clones", () => {
    const { prep, queue, emit } = createHarness();
    const pickable = Shader.create("TestScene/PickableSurface", [
      new ShaderPass(
        "Forward",
        [[0, "void main(){gl_Position=vec4(0.0);}"]],
        [
          [1, "RENDERER_WORLD_PICK", 2],
          [0, "void main(){gl_FragColor=vec4(1.0);}"]
        ],
        ShaderLanguage.GLSLES300,
        { pipelineStage: "Forward" }
      )
    ])!;
    createdShaders.push(pickable);
    const pass = pickable.subShaders[0].passes[0];

    // Generic engine macro is skipped out of the box; host-owned domain macros must be registered via ignoreSourceMacros.
    emit(pass, [ShaderMacro.getByName("CAMERA_ORTHOGRAPHIC")]);
    expect(queue).toHaveLength(0);

    prep.ignoreSourceMacros(["HOST_ENTRANCE_MACRO", "HOST_DITHER_MACRO"]);
    emit(pass, [ShaderMacro.getByName("HOST_ENTRANCE_MACRO")]);
    emit(pass, [ShaderMacro.getByName("HOST_DITHER_MACRO")]);
    expect(queue).toHaveLength(0);

    emit(pass, [
      ShaderMacro.getByName("CAMERA_ENABLE_SSR"),
      ShaderMacro.getByName("SSR_PACKED_HDR_REINHARD"),
      ShaderMacro.getByName("SCENE_SHADOW_TYPE", "1"),
      ShaderMacro.getByName("SCENE_ENABLE_AMBIENT_OCCLUSION"),
      ShaderMacro.getByName("RENDERER_HAS_UV")
    ]);
    // Second variant differing only by stripped SSR/AO macros deduplicates cleanly to the same pick key
    // while keeping SCENE_SHADOW_TYPE (which stays active on scene.shaderData during offscreen pick render).
    emit(pass, [ShaderMacro.getByName("SCENE_SHADOW_TYPE", "1"), ShaderMacro.getByName("RENDERER_HAS_UV")]);
    expect(queue).toHaveLength(1);
    const macroNames = queue[0]!.macros.map((m) => m.name);
    expect(macroNames).toContain("RENDERER_HAS_UV");
    expect(macroNames).toContain("RENDERER_WORLD_PICK");
    expect(macroNames).toContain("SCENE_SHADOW_TYPE");
    expect(macroNames).not.toContain("CAMERA_ENABLE_SSR");
    expect(macroNames).not.toContain("SSR_PACKED_HDR_REINHARD");
    expect(macroNames).not.toContain("SCENE_ENABLE_AMBIENT_OCCLUSION");
  });
});

describe("pickOcclusionPass pipelineStage cache sync", () => {
  it("preserves pipelineStage tag and cached _pipelineStage on derived occlusion passes without triggering tag-replacement warnings", () => {
    const warnSpy = vi.spyOn(Logger, "warn");
    try {
      const shadowPass = new ShaderPass(
        "ShadowCaster",
        [[0, "void main(){gl_Position=vec4(0.0);}"]],
        [[0, "void main(){gl_FragColor=vec4(1.0);}"]],
        ShaderLanguage.GLSLES300,
        { pipelineStage: "ShadowCaster" }
      );
      const forwardPass = makeForwardPass("Forward");
      const customNoStagePass = makeForwardPass("Unstaged");
      customNoStagePass.deleteTag("pipelineStage");
      warnSpy.mockClear();

      const derivedShadow = pickOcclusionPass(shadowPass).pass;
      const derivedForward = pickOcclusionPass(forwardPass).pass;
      const derivedUnstaged = pickOcclusionPass(customNoStagePass).pass;

      expect(warnSpy).not.toHaveBeenCalled();

      expect(derivedShadow.getTagValue("pipelineStage")).toBe("ShadowCaster");
      expect((derivedShadow as unknown as { _pipelineStage?: string })._pipelineStage).toBe("ShadowCaster");

      expect(derivedForward.getTagValue("pipelineStage")).toBe("Forward");
      expect((derivedForward as unknown as { _pipelineStage?: string })._pipelineStage).toBe("Forward");

      expect(derivedUnstaged.getTagValue("pipelineStage")).toBeUndefined();
      expect((derivedUnstaged as unknown as { _pipelineStage?: string })._pipelineStage).toBeUndefined();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("defers replacement shader work and compilation until resume() when deferStart is true", () => {
    let observer: ((pass: ShaderPass, macros: readonly ShaderMacro[]) => void) | undefined;
    vi.spyOn(ShaderPass, "observeVariants").mockImplementation((_engine, cb) => {
      observer = cb;
      return () => {
        observer = undefined;
      };
    });
    const findSpy = vi.spyOn(Shader, "find").mockReturnValue(null);
    const prep = new RuntimePickPreparation({} as never, { deferStart: true });
    const sceneShader = Shader.create("TestScene/DeferredSurface", [makeForwardPass()])!;
    try {
      expect(findSpy).not.toHaveBeenCalled();
      expect(prep.ready).toBe(false);

      const queue = (prep as unknown as { queue: Array<{ pass: ShaderPass; macros: readonly ShaderMacro[] }> }).queue;
      vi.spyOn(prep as unknown as { start(): void }, "start").mockImplementation(() => {});

      observer!(sceneShader.subShaders[0].passes[0], []);
      expect(queue).toHaveLength(0);

      prep.resume();
      expect(findSpy).toHaveBeenCalled();
      expect(queue).toHaveLength(1);
      expect(prep.ready).toBe(true);

      prep.pause();
      expect(prep.ready).toBe(false);
    } finally {
      prep.dispose();
      if (!sceneShader.destroyed) sceneShader.destroy(true);
      vi.restoreAllMocks();
    }
  });
});

describe("RuntimePickPreparation dual-gear sliding-window scheduler", () => {
  const createdShaders: Shader[] = [];
  const preparations: RuntimePickPreparation[] = [];

  function createControlledEngine(parallel = true) {
    return {
      _hardwareRenderer: {
        gl: {
          getExtension: (name: string) => (parallel && name === "KHR_parallel_shader_compile" ? {} : null)
        }
      }
    } as never;
  }

  function createDeferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  function waitMicrotasks(turns = 6): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, turns * 4));
  }

  afterEach(() => {
    for (const prep of preparations.splice(0)) prep.dispose();
    for (const shader of createdShaders.splice(0)) {
      if (!shader.destroyed) shader.destroy(true);
    }
    vi.restoreAllMocks();
  });

  it("refills freed sliding-window slots immediately without waiting for slow peers", async () => {
    let observer: ((pass: ShaderPass, macros: readonly ShaderMacro[]) => void) | undefined;
    vi.spyOn(ShaderPass, "observeVariants").mockImplementation((_engine, cb) => {
      observer = cb;
      return () => {
        observer = undefined;
      };
    });
    vi.spyOn(Shader, "find").mockReturnValue(null);

    const gates: Array<ReturnType<typeof createDeferred<boolean>>> = [];
    vi.spyOn(ShaderPass.prototype, "compileVariantAsync").mockImplementation(() => {
      const gate = createDeferred<boolean>();
      gates.push(gate);
      return gate.promise;
    });

    const prep = new RuntimePickPreparation(createControlledEngine(true), {
      backgroundConcurrency: 2,
      flushConcurrency: 6
    });
    preparations.push(prep);
    const shader = Shader.create("TestScene/SlidingWindow", [makeForwardPass()])!;
    createdShaders.push(shader);
    const pass = shader.subShaders[0].passes[0];

    observer!(pass, [ShaderMacro.getByName("SW_0")]);
    observer!(pass, [ShaderMacro.getByName("SW_1")]);
    observer!(pass, [ShaderMacro.getByName("SW_2")]);

    await waitMicrotasks(3);
    expect(gates).toHaveLength(2);

    // Resolve only the 2nd (fast) program while the 1st (slow) program is still pending:
    // the 3rd program should start immediately instead of blocking behind Promise.all.
    gates[1]!.resolve(true);
    await waitMicrotasks(3);
    expect(gates).toHaveLength(3);

    gates[0]!.resolve(true);
    gates[2]!.resolve(true);
    await prep.flush();
    expect(prep.ready).toBe(true);
  });

  it("escalates concurrency and wakes immediately when flush() arrives during background drain", async () => {
    let observer: ((pass: ShaderPass, macros: readonly ShaderMacro[]) => void) | undefined;
    vi.spyOn(ShaderPass, "observeVariants").mockImplementation((_engine, cb) => {
      observer = cb;
      return () => {
        observer = undefined;
      };
    });
    vi.spyOn(Shader, "find").mockReturnValue(null);

    const gates: Array<ReturnType<typeof createDeferred<boolean>>> = [];
    vi.spyOn(ShaderPass.prototype, "compileVariantAsync").mockImplementation(() => {
      const gate = createDeferred<boolean>();
      gates.push(gate);
      return gate.promise;
    });

    const prep = new RuntimePickPreparation(createControlledEngine(true), {
      backgroundConcurrency: 1,
      flushConcurrency: 5,
      backgroundCooldownMs: 250
    });
    preparations.push(prep);
    const shader = Shader.create("TestScene/Escalation", [makeForwardPass()])!;
    createdShaders.push(shader);
    const pass = shader.subShaders[0].passes[0];

    for (let i = 0; i < 6; i++) {
      observer!(pass, [ShaderMacro.getByName(`ESC_${i}`)]);
    }

    // In background mode, only backgroundConcurrency (1) starts.
    await waitMicrotasks(3);
    expect(gates).toHaveLength(1);

    // Trigger flush(): it must wake immediately and expand up to flushConcurrency (5).
    const flushAbort = new AbortController();
    const flushPromise = prep.flush(flushAbort.signal);
    await waitMicrotasks(3);
    expect(gates).toHaveLength(5);

    // Aborting one flush caller restores background pacing (urgentFlushCount -> 0) and rejects only that caller.
    flushAbort.abort(new DOMException("cancelled", "AbortError"));
    await expect(flushPromise).rejects.toThrow();

    for (const gate of gates) gate.resolve(true);
    await waitMicrotasks(3);
    // Back in backgroundCooldownMs (250ms), so the 6th variant waits until cooldown or next flush().
    expect(gates).toHaveLength(5);

    const secondFlush = prep.flush();
    await waitMicrotasks(3);
    expect(gates).toHaveLength(6);
    gates[5]!.resolve(true);

    await secondFlush;
    expect(prep.ready).toBe(true);
  });

  it("keeps urgent concurrency active across beginUrgent() lease even for newly observed variants", async () => {
    let observer: ((pass: ShaderPass, macros: readonly ShaderMacro[]) => void) | undefined;
    vi.spyOn(ShaderPass, "observeVariants").mockImplementation((_engine, cb) => {
      observer = cb;
      return () => {
        observer = undefined;
      };
    });
    vi.spyOn(Shader, "find").mockReturnValue(null);

    const gates: Array<ReturnType<typeof createDeferred<boolean>>> = [];
    vi.spyOn(ShaderPass.prototype, "compileVariantAsync").mockImplementation(() => {
      const gate = createDeferred<boolean>();
      gates.push(gate);
      return gate.promise;
    });

    const prep = new RuntimePickPreparation(createControlledEngine(true), {
      backgroundConcurrency: 1,
      flushConcurrency: 4,
      backgroundCooldownMs: 250
    });
    preparations.push(prep);
    const shader = Shader.create("TestScene/UrgentLease", [makeForwardPass()])!;
    createdShaders.push(shader);
    const pass = shader.subShaders[0].passes[0];

    const endUrgent = prep.beginUrgent();
    try {
      for (let i = 0; i < 4; i++) observer!(pass, [ShaderMacro.getByName(`LEASE_${i}`)]);
      await waitMicrotasks(3);
      expect(gates).toHaveLength(4);
      for (const gate of gates) gate.resolve(true);
      await prep.flush();
    } finally {
      endUrgent();
    }
    expect(prep.ready).toBe(true);
  });

  it("yields to a macrotask before background compile, preserves cooldown on incoming variants, and avoids spurious Promise.race when full", async () => {
    let observer: ((pass: ShaderPass, macros: readonly ShaderMacro[]) => void) | undefined;
    vi.spyOn(ShaderPass, "observeVariants").mockImplementation((_engine, cb) => {
      observer = cb;
      return () => {
        observer = undefined;
      };
    });
    vi.spyOn(Shader, "find").mockReturnValue(null);

    const gates: Array<ReturnType<typeof createDeferred<boolean>>> = [];
    const starts: number[] = [];
    const raceSpy = vi.spyOn(Promise, "race");
    vi.spyOn(ShaderPass.prototype, "compileVariantAsync").mockImplementation(() => {
      starts.push(performance.now());
      const gate = createDeferred<boolean>();
      gates.push(gate);
      return gate.promise;
    });

    const prep = new RuntimePickPreparation(createControlledEngine(true), {
      backgroundConcurrency: 2,
      flushConcurrency: 6,
      backgroundCooldownMs: 90
    });
    preparations.push(prep);
    const shader = Shader.create("TestScene/WakeChannels", [makeForwardPass()])!;
    createdShaders.push(shader);
    const pass = shader.subShaders[0].passes[0];

    // 1. Initial background yield must stay a real macrotask (never cancelled synchronously by request()).
    observer!(pass, [ShaderMacro.getByName("WC_0")]);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(gates).toHaveLength(0);

    // After macrotask fires, WC_0 starts in slot 1/2.
    await waitMicrotasks(3);
    expect(gates).toHaveLength(1);

    // 2. Arriving WC_1 while slot 2/2 is free wakes raceInFlightOrWake immediately (without waiting for cooldown or WC_0).
    observer!(pass, [ShaderMacro.getByName("WC_1")]);
    await waitMicrotasks(2);
    expect(gates).toHaveLength(2);

    // 3. While inFlight is FULL (2/2), arriving variants must NOT cause spurious Promise.race subscriptions.
    const racesWhileFullBefore = raceSpy.mock.calls.length;
    observer!(pass, [ShaderMacro.getByName("WC_2")]);
    observer!(pass, [ShaderMacro.getByName("WC_3")]);
    for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(raceSpy.mock.calls.length).toBe(racesWhileFullBefore);
    expect(gates).toHaveLength(2);

    // 4. Settling WC_0 enters backgroundCooldownMs (90ms); arriving WC_4 mid-cooldown must NOT cancel the cooldown.
    const settledAt = performance.now();
    gates[0]!.resolve(true);
    await new Promise((r) => setTimeout(r, 20));
    observer!(pass, [ShaderMacro.getByName("WC_4")]);
    await new Promise((r) => setTimeout(r, 25));
    expect(gates).toHaveLength(2);

    // After full 90ms cooldown elapses, WC_2 launches.
    await new Promise((r) => setTimeout(r, 80));
    expect(gates.length).toBeGreaterThanOrEqual(3);
    expect(starts[2]! - settledAt).toBeGreaterThanOrEqual(80);

    const flushPromise = prep.flush();
    await waitMicrotasks(3);
    for (const gate of gates) gate.resolve(true);
    await flushPromise;
    expect(gates).toHaveLength(5);
    expect(prep.ready).toBe(true);
  });

  it("falls back to concurrency 1 in background and 4 in flush when KHR_parallel_shader_compile is unavailable", async () => {
    let observer: ((pass: ShaderPass, macros: readonly ShaderMacro[]) => void) | undefined;
    vi.spyOn(ShaderPass, "observeVariants").mockImplementation((_engine, cb) => {
      observer = cb;
      return () => {
        observer = undefined;
      };
    });
    vi.spyOn(Shader, "find").mockReturnValue(null);

    const gates: Array<ReturnType<typeof createDeferred<boolean>>> = [];
    vi.spyOn(ShaderPass.prototype, "compileVariantAsync").mockImplementation(() => {
      const gate = createDeferred<boolean>();
      gates.push(gate);
      return gate.promise;
    });

    const prep = new RuntimePickPreparation(createControlledEngine(false));
    preparations.push(prep);
    const shader = Shader.create("TestScene/NoParallel", [makeForwardPass()])!;
    createdShaders.push(shader);
    const pass = shader.subShaders[0].passes[0];

    for (let i = 0; i < 6; i++) observer!(pass, [ShaderMacro.getByName(`NP_${i}`)]);
    await waitMicrotasks(3);
    expect(gates).toHaveLength(1);

    const flushPromise = prep.flush();
    await waitMicrotasks(3);
    expect(gates).toHaveLength(4);

    for (const gate of gates) gate.resolve(true);
    await waitMicrotasks(3);
    expect(gates).toHaveLength(6);
    gates[4]!.resolve(true);
    gates[5]!.resolve(true);
    await flushPromise;
    expect(prep.ready).toBe(true);
  });

  it("RuntimePickOcclusion skips non-occluding ParticleRenderer via camera.renderFilter without firing _onDisable or stopping particles", async () => {
    const engine = await HeadlessEngine.create({ glTFLoader: { meshOpt: { workerCount: 0 } } });
    try {
      const scene = engine.sceneManager.activeScene!;
      const cameraEntity = scene.createRootEntity("PickCam");
      const camera = cameraEntity.addComponent(Camera);
      camera.cullingMask = Layer.Everything;

      const transparentPass = makeForwardPass("Forward");
      (
        transparentPass as unknown as {
          _renderState: { depthState: { enabled: boolean; writeEnabled: boolean }; stencilState: { enabled: boolean } };
        }
      )._renderState.depthState.writeEnabled = false;
      (
        transparentPass as unknown as {
          _renderState: { stencilState: { enabled: boolean } };
        }
      )._renderState.stencilState.enabled = false;
      const transparentShader = Shader.create("TestPick/TransparentParticle", [transparentPass])!;
      createdShaders.push(transparentShader);
      const transparentMat = new Material(engine, transparentShader);

      const particleEntity = scene.createRootEntity("Petals");
      const particle = particleEntity.addComponent(ParticleRenderer);
      particle.setMaterial(transparentMat);
      particle.generator.main.playOnEnabled = false;
      const onDisableSpy = vi.spyOn(particle, "_onDisable");
      const stopSpy = vi.spyOn(particle.generator, "stop");

      const priorFilter = vi.fn(() => true);
      camera.renderFilter = priorFilter;

      const occlusion = new RuntimePickOcclusion();
      occlusion.prepare(camera, new Set());

      // ParticleRenderer must stay enabled (never triggering _onDisable / stop) and be filtered via camera.renderFilter.
      expect(particle.enabled).toBe(true);
      expect(onDisableSpy).not.toHaveBeenCalled();
      expect(stopSpy).not.toHaveBeenCalled();
      expect(camera.renderFilter).not.toBe(priorFilter);
      expect(camera.renderFilter!(particle)).toBe(false);
      // Unrelated renderables delegate to the prior camera.renderFilter.
      expect(camera.renderFilter!({} as never)).toBe(true);
      expect(priorFilter).toHaveBeenCalledTimes(1);

      occlusion.restore();
      expect(camera.renderFilter).toBe(priorFilter);
      expect(particle.enabled).toBe(true);
      transparentMat.destroy(true);
    } finally {
      engine.destroy();
    }
  });
});
