import { resolveDocument } from "../src/tiny-glade/runtime/PlacementDocument.js";
import { constructionSupportHeight } from "../src/tiny-glade/runtime/TerrainField";
import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
vi.mock("../src/tiny-glade/runtime/ConstructionWallFrame", { spy: true });
import { compileWallInFrame } from "../src/tiny-glade/runtime/ConstructionWallFrame";
import { European } from "../src/tiny-glade/parts/architecture/European";
import { prepareBuildingCpu, compileBuildingCpu } from "../src/tiny-glade/parts/architecture/BuildingCpu";
import { designBuilding } from "../src/tiny-glade/parts/architecture/BuildingDesign";
import { implementBuilding } from "../src/tiny-glade/parts/architecture/BuildingImplementation";
import { prepareBuildingTerrain } from "../src/tiny-glade/parts/architecture/BuildingTerrain";
import { profileSupportRegion } from "../src/tiny-glade/parts/architecture/BuildingProfileTerrain";
import { constructionGeometry } from "./fixtures/constructionGeometry";
import type { ConstructionTerrainGrid } from "../src/tiny-glade/runtime/TerrainField";
const terrain: ConstructionTerrainGrid = {
  samples: new Uint16Array(4),
  resolution: 2,
  origin: [-100, -100],
  size: 200,
  decode: { offset: 0, scale: 1 }
};
const digest = (value: any) =>
  createHash("sha256")
    .update(JSON.stringify(value, (_, v) => (typeof v === "bigint" ? String(v) : v)))
    .digest("hex");

describe("flat draft CPU preview/detail boundary", () => {
  it.each(["house", "tower", "foundation", "window", "dormer", "fence", "wood", "joined"])(
    "preserves preview geometry and repeated detail without eager walls: %s",
    async (kind) => {
      const draft =
        kind === "tower"
          ? European.buildTower({ id: "house" })
          : kind === "fence"
            ? European.buildFence({ id: "house" })
            : European.buildHouses({
                id: "house",
                ...(kind === "dormer"
                  ? {
                      height: 5,
                      rectangle: { center: [0, 0] as [number, number], size: [10, 8] as [number, number], rotation: 0 },
                      roof: { height: 0.9, ridge_length: 0.35, profile: 0.7 }
                    }
                  : {}),
                ...(kind === "foundation" ? { foundation: { height: 1, mode: "solid" as const } } : {}),
                ...(kind === "wood"
                  ? { wall: { unit: "wooden_plank" as const, algorithm: { type: "horizontal_rows" } } }
                  : {}),
                attachments:
                  kind === "window"
                    ? [
                        {
                          id: "window",
                          kind: "window",
                          type: "window-cottage",
                          host: "wall",
                          u: 0.35,
                          bottom: 1.2,
                          width: 1.2,
                          height: 1.5,
                          rank: 1,
                          seed: 17
                        }
                      ]
                    : kind === "dormer"
                      ? [
                          {
                            id: "dormer",
                            kind: "window",
                            type: "dormer-cottage",
                            host: "roof",
                            uv: [0.02, 0.5],
                            bottom: 0,
                            width: 1.4,
                            height: 1.6,
                            rank: 1
                          }
                        ]
                      : []
              });
      if (kind === "joined") {
        const wing = European.buildHouses({
          id: "wing",
          rectangle: { center: [5, 0], size: [8, 6], rotation: Math.PI / 2 }
        });
        draft.groups.push(...wing.groups);
        draft.parts.push(...wing.parts);
        draft.relations.push(...wing.relations);
      }
      vi.mocked(compileWallInFrame).mockClear();
      const cpu = await prepareBuildingCpu(draft, terrain, constructionGeometry);
      expect(compileWallInFrame).not.toHaveBeenCalled();
      expect(cpu.prepared).not.toHaveProperty("walls");

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
      for (const surface of input.surfaceParts)
        for (let i = 0; i < surface.positions.length; i++) {
          expect(surface.positions[i]).toBeGreaterThanOrEqual(first.grounding.localBounds!.min[i % 3] - 1e-5);
          expect(surface.positions[i]).toBeLessThanOrEqual(first.grounding.localBounds!.max[i % 3] + 1e-5);
        }

      expect(() => structuredClone({ preview: cpu.preview, structure: cpu.structure, detail: first })).not.toThrow();
      for (let axis = 0; axis < 3; axis++) {
        expect(first.grounding.localBounds!.min[axis]).toBeLessThanOrEqual(cpu.preview.bounds.min[axis]);
        expect(first.grounding.localBounds!.max[axis]).toBeGreaterThanOrEqual(cpu.preview.bounds.max[axis]);
      }
    },
    30000
  );
  it("uses translated/rotated terrain and nearby rock support without rebasing Y", () => {
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
    expect(profileSupportRegion(draft, frame).every(Number.isFinite)).toBe(true);
    expect(next.height(0, 0)).toBe(30);
    expect(next.grounding.renderPosition).toEqual([10, 0, 20]);
    expect(next.height(1, 2)).toBe(
      constructionSupportHeight(grid, 10 + Math.cos(0.7) + 2 * Math.sin(0.7), 20 - Math.sin(0.7) + 2 * Math.cos(0.7))
    );
  });
  it("rejects mixing a preview publication from another design", async () => {
    const cpu = await prepareBuildingCpu(European.buildHouses({ id: "one" }), terrain, constructionGeometry);
    const other = designBuilding(European.buildHouses({ id: "two" }), () => 0, constructionGeometry);
    await expect(implementBuilding(other, { publication: cpu.prepared.publication })).rejects.toThrow(
      "different design"
    );
  });
  it("rejects unavailable Worker codecs and per-part transforms explicitly", async () => {
    const draft = European.buildHouses({ id: "one" });
    draft.parts[0].support.generator = "meshSurface";
    await expect(prepareBuildingCpu(draft, terrain, constructionGeometry)).rejects.toThrow("codec");
    draft.parts[0].support.generator = "wallProfile";
    draft.parts[0].transform = Array(16).fill(0);
    await expect(prepareBuildingCpu(draft, terrain, constructionGeometry)).rejects.toThrow("placement frame");
  });
});
