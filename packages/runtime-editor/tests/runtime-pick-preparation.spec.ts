import { afterEach, describe, expect, it, vi } from "vitest";
import { Logger, Shader, ShaderLanguage, ShaderMacro, ShaderPass } from "@galacean/engine";
import { pickOcclusionPass } from "../src/runtime-inspection/runtime-pick-occlusion";
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

  it("skips orthographic and transient animation variants and strips SSR macros from pick clones", () => {
    const { queue, emit } = createHarness();
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

    emit(pass, [ShaderMacro.getByName("CAMERA_ORTHOGRAPHIC")]);
    emit(pass, [ShaderMacro.getByName("RENDERER_GENERATION_REVEAL")]);
    emit(pass, [ShaderMacro.getByName("RENDERER_MASONRY_ENTRANCE")]);
    emit(pass, [ShaderMacro.getByName("GLOBAL_PROXY_DITHER")]);
    expect(queue).toHaveLength(0);

    emit(pass, [
      ShaderMacro.getByName("CAMERA_ENABLE_SSR"),
      ShaderMacro.getByName("SSR_PACKED_HDR_REINHARD"),
      ShaderMacro.getByName("RENDERER_HAS_UV")
    ]);
    // Second variant differing only by stripped SSR macros deduplicates cleanly to the same pick key.
    emit(pass, [ShaderMacro.getByName("RENDERER_HAS_UV")]);
    expect(queue).toHaveLength(1);
    const macroNames = queue[0]!.macros.map((m) => m.name);
    expect(macroNames).toContain("RENDERER_HAS_UV");
    expect(macroNames).toContain("RENDERER_WORLD_PICK");
    expect(macroNames).not.toContain("CAMERA_ENABLE_SSR");
    expect(macroNames).not.toContain("SSR_PACKED_HDR_REINHARD");
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
