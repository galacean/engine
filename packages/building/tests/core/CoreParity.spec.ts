// COMPAT(online-parity): compares the core path with the live online path. Before the
// online path is deleted, freeze its outputs as baseline hashes; see ../../src/building/MIGRATION.md.
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { nativeAssets } from "../fixtures/constructionAssets";
import { European } from "../../src/building/parts/architecture/European";
import { designBuilding } from "../../src/building/parts/architecture/BuildingDesign";
import { implementBuilding } from "../../src/building/parts/architecture/BuildingImplementation";
import { buildBuildingRenderPackage, type BuildingRenderInput } from "../../src/building/runtime/BuildingRenderPackage";
import { buildingGlobals } from "../../src/building/runtime/BuildingGlobals";
import { designBuildingCore } from "../../src/building/core";
import { createStripRegistry } from "../../src/building/partTypes/Strip";
import { buildCoreFence, buildCoreWall, type CoreBuilding } from "../../src/building/application/CoreEuropean";
import { coreRenderInput } from "../../src/building/render/CoreRenderInput";
import { packConstructionUnits } from "../../src/building/runtime/ConstructionUnitRender";

type Ground = (x: number, z: number) => number;
const flat: Ground = () => 0;
/** Rolling ground supplied by the test, as the terrain system would supply it. */
const hills: Ground = (x, z) => 0.35 * Math.sin(0.6 * x + 0.3) + 0.2 * Math.cos(0.45 * z);

const hash = (data: ArrayBuffer) => createHash("sha256").update(new Uint8Array(data)).digest("hex");
async function legacy(draft: Parameters<typeof designBuilding>[0], ground: Ground) {
  return (await implementBuilding(designBuilding(draft, ground, nativeAssets.compilation))).renderInput;
}
async function core(building: CoreBuilding, ground: Ground) {
  const registry = createStripRegistry();
  const result = designBuildingCore(building.draft, registry, { environment: { ground } });
  return coreRenderInput(result, building.render, registry, ground, nativeAssets);
}
async function files(input: BuildingRenderInput) {
  const built = buildBuildingRenderPackage(
    input,
    nativeAssets,
    buildingGlobals(input.paletteSlots, nativeAssets.frame),
    true
  );
  const out: Record<string, string> = {};
  for (const file of built.dynamicFiles) out[file] = hash(await built.asset(file));
  return { draws: built.package.draws, files: out };
}
/** True when two buffers differ only in the sign bit of zeros (half or float). */
function zeroSignOnly(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if ((a[i] ^ b[i]) !== 0x80 || (a[i] & 0x7f) !== 0 || i < 1 || a[i - 1] !== 0 || b[i - 1] !== 0) return false;
  }
  return true;
}
/** The online kernels write -s where s = 0, so some axes carry -0. Rendering treats it
 * as 0. Normalize the sign of zero and repack the units with the same packer. */
async function canonical(input: BuildingRenderInput): Promise<BuildingRenderInput> {
  const zeros = (v: unknown): unknown =>
    v instanceof Uint8Array
      ? v
      : Array.isArray(v)
        ? v.map(zeros)
        : v && typeof v === "object"
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, zeros(x)]))
          : Object.is(v, -0)
            ? 0
            : v;
  const out = zeros(input) as BuildingRenderInput;
  for (const group of out.groups as any[])
    group.units = await packConstructionUnits({ cells: group.cells, slot: 0, role: group.role, source: {} });
  return out;
}
/** Largest absolute difference between two numeric trees; Infinity on a shape mismatch. */
function maxDelta(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b);
  if (a instanceof Uint8Array || b instanceof Uint8Array) return 0;
  if (Array.isArray(a) !== Array.isArray(b) || typeof a !== typeof b) return Infinity;
  if (a && typeof a === "object") {
    let max = 0;
    for (const k of new Set([...Object.keys(a), ...Object.keys(b as object)]))
      max = Math.max(max, maxDelta((a as any)[k], (b as any)[k]));
    return max;
  }
  return a === b ? 0 : Infinity;
}

// Axis-aligned walls on flat ground: the core reproduces the online bytes.
const exact = [
  ["wall", () => European.buildWall({ id: "a" }), () => buildCoreWall({ id: "a" })],
  [
    "long wall",
    () => European.buildWall({ id: "w", seed: 3, length: 11.3, height: 2.2, center: [2, -1] }),
    () => buildCoreWall({ id: "w", seed: 3, length: 11.3, height: 2.2, center: [2, -1] })
  ]
] as const;
// The rest agree to rounding. Fence rails are segments between two posts, centred as
// start + direction × half length, where the online path computes -L/2 + (i + 0.5) × spacing.
// Rotations use the core's fixed sin/cos instead of Math.sin, and rolling ground adds the
// height in a different order. Both sides are correct; the last bits differ.
const rounded = [
  ["fence", flat, () => European.buildFence({ id: "a" }), () => buildCoreFence({ id: "a" })],
  [
    "short fence",
    flat,
    () => European.buildFence({ id: "f", length: 2.7, height: 1.1 }),
    () => buildCoreFence({ id: "f", length: 2.7, height: 1.1 })
  ],
  [
    "rotated wall",
    flat,
    () => European.buildWall({ id: "r", rotation: 0.7, center: [1, 2] }),
    () => buildCoreWall({ id: "r", rotation: 0.7, center: [1, 2] })
  ],
  [
    "rotated fence",
    flat,
    () => European.buildFence({ id: "r", rotation: Math.PI / 2 }),
    () => buildCoreFence({ id: "r", rotation: Math.PI / 2 })
  ],
  ["wall on hills", hills, () => European.buildWall({ id: "a" }), () => buildCoreWall({ id: "a" })],
  ["fence on hills", hills, () => European.buildFence({ id: "a" }), () => buildCoreFence({ id: "a" })],
  [
    "rotated wall on hills",
    hills,
    () => European.buildWall({ id: "h", rotation: 1.1, center: [3, -2], length: 9.5, height: 2 }),
    () => buildCoreWall({ id: "h", rotation: 1.1, center: [3, -2], length: 9.5, height: 2 })
  ],
  [
    "long fence on hills",
    hills,
    () => European.buildFence({ id: "g", rotation: -0.4, length: 13 }),
    () => buildCoreFence({ id: "g", rotation: -0.4, length: 13 })
  ]
] as const;

describe("Core path reproduces the online render input", () => {
  it.each(exact)(
    "%s: identical render input and render package bytes",
    async (_name, online, next) => {
      const expected = await legacy(online(), flat);
      const actual = await core(next(), flat);
      // 1. Packed units differ at most in the sign of zeros.
      expect(actual.groups.length).toBe(expected.groups.length);
      actual.groups.forEach((g, i) => {
        for (const material of Object.keys(expected.groups[i].units) as (keyof typeof g.units)[])
          expect(zeroSignOnly(g.units[material], expected.groups[i].units[material]), material).toBe(true);
      });
      // 2. Everything else is equal once zeros share one sign.
      const [a, b] = [await canonical(actual), await canonical(expected)];
      expect(a).toEqual(b);
      // 3. The render packages are byte-identical.
      const [fa, fb] = await Promise.all([files(a), files(b)]);
      expect(fa.draws).toEqual(fb.draws);
      expect(Object.keys(fa.files).length).toBeGreaterThan(0);
      expect(fa.files).toEqual(fb.files);
    },
    60000
  );

  it.each(rounded)(
    "%s: every value within 1e-12 of the online render input",
    async (_name, ground, online, next) => {
      const expected = await canonical(await legacy(online(), ground));
      const actual = await canonical(await core(next(), ground));
      expect(actual.groups.map((g) => g.cells.length)).toEqual(expected.groups.map((g) => g.cells.length));
      expect(maxDelta(actual, expected)).toBeLessThan(1e-12);
    },
    60000
  );

  it("follows the ground: the same wall sits higher where the ground is higher", async () => {
    const wall = (await core(buildCoreWall({ id: "a" }), hills)).groups[0].cells;
    for (const cell of wall.filter((c) => c.id.includes("/row-0/"))) {
      const [x, y, z] = cell.center;
      expect(y - cell.size[1] / 2).toBeCloseTo(hills(x, z) + 0.006, 9);
    }
  });
});
