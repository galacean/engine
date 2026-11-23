import { expect, it, vi } from "vitest";
vi.mock("@galacean/engine", () => ({ EngineEventType: { DeviceLost: "lost" } }));
import { FrozenViewIdentityTexture } from "../src/world/FrozenViewIdentityTexture";

it("retains compact draw ranges and reads the GPU once before serving synchronous tiles, then invalidates on device loss", async () => {
  let onLost: () => void = () => {};
  const texture: any = {
    width: 768, height: 432, destroyed: false,
    engine: { on: vi.fn((_event, handler) => { onLost = handler; }), off: vi.fn() },
    getPixelBufferAsync: vi.fn(async (out: Uint8Array) => {
      out.set([1, 2, 3, 4], (5 * 768 + 4) * 4);
      out.set([5, 6, 7, 8], (6 * 768 + 4) * 4);
    }), destroy: vi.fn(() => { texture.destroyed = true; })
  };
  const frozen = new FrozenViewIdentityTexture(texture, [
    { base: 1, count: 2, ref: { entityId: 10, componentId: 11, componentType: "MeshRenderer" }, instanced: true, keys: ["a", "b"] },
    { base: 3, count: 1, ref: { entityId: 20, componentId: 21, componentType: "SkinnedMeshRenderer" }, instanced: false }
  ], { identityBits: 14, near: 0.1, far: 100, inverseProjection: [], cameraWorld: [], viewport: [0, 0, 1, 1] });
  expect(texture.getPixelBufferAsync).not.toHaveBeenCalled();
  await frozen.prepareReadback();
  expect(texture.isGCIgnored).toBe(true);
  expect(frozen.byteLength).toBe(768 * 432 * 4);
  expect(frozen.resolve(0)).toBeUndefined();
  expect(frozen.resolve(2)).toMatchObject({ entityId: 10, instanceIndex: 1, instanceKey: "b" });
  expect(frozen.resolve(3)).toEqual({ entityId: 20, componentId: 21, componentType: "SkinnedMeshRenderer" });
  expect(frozen.resolve(4)).toBeUndefined();
  expect(frozen.read(4, 5, 1, 2)).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
  expect(texture.getPixelBufferAsync).toHaveBeenCalledTimes(1);
  onLost();
  expect(() => frozen.read(0, 0, 1, 1)).toThrow("SNAPSHOT_EXPIRED");
  frozen.dispose(); frozen.dispose();
  expect(texture.destroy).toHaveBeenCalledTimes(1);
  expect(texture.engine.off).toHaveBeenCalledWith("lost", onLost);
});
