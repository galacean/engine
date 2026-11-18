import { resolveDocument } from "../src/building/runtime/PlacementDocument.js";
import { constructionSupportHeight } from "../src/building/runtime/TerrainField";
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { European } from "../src/building/application/European";
import {
  buildingWorldRegion,
  compileBuildingCpu,
  prepareBuildingCpu
} from "../src/building/parts/architecture/BuildingCpu";
import { prepareBuildingTerrain } from "../src/building/parts/architecture/BuildingTerrain";
import { constructionGeometry } from "./fixtures/constructionGeometry";
import type { ConstructionTerrainGrid } from "../src/building/runtime/TerrainField";
import type { BuildingCoreDraft } from "../src/building/core";
const terrain: ConstructionTerrainGrid = {
  samples: new Uint16Array(4),
  resolution: 2,
  origin: [-100, -100],
  size: 200,
  decode: { offset: 0, scale: 1 }
};
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const window = { id: "window", kind: "window" as const, u: 0.35, bottom: 1.2, width: 1.2, height: 1.5 };
const DRAFTS: Record<string, () => BuildingCoreDraft> = {
  house: () => European.buildHouses({ id: "house" }),
  tower: () => European.buildTower({ id: "house" }),
  window: () => European.buildHouses({ id: "house", attachments: [window] }),
  gothic: () =>
    European.buildHouses({
      id: "house",
      height: 5,
      attachments: [{ ...window, type: "window-gothic", rank: 2, width: 1.49, height: 2.66, bottom: 0.8 }]
    }),
  finished: () =>
    European.buildHouses({
      id: "house",
      height: 7,
      plaster: { enabled: true, wear: 0.3, color: 2 },
      floors: { enabled: true, interval: 3 }
    }),
  flat: () => European.buildHouses({ id: "house", roof: { height: 0 }, roofStyle: { unit: "wooden_plank" } }),
  fence: () => European.buildFence({ id: "house" }),
  wall: () => European.buildWall({ id: "house" }),
  joined: () =>
    European.buildHouses([
      { id: "house" },
      { id: "wing", rectangle: { center: [5, 0], size: [8, 6], rotation: Math.PI / 2 } }
    ])
};

describe("core draft CPU preview/detail boundary", () => {
  it.each(Object.keys(DRAFTS))(
    "keeps the preview and repeats the same detail: %s",
    async (kind) => {
      const cpu = await prepareBuildingCpu(DRAFTS[kind](), terrain, constructionGeometry);
      const before = digest(cpu.preview),
        first = await compileBuildingCpu(cpu.prepared);
      const second = await compileBuildingCpu(cpu.prepared);
      expect(Object.keys(first).sort()).toEqual(["grounding", "renderInput"]);
      expect(digest(first.renderInput)).toBe(digest(second.renderInput));
      expect(digest(cpu.preview)).toBe(before);
      const input = first.renderInput;
      const cells = resolveDocument(
        { document: input.placementDocument, plans: input.plans, groups: input.groups },
        input.placementDocument
      ).cells;
      expect(cells.length).toBeGreaterThan(0);
      // The preview and the detail cross the thread boundary as plain data.
      expect(cpu.preview.structuralParts).toBeUndefined();
      expect(cpu).not.toHaveProperty("structure");
      expect(cpu.occupancy.length).toBeGreaterThan(0);
      expect(() => structuredClone({ preview: cpu.preview, occupancy: cpu.occupancy, detail: first })).not.toThrow();
      expect(cpu.focus.length).toBeGreaterThan(0);
      expect(cpu.appearance.paletteSlots.length).toBe(DRAFTS[kind]().groups.length);
    },
    30000
  );
  it("samples translated and rotated terrain and nearby rock support without rebasing Y", () => {
    const grid: ConstructionTerrainGrid = {
      ...terrain,
      samples: new Uint16Array([0, 1000, 2000, 3000]),
      decode: { offset: 20, scale: 10 },
      supports: [
        {
          positions: new Float32Array([8, 30, 18, 12, 30, 18, 12, 30, 22, 8, 30, 22]),
          indices: new Uint32Array([0, 1, 2, 0, 2, 3])
        }
      ]
    };
    const frame = { position: [10, 99, 20] as [number, number, number], rotationY: 0.7 };
    const draft = European.buildHouses({ id: "house", rectangle: { center: [0, 0], size: [8, 6], rotation: 0.3 } });
    const next = prepareBuildingTerrain(grid, frame);
    const region = buildingWorldRegion(draft, frame);
    expect(region.every(Number.isFinite)).toBe(true);
    // The region surrounds the frame origin by at least the house's half size.
    expect(region[0]).toBeLessThan(10 - 4);
    expect(region[2]).toBeGreaterThan(10 + 4);
    expect(next.height(0, 0)).toBe(30);
    expect(next.grounding.renderPosition).toEqual([10, 0, 20]);
    expect(next.height(1, 2)).toBe(
      constructionSupportHeight(grid, 10 + Math.cos(0.7) + 2 * Math.sin(0.7), 20 - Math.sin(0.7) + 2 * Math.cos(0.7))
    );
  });
  it("reports parts the system cannot build and drafts that are not drafts", async () => {
    const draft = European.buildHouses({ id: "one" });
    (draft.parts[0] as { geometry: { generator: string } }).geometry.generator = "unknownShape";
    await expect(prepareBuildingCpu(draft, terrain, constructionGeometry)).rejects.toThrow("unknownShape");
    await expect(prepareBuildingCpu({ groups: [] } as never, terrain, constructionGeometry)).rejects.toThrow(
      "groups and parts"
    );
    // A part that does not reach the result is accepted when the caller allows it.
    await expect(
      prepareBuildingCpu(draft, terrain, constructionGeometry, { requireAllParts: false })
    ).resolves.toHaveProperty("diagnostics");
  });
});

it("reserves final prefab attachments outside the wall without retaining triangles", async () => {
  const { BuildingOccupancyQuery } = await import("../src/building/runtime/BuildingOccupancyQuery");
  const cpu = await prepareBuildingCpu(European.buildHouses({ id: "house", roof: { height: 0 },
    attachments: [{ id: "lamp", kind: "wall-lamp", u: .1, bottom: 1, width: 2, height: 2 }]
  }), terrain, constructionGeometry);
  const query = BuildingOccupancyQuery.fromSnapshot(cpu.occupancy);
  expect(query.intersectBounds([-6, 0, 0], [-5, 100, 1])).toEqual({ building: "house", subject: "house" });
  expect(query.intersectBounds([50, 0, 50], [51, 100, 51])).toBeNull();
  for (const part of cpu.occupancy) {
    expect(part).not.toHaveProperty("positions");
    expect(part).not.toHaveProperty("indices");
  }
});
