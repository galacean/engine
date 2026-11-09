import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  created: [] as any[]
}));
vi.mock("../src/building/resources/BuildingTextures", () => ({
  leaseBuildingTexture: () => {
    const lease = { value: Promise.resolve({}), destroy: vi.fn() };
    state.created.push(lease);
    return lease;
  }
}));
import { leasePlasterTextures } from "../src/building/runtime/ConstructionPlasterTextures";
import { normalizeProfileFinish } from "../src/building/runtime/ProfileParameters";
import { parsePlasterHex } from "../src/building/runtime/ConstructionPlasterPalette";
import { constructionAssets } from "./fixtures/constructionAssets";
describe("plaster appearance resources", () => {
  it("does not create GPU leases when a discarded preview is destroyed before texture preparation starts", async () => {
    state.created = [];
    const lease = leasePlasterTextures({} as any, constructionAssets());
    lease.destroy();
    expect(await lease.ready).toBeUndefined();
    expect(state.created).toHaveLength(0);
  });
  it("holds both texture leases until view disposal and releases each once", async () => {
    state.created = [];
    const lease = leasePlasterTextures({} as any, constructionAssets());
    const bind = await lease.ready;
    const setTexture = vi.fn();
    bind!({ shaderData: { setTexture } } as any);
    expect(setTexture.mock.calls.map((c) => c[0])).toEqual(["material_PlasterColors", "material_PlasterMortar"]);
    expect(state.created.every((c) => !c.destroy.mock.calls.length)).toBe(true);
    lease.destroy();
    lease.destroy();
    expect(state.created.every((c) => c.destroy.mock.calls.length === 1)).toBe(true);
  });
  it("owns custom color channels and rejects malformed persisted author colors", () => {
    const input: any = { enabled: true, wear: 0.4, color: 3, tint: [0, 0.5, 1] };
    const parsed = normalizeProfileFinish(input);
    input.tint[0] = 0.3;
    expect(parsed.tint).toEqual([0, 0.5, 1]);
    for (const tint of [[0, 1], [-1, 0, 0], [0, 1, NaN], "#ff0000"]) {
      input.tint = tint;
      expect(() => normalizeProfileFinish(input)).toThrow("sRGB");
    }
    expect(parsePlasterHex("#Ff0080")).toEqual([1, 0, 128 / 255]);
    expect(() => parsePlasterHex("red")).toThrow();
  });
});
