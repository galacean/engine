import { expect, it, vi } from "vitest";
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { European } from "../src/building/parts/architecture/European";
import { designBuilding } from "../src/building/parts/architecture/BuildingDesign";
import { implementBuilding } from "../src/building/parts/architecture/BuildingImplementation";
import { prepareBuildingCpu } from "../src/building/parts/architecture/BuildingCpu";
import { resolveDocument } from "../src/building/runtime/PlacementDocument.js";
import { constructionGeometry } from "./fixtures/constructionGeometry";
const terrain = {
  samples: new Uint16Array(4),
  resolution: 2,
  origin: [-100, -100] as [number, number],
  size: 200,
  decode: { offset: 0, scale: 1 }
};
it.each([
  "native-wall",
  "native-joined",
  "native-door",
  "foundation-surface",
  "wall-edits",
  "roof-edits",
  "foundation-edits",
  "flat-edits"
])(
  "preserves existing production geometry and material selections: %s",
  async (kind) => {
    const params = {
      id: "house",
      seed: 17,
      height: 4,
      rectangle: { center: [0, 0] as [number, number], size: [8, 6] as [number, number], rotation: 0 },
      roof: { height: kind === "flat-edits" ? 0 : 0.5, ridge_length: 0.5, eave: 0.2 }
    };
    const draft = European.buildHouses({
      ...params,
      ...(kind.startsWith("native") ? { wall: { algorithm: { type: "nativeMasonry" } } } : {}),
      ...(kind.startsWith("foundation")
        ? {
            foundation: { height: 1, mode: "solid" as const },
            ...(kind === "foundation-surface" ? { foundationStyle: { algorithm: { type: "foundationSurface" } } } : {})
          }
        : {}),
      attachments:
        kind === "native-door"
          ? [
              {
                id: "door",
                kind: "door",
                host: "wall",
                type: "door-gothic",
                u: 0.35,
                bottom: 0,
                width: 1.2,
                height: 2,
                rank: 1,
                seed: 17
              }
            ]
          : []
    });
    if (kind === "native-joined") {
      const wing = European.buildHouses({
        ...params,
        id: "wing",
        rectangle: { center: [5, 0], size: [8, 6], rotation: Math.PI / 2 }
      });
      draft.groups.push(...wing.groups);
      draft.parts.push(...wing.parts);
      draft.relations.push(...wing.relations);
    }
    if (kind.endsWith("edits")) {
      const role = kind === "flat-edits" ? "roof" : kind.split("-")[0],
        part = draft.parts.find((p) => p.type === role)!;
      part.regions = [
        {
          id: "paint",
          region: {
            space: "surface_uv",
            polygon: [
              [-100, -100],
              [100, -100],
              [100, 100],
              [-100, 100]
            ]
          },
          effect: { unit_id: "wooden_plank" }
        },
        {
          id: "hole",
          region: {
            space: "surface_uv",
            polygon: [
              [0, 0],
              [3, 0],
              [3, 3],
              [0, 3]
            ]
          },
          effect: { hidden: true }
        }
      ];
    }
    const before = JSON.stringify(draft),
      design = designBuilding(draft, () => 0, constructionGeometry);
    expect(design.diagnostics).toEqual([]);
    const actual = await implementBuilding(design);

    const resolved = resolveDocument({ ...actual, document: actual.placementDocument }, actual.placementDocument);

    if (kind.endsWith("edits")) {
      expect(actual.placementDocument.overrides).toHaveLength(2);
      expect(resolved.cells.some((c) => c.hidden)).toBe(true);
      expect(resolved.cells.some((c) => c.unit_id === "wooden_plank" && !c.hidden)).toBe(true);
      const cpu = await prepareBuildingCpu(draft, terrain, constructionGeometry);
      expect(cpu.preview.parts.length).toBeGreaterThan(0);
    }
    if (kind.startsWith("native")) expect(actual.renderInput.rawDraws.some((d) => d.id === "wall-1")).toBe(true);
    expect(JSON.stringify(draft)).toBe(before);
  },
  30000
);
it("rejects invalid region identities/effects and unsupported edits on procedural raw geometry", () => {
  const draft = European.buildHouses({ id: "house" }),
    part = draft.parts[0];
  part.regions = [
    {
      id: "x",
      region: {
        space: "surface_uv",
        polygon: [
          [0, 0],
          [1, 0],
          [1, 1]
        ]
      },
      effect: { hidden: true }
    }
  ];
  const run = () => designBuilding(draft, () => 0, constructionGeometry);
  part.regions.push({ ...part.regions[0] });
  expect(run).toThrow("Duplicate");
  part.regions.pop();
  part.regions[0].effect = {};
  expect(run).toThrow("effect");
  part.regions[0].effect = { hidden: true };
  part.algorithm = { type: "nativeMasonry" };
  expect(run).toThrow("Local UV edits require");
});
