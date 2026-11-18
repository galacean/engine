import { describe, expect, it, vi } from "vitest";
import { ShaderMacro, SkinnedMeshRenderer, ScreenSpaceReflectionActivationMode } from "@galacean/engine";
import { preparePlantShaderPrograms } from "@galacean/engine-farming/farming/procedural/runtime/preparePlantShaderPrograms";

function fixture() {
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
    shader: { subShaders: [{ passes: [makePass("Forward"), makePass("ShadowCaster")] }] }
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
  const scene = { castShadows: true, shaderData: data, _lightManager: { _updateShaderData() {} } };
  const camera = {
    entity: { scene },
    shaderData: data,
    _updateShaderData() {},
    screenSpaceReflection: { activationMode: ScreenSpaceReflectionActivationMode.ForceOff }
  };
  const engine = {
    _macroCollection: { _length: 0 },
    _hardwareRenderer: { canIUse: () => false, isWebGL2: false },
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
