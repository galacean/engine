import { describe, expect, it, vi } from "vitest";
import { ShaderMacro, SkinnedMeshRenderer } from "@galacean/engine";
import { preparePlantShaderPrograms } from "@galacean/engine-farming/farming/procedural/runtime/preparePlantShaderPrograms";

function fixture(options: {
  ssrSceneEnabled?: boolean;
  cameraEnableSSR?: boolean;
  ssrOverride?: { enabled?: boolean; intensity?: number; maxRoughness?: number } | null;
  ssrIntensity?: number;
  contributeSSRDepth?: boolean;
  maxDrawBuffers?: number;
} = {}) {
  const calls: { stage: string; macros: string[]; deferred: boolean }[] = [];
  const data = {
    getMacros: (out: unknown[]) => {
      out.length = 0;
    }
  };
  const makePass = (stage: string) => ({
    getTagValue: () => stage,
    _getShaderProgram: (_engine: unknown, macros: any, deferred: boolean) => {
      const elements: ShaderMacro[] = [];
      ShaderMacro._getMacrosElements(macros, elements);
      calls.push({ stage, macros: elements.map((m) => m.name), deferred });
      let polls = 0;
      return {
        _pollReady: () => ++polls > 1,
        get isValid() {
          expect(polls).toBeGreaterThan(1);
          return true;
        }
      };
    }
  });
  const material = {
    shaderData: data,
    screenSpaceReflectionIntensity: options.ssrIntensity ?? 1,
    contributeScreenSpaceReflectionDepth: options.contributeSSRDepth ?? false,
    shader: {
      subShaders: [
        {
          passes: ["Forward", "ShadowCaster", "DepthOnly", "SSRReceiver", "SSRContributionDepth"].map(makePass)
        }
      ]
    }
  };
  const renderer = Object.assign(Object.create(SkinnedMeshRenderer.prototype), {
    _update: vi.fn(),
    getMaterials: () => [material]
  });
  // Own fields avoid invoking real Renderer setters on this isolated fixture.
  for (const [key, value] of Object.entries({
    mesh: { vertexElements: [{ semantic: "NORMAL" }] },
    shaderData: data,
    castShadows: false,
    receiveShadows: false
  }))
    Object.defineProperty(renderer, key, { value });
  const scene = {
    castShadows: true,
    shaderData: data,
    screenSpaceReflection: {
      enabled: options.ssrSceneEnabled ?? false,
      intensity: 1,
      maxRoughness: 0.6
    },
    _lightManager: { _updateShaderData() {} }
  };
  const camera = {
    entity: { scene },
    shaderData: data,
    _updateShaderData() {},
    enableScreenSpaceReflection: options.cameraEnableSSR ?? false,
    screenSpaceReflectionOverride: options.ssrOverride ?? null
  };
  const engine = {
    _macroCollection: { _length: 0 },
    _hardwareRenderer: {
      canIUse: () => false,
      supportsRendering: true,
      capability: { maxDrawBuffers: options.maxDrawBuffers ?? 1 }
    },
    _renderContext: {}
  };
  const root = { scene, getComponentsIncludeChildren: () => [renderer] };
  return { calls, renderer, engine, root, camera };
}

describe("farm item program readiness", () => {
  it("prepares held and grounded programs asynchronously without changing live shadow state", async () => {
    const f = fixture();
    await preparePlantShaderPrograms(f.engine as any, f.root as any, async (work) => work(), false, {
      camera: f.camera as any,
      shadowStates: () => [
        { cast: false, receive: false },
        { cast: true, receive: true }
      ]
    });
    expect(f.renderer._update).toHaveBeenCalledOnce();
    expect(f.calls.map((c) => [c.stage, c.macros.includes("RENDERER_IS_RECEIVE_SHADOWS"), c.deferred])).toEqual([
      ["Forward", false, true],
      ["Forward", true, true],
      ["ShadowCaster", true, true]
    ]);
    expect(f.renderer.castShadows).toBe(false);
    expect(f.renderer.receiveShadows).toBe(false);
  });
  it("prepares DepthOnly, SSRReceiver, and optional SSRContributionDepth for SSR v2 receivers", async () => {
    const enabled = fixture({
      ssrSceneEnabled: true,
      cameraEnableSSR: true,
      ssrIntensity: 1,
      contributeSSRDepth: true,
      maxDrawBuffers: 2
    });
    await preparePlantShaderPrograms(enabled.engine as any, enabled.root as any, async (work) => work(), false, {
      camera: enabled.camera as any
    });
    expect(enabled.calls.map((c) => c.stage)).toEqual([
      "Forward",
      "DepthOnly",
      "SSRReceiver",
      "SSRContributionDepth"
    ]);

    const overrideOff = fixture({
      ssrSceneEnabled: true,
      cameraEnableSSR: true,
      ssrOverride: { enabled: false, intensity: 1, maxRoughness: 0.6 },
      ssrIntensity: 1,
      contributeSSRDepth: true,
      maxDrawBuffers: 2
    });
    await preparePlantShaderPrograms(overrideOff.engine as any, overrideOff.root as any, async (work) => work(), false, {
      camera: overrideOff.camera as any
    });
    expect(overrideOff.calls.map((c) => c.stage)).toEqual(["Forward"]);
  });
  it("does not submit or poll after the owning item cancels queued work", async () => {
    const f = fixture(),
      controller = new AbortController();
    const pending = preparePlantShaderPrograms(
      f.engine as any,
      f.root as any,
      async (work) => {
        controller.signal.throwIfAborted();
        controller.abort(new Error("Item retired"));
        return work();
      },
      false,
      { camera: f.camera as any }
    );
    await expect(pending).rejects.toThrow("Item retired");
    expect(f.calls).toEqual([]);
  });
});
