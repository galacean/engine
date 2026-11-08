vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { nativeAssets } from "./fixtures/constructionAssets";
import { European } from "../src/building/parts/architecture/European";
import { designBuilding } from "../src/building/parts/architecture/BuildingDesign";
import { implementBuilding } from "../src/building/parts/architecture/BuildingImplementation";
import { buildBuildingRenderPackage } from "../src/building/runtime/BuildingRenderPackage";
import { buildingGlobals } from "../src/building/runtime/BuildingGlobals";
const hash = (data: ArrayBuffer) => createHash("sha256").update(new Uint8Array(data)).digest("hex");
it.each(["house", "flat", "foundation", "bands", "wall", "fence", "wood", "connected"])(
  "renders explicit part output independent of geometry naming: %s",
  async (kind) => {
    const params = {
      id: "a",
      seed: 0,
      wallColor: 3,
      woodColor: 2,
      roof: { color: 4, ...(kind === "flat" ? { height: 0 } : {}) },
      ...(kind === "foundation" ? { foundation: { height: 1, mode: "solid" as const } } : {}),
      ...(kind === "bands" ? { height: 9, floors: { enabled: true, interval: 3.5 } } : {}),
      ...(kind === "wood" ? { wall: { unit: "wooden_plank" as const, algorithm: { type: "horizontal_rows" } } } : {})
    };
    const draft =
      kind === "wall"
        ? European.buildWall({ id: "a" })
        : kind === "fence"
          ? European.buildFence({ id: "a" })
          : European.buildHouses(
              kind === "connected"
                ? [
                    params,
                    { ...params, id: "b", seed: 37, rectangle: { center: [5, 0], size: [8, 6], rotation: Math.PI / 2 } }
                  ]
                : params
            );
    const actual = await implementBuilding(designBuilding(draft, () => 0, nativeAssets.compilation));
    expect(actual.renderInput).not.toHaveProperty("construction");
    expect(actual.renderInput).not.toHaveProperty("owners");
    expect(actual.renderInput.placementDocument).not.toHaveProperty("construction");
    const source = actual.renderInput;
    const original = buildBuildingRenderPackage(
      source,
      nativeAssets,
      buildingGlobals(source.paletteSlots, nativeAssets.frame),
      true
    );
    expect(original.package.draws.length).toBeGreaterThan(0);
    for (const file of original.dynamicFiles) expect((await original.asset(file)).byteLength).toBeGreaterThan(0);
    // Render ownership is explicit, so renaming geometry identifiers does not
    // change buffers or draw ownership. No suffix can resurrect an old house.
    const renamed = {
      ...source,
      placementDocument: {
        ...source.placementDocument,
        geometries: source.placementDocument.geometries.map((g, i) => ({ ...g, id: "geometry/" + i }))
      },
      surfaceParts: source.surfaceParts.map((p) => ({ ...p, geometryId: "opaque" })),
      backingParts: source.backingParts.map((p) => ({ ...p, geometryId: "opaque" }))
    };
    const pack = buildBuildingRenderPackage(
      renamed,
      nativeAssets,
      buildingGlobals(source.paletteSlots, nativeAssets.frame),
      true
    );
    expect(pack.package.draws).toEqual(original.package.draws);
    for (const file of original.dynamicFiles)
      expect(hash(await pack.asset(file)), file).toEqual(hash(await original.asset(file)));
  },
  30000
);

it("keeps a flat roof backing when its part ID resembles another part's derived geometry name", async () => {
  const draft = European.buildHouses({
    id: "house",
    height: 9,
    roof: { height: 0 },
    floors: { enabled: true, interval: 3.5 }
  });
  const build = () => implementBuilding(designBuilding(draft, () => 0, nativeAssets.compilation));
  const roof = draft.parts.find((p) => p.type === "roof")!;
  const original = (await build()).renderInput.backingParts.filter((p) => p.bindingId === roof.id + "/placement");
  expect(original.length).toBeGreaterThan(0);
  roof.id = draft.parts.find((p) => p.type === "wall")!.id + "-bands";
  draft.relations.find((r) => r.rule === "wallRoofJoint")!.to.part = roof.id;
  const changed = (await build()).renderInput.backingParts.filter((p) => p.bindingId === roof.id + "/placement");
  expect(changed.map((p) => p.positions)).toEqual(original.map((p) => p.positions));
});
