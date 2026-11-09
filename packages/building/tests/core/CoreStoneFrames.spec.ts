// A frame of wall material: the prefab's frame member is drawn from its stone alternative.
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { describe, expect, it, vi } from "vitest";
import { nativeAssets } from "../fixtures/constructionAssets";
import { createBuildingRegistry, designBuildingCore } from "../../src/building/core";
import { registerHouseTypes } from "../../src/building/partTypes/House";
import { buildCoreHouse, type CoreHouseParameters } from "../../src/building/application/CoreEuropean";
import { European } from "../../src/building/application/European";
import { coreBuildingLayout, coreBuildingView, coreBuildingEnvironment } from "../../src/building/render/CoreBuilding";
import { European as OnlineEuropean } from "../../src/building/parts/architecture/European";
import { designBuilding } from "../../src/building/parts/architecture/BuildingDesign";
import {
  buildingPreviewInput,
  prepareBuildingPublication
} from "../../src/building/parts/architecture/BuildingPublication";
import { profilePreview } from "../../src/building/runtime/ProfilePreview";
import { constructionDecorationType } from "../../src/building/runtime/ConstructionDecorationCatalog";

const registry = registerHouseTypes(createBuildingRegistry());
const flat = () => 0;
const assets = nativeAssets.compilation;
const environment = coreBuildingEnvironment(flat, assets);
const view = (p: CoreHouseParameters) => {
  const result = designBuildingCore(buildCoreHouse(p), registry, { environment });
  expect(result.diagnostics).toEqual([]);
  return coreBuildingView(coreBuildingLayout(result, registry, { environment: { ground: flat } }), {
    assets,
    retainDecorationParts: true,
    includeStructure: true
  });
};
const online = async (p: CoreHouseParameters) => {
  const design = designBuilding(OnlineEuropean.buildHouses(p as never) as never, flat as never, assets);
  return profilePreview(
    buildingPreviewInput(design, await prepareBuildingPublication(design)),
    flat as never,
    {
      assets,
      retainDecorationParts: true
    } as never
  );
};
const at = (id: string, type: string, rank: number, u: number, bottom: number) => {
  const size = constructionDecorationType(assets.decorations, type)!.dimensions.find((d) => d.rank === rank)!;
  return {
    id,
    kind: "window" as const,
    type,
    rank: rank as 1 | 2 | 3,
    u,
    bottom,
    width: size.width,
    height: size.height,
    frameMaterial: "wall" as const
  };
};
const attachments = [
  at("g1", "window-gothic", 1, 0.06, 1.2),
  at("g2", "window-gothic", 2, 0.19, 1.1),
  at("g3", "window-gothic", 3, 0.31, 0.6),
  at("a1", "window-arrow-slit", 1, 0.68, 1.6),
  at("a2", "window-arrow-slit", 2, 0.78, 1),
  at("a3", "window-arrow-slit", 3, 0.9, 0.8)
];

describe("Frames of wall material against the online path", () => {
  it.each([
    ["a square house", { rectangle: { center: [0, 0], size: [10, 10], rotation: 0 } }],
    ["a round house", { circle: { center: [0, 0], radius: 6 } }]
  ] as const)("on %s: the same stone meshes at the same places", async (_name, shape) => {
    const p = { id: "s", height: 5, ...shape, attachments } as unknown as CoreHouseParameters;
    const ours = view(p).frames,
      theirs = (await online(p)).frames;
    expect(ours.length).toBe(attachments.length);
    expect(theirs.length).toBe(ours.length);
    const byId = (list: typeof ours) => [...list].sort((a, b) => (a.decorationId < b.decorationId ? -1 : 1));
    byId(ours).forEach((frame, i) => {
      const other = byId(theirs)[i];
      expect(frame.template).toBe(other.template);
      for (const k of [9, 10, 11])
        expect(Math.abs(frame.instance.xform[k] - other.instance.xform[k])).toBeLessThan(0.03);
      for (const k of [0, 1, 2, 3, 4, 5, 6, 7, 8])
        expect(Math.abs(frame.instance.xform[k] - other.instance.xform[k])).toBeLessThan(0.08);
      expect(frame.instance.meshSizeX / other.instance.meshSizeX).toBeGreaterThan(0.9);
      expect(frame.instance.meshSizeX / other.instance.meshSizeX).toBeLessThan(1.1);
    });
  });

  it("draws the stone instead of the wood frame, and keeps the glass", () => {
    const p: CoreHouseParameters = {
      id: "s",
      height: 5,
      rectangle: { center: [0, 0], size: [10, 10], rotation: 0 }
    };
    const wood = view({ ...p, attachments: [{ ...attachments[0], frameMaterial: undefined }] });
    const stone = view({ ...p, attachments: [attachments[0]] });
    expect(wood.frames).toHaveLength(0);
    expect(stone.frames).toHaveLength(1);
    expect(stone.decorationParts.length).toBe(wood.decorationParts.length - 1);
    expect(stone.decorationParts.map((d) => (d as unknown as { id: string }).id)).toEqual(
      wood.decorationParts.map((d) => (d as unknown as { id: string }).id).filter((id) => !id.endsWith("/frame"))
    );
  });

  it("stands on a Gothic dormer too", () => {
    const stone = view({
      id: "d",
      height: 4,
      rectangle: { center: [0, 0], size: [10, 8], rotation: 0 },
      roof: { height: 0.6 },
      roofAttachments: [{ id: "x", type: "dormer-gothic", rank: 2, uv: [0.45, 0.2], frameMaterial: "wall" }]
    });
    expect(stone.frames.map((f) => f.template)).toEqual([expect.stringContaining("window_gothic_2x1_dormer")]);
  });

  it("is checked by the European parameters", () => {
    const p = { u: 0.3, bottom: 1, width: 1, height: 1, frameMaterial: "wall" as const };
    expect(() => European.buildHouses({ id: "e", attachments: [{ id: "w", kind: "window", ...p }] })).toThrow(
      'The attachment type "window-cottage" has no frame of wall material'
    );
    const draft = European.buildHouses({
      id: "e",
      attachments: [{ id: "w", kind: "window", type: "window-gothic", ...p }]
    });
    const part = draft.parts.find((q) => q.type === "window")!;
    expect((part.algorithm as { params: { unitParams: object } }).params.unitParams).toMatchObject({
      frameMaterial: "wall"
    });
  });
});
