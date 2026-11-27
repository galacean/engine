import { describe, expect, it, vi } from "vitest";
import { Engine, RHIMode, WebGLEngine } from "@galacean/engine";
import { Engine as CoreEngine } from "@galacean/engine-core";

describe("Engine graphics capabilities", () => {
  it("exposes the backend preferences used by URLs", () => {
    expect([RHIMode.Auto, RHIMode.WebGL2, RHIMode.WebGPU]).toEqual(["auto", "webgl2", "webgpu"]);
  });

  it("preserves engine constructor identity and leaves the application's canvas available", async () => {
    expect(Engine).toBe(CoreEngine);
    const canvas = document.createElement("canvas");
    const getContext = vi.spyOn(canvas, "getContext");
    expect(Engine.isWebGL2Supported()).toBe(true);
    expect(getContext).not.toHaveBeenCalled();
    const engine = await WebGLEngine.create({ canvas });
    try {
      expect(engine).toBeInstanceOf(Engine);
    } finally {
      engine.destroy();
    }
  });

  it("releases its WebGL2 probe and handles unavailable contexts", () => {
    const loseContext = vi.fn();
    const probe = { deleteQuery: vi.fn(), getExtension: vi.fn(() => ({ loseContext })) };
    const contexts = vi.spyOn(HTMLCanvasElement.prototype, "getContext");
    try {
      contexts.mockReturnValue(probe as unknown as WebGL2RenderingContext);
      expect(Engine.isWebGL2Supported()).toBe(true);
      expect(probe.getExtension).toHaveBeenCalledWith("WEBGL_lose_context");
      expect(loseContext).toHaveBeenCalledOnce();
      contexts.mockReturnValue(null);
      expect(Engine.isWebGL2Supported()).toBe(false);
    } finally {
      contexts.mockRestore();
    }
  });

  it("reports whether WebGPU can acquire an adapter without requesting a device", () => {
    const requestDevice = vi.fn();
    const requestAdapter = vi
      .fn()
      .mockResolvedValueOnce({ requestDevice })
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error("Adapter unavailable"))
      .mockImplementationOnce(() => {
        throw new Error("Adapter access denied");
      });
    const original = Object.getOwnPropertyDescriptor(navigator, "gpu");
    Object.defineProperty(navigator, "gpu", { configurable: true, value: { requestAdapter } });
    return Promise.all(Array.from({ length: 4 }, () => Engine.isWebGPUSupported()))
      .then((supported) => {
        expect(supported).toEqual([true, false, false, false]);
        expect(requestDevice).not.toHaveBeenCalled();
        Object.defineProperty(navigator, "gpu", { configurable: true, value: undefined });
        return expect(Engine.isWebGPUSupported()).resolves.toBe(false);
      })
      .finally(() => {
        if (original) Object.defineProperty(navigator, "gpu", original);
        else Reflect.deleteProperty(navigator, "gpu");
      });
  });
});
