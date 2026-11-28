import { expect, it, vi } from "vitest";
vi.mock("@galacean/engine", () => ({ EngineEventType: { DeviceLost: "lost" } }));
import { FrozenViewIdentityTexture } from "../src/world/FrozenViewIdentityTexture";

it("retains compact draw ranges and reads pixels only on request, then invalidates on context loss", () => {
  let onLost: () => void = () => {};
  const texture: any = {
    width: 768, height: 432, destroyed: false,
    engine: { on: vi.fn((_event, handler) => { onLost = handler; }), off: vi.fn() },
    getPixelBuffer: vi.fn((_x, _y, _w, _h, _mip, out) => out.fill(1)), destroy: vi.fn()
  };
  const frozen = new FrozenViewIdentityTexture(texture, [
    { base: 1, count: 2, ref: { entityId: 10, componentId: 11, componentType: "MeshRenderer" }, instanced: true, keys: ["a", "b"] },
    { base: 3, count: 1, ref: { entityId: 20, componentId: 21, componentType: "SkinnedMeshRenderer" }, instanced: false }
  ], { identityBits: 14, near: 0.1, far: 100, inverseProjection: [], cameraWorld: [], viewport: [0, 0, 1, 1] });
  expect(texture.getPixelBuffer).not.toHaveBeenCalled();
  expect(texture.isGCIgnored).toBe(true);
  expect(frozen.byteLength).toBe(768 * 432 * 4);
  expect(frozen.resolve(0)).toBeUndefined();
  expect(frozen.resolve(2)).toMatchObject({ entityId: 10, instanceIndex: 1, instanceKey: "b" });
  expect(frozen.resolve(3)).toEqual({ entityId: 20, componentId: 21, componentType: "SkinnedMeshRenderer" });
  expect(frozen.resolve(4)).toBeUndefined();
  expect(frozen.read(4, 5, 1, 1)).toEqual(new Uint8Array([1, 1, 1, 1]));
  expect(texture.getPixelBuffer).toHaveBeenCalledWith(4, 5, 1, 1, 0, expect.any(Uint8Array));
  onLost();
  expect(() => frozen.read(0, 0, 1, 1)).toThrow("SNAPSHOT_EXPIRED");
  frozen.dispose(); frozen.dispose();
  expect(texture.destroy).toHaveBeenCalledTimes(1);
  expect(texture.engine.off).toHaveBeenCalledWith("lost", onLost);
});
