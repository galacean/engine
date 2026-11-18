import { expect, it } from "vitest";
import { hashStableValue, hashStableValueAsync } from "@galacean/engine-water/water/compiler/shared/determinism";
import { createRiver } from "@galacean/engine-water/water/authoring/river/createRiver";
import {
  createRiverWaterBodyAsset,
  createRiverWaterBodyAssetAsync
} from "@galacean/engine-water/water/authoring/river/RiverWaterBodyAuthoring";
import {
  computeRiverPhysicalSourceHash,
  computeRiverPhysicalSourceHashAsync
} from "@galacean/engine-water/water/authoring/river/RiverPhysicalSourceIdentity";

// Independent reference for the persisted UTF-16 hash contract, including sparse-array semantics.
function legacy(value: any): string {
  const encode = (v: any): string =>
    v === null
      ? "null"
      : ["number", "boolean", "string"].includes(typeof v)
        ? JSON.stringify(v)
        : Array.isArray(v)
          ? `[${v.map(encode).join(",")}]`
          : typeof v === "object"
            ? `{${Object.keys(v)
                .filter((k) => v[k] !== undefined)
                .sort()
                .map((k) => `${JSON.stringify(k)}:${encode(v[k])}`)
                .join(",")}}`
            : "null";
  let low = 0x811c9dc5,
    high = 0x9e3779b9;
  for (const character of encode(value).split(""))
    for (const byte of [character.charCodeAt(0) & 255, character.charCodeAt(0) >>> 8]) {
      low = Math.imul(low ^ byte, 0x01000193) >>> 0;
      high = Math.imul(high ^ byte, 0x5bd1e995) >>> 0;
      high ^= high >>> 15;
    }
  return [high, low].map((n) => (n >>> 0).toString(16).padStart(8, "0")).join("");
}
it("retains exact persisted hashes for numbers, Unicode, sparse arrays and lexically ordered typed arrays", async () => {
  const sparse = new Array(8);
  sparse[2] = undefined;
  sparse[6] = -0;
  const extended = Object.assign(new Float32Array([1, 2, 3]), { custom: "value" });
  for (const input of [
    null,
    undefined,
    {
      z: "水🌊\ud800",
      omitted: undefined,
      numbers: [-0, NaN, Infinity, -Infinity, Number.MIN_VALUE, 1e21, 0.123456789012345]
    },
    sparse,
    new Uint8Array(121).map((_, i) => i),
    extended,
    { terrain: Array.from({ length: 10000 }, (_, i) => Math.sin(i) * 100) }
  ]) {
    expect(hashStableValue(input)).toBe(legacy(input));
    expect(await hashStableValueAsync(input)).toBe(legacy(input));
  }
});
it("yields to tasks and rejects cancellation without returning a partial identity", async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("superseded")), 0);
  await expect(
    hashStableValueAsync(
      Array.from({ length: 100000 }, (_, i) => i / 7),
      controller.signal
    )
  ).rejects.toThrow("superseded");
  clearTimeout(timer);
  await expect(hashStableValueAsync({}, controller.signal)).rejects.toThrow("superseded");
});
it("keeps distinct asset and physical identities exactly equal to synchronous preparation and detects edits", async () => {
  const descriptor = createRiver({
    id: "identity",
    points: [
      { id: "a", position: [0, 2, 0] },
      { id: "b", position: [30, 1, 10] }
    ],
    width: 4
  });
  expect(await createRiverWaterBodyAssetAsync(descriptor)).toEqual(createRiverWaterBodyAsset(descriptor));
  const initial = computeRiverPhysicalSourceHash(descriptor);
  expect(await computeRiverPhysicalSourceHashAsync(descriptor)).toBe(initial);
  descriptor.nodes[0].elevation += 0.0000000001;
  expect(await computeRiverPhysicalSourceHashAsync(descriptor)).toBe(computeRiverPhysicalSourceHash(descriptor));
  expect(await computeRiverPhysicalSourceHashAsync(descriptor)).not.toBe(initial);
});
