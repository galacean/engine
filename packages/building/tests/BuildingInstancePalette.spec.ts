import { packConstructionUnits } from "../src/building/runtime/ConstructionUnitRender";
import { European } from "../src/building/parts/architecture/European";
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
const captures = vi.hoisted(() => [] as Record<string, number[]>[]);
// Keep the real native asset decoding/packing; replace GPU upload only.
vi.mock("../src/building/runtime/EngineResidentScene", async () => {
  const { Entity } = await import("@galacean/engine");
  return {
    EngineResidentScene: class {
      root: Entity;
      constructor(
        engine: any,
        parent: Entity,
        private asset: (file: string) => Promise<ArrayBuffer>
      ) {
        this.root = parent.createChild("packed-native-unit");
      }
      async load(pack: any) {
        const captured: Record<string, number[]> = {};
        for (const draw of pack.draws)
          for (const binding of Object.values(draw.resources) as any[]) {
            if (
              [
                "globals/identities",
                "globals/wallColors",
                "globals/woodenColors",
                "globals/roofColors",
                "globals/roofCounts"
              ].includes(binding.file)
            )
              captured[binding.file] = Array.from(new Uint32Array(await this.asset(binding.file)));
          }
        for (const draw of pack.draws) {
          const file =
            draw.instance_buffer?.file ??
            (Object.values(draw.resources) as any[]).find((b: any) => b.file?.endsWith("instances.bin"))?.file;
          if (file) captured["instances"] = Array.from(new Uint32Array(await this.asset(file)));
        }
        captures.push(captured);
      }
      bindCamera() {}
      destroy() {
        this.root.destroy();
      }
    }
  };
});
import { expect, it, vi } from "vitest";
import { Entity, type Engine } from "@galacean/engine";
import { constructionAssets, nativeAssets } from "./fixtures/constructionAssets";
import { designBuilding } from "../src/building/parts/architecture/BuildingDesign";
import { implementBuilding } from "../src/building/parts/architecture/BuildingImplementation";
import { BuildingPartDraft } from "../src/building/parts/BuildingParts";
import {
  buildingAlgorithmContext,
  renderInstanceParts
} from "../src/building/parts/architecture/BuildingInstanceRender";
import "../src/building/parts/supports/PointSupport";
import "../src/building/parts/algorithms/PlaceAtPoint";
import { buildingDraftSource } from "../src/building/parts/architecture/BuildingSource";
import { copyBuildingPrefab } from "../src/building/components/BuildingPrefab";
import type { BuildingDraft } from "../src/building/parts/architecture/BuildingDraft";

it.each([
  { unit: "brick" as const, roofColor: undefined },
  { unit: "wooden_plank" as const, roofColor: undefined },
  ...[undefined, 0, 4, 12].map((roofColor) => ({ unit: "roof_tile" as const, roofColor }))
])("preserves native $unit appearance ($roofColor) through Source copy and reload", async ({ unit, roofColor }) => {
  const engine = {
    resourceManager: {
      _deleteAsset() {},
      _deleteContentRestorer() {},
      _addReferResource() {},
      _deleteReferResource() {}
    }
  } as unknown as Engine;
  const parent = new Entity(engine),
    resources = new BuildingPartDraft(parent);
  const context = buildingAlgorithmContext(parent, resources);
  const input: BuildingDraft = {
    groups: [{ id: "a", seed: 37, wallColor: 3, woodColor: 2 }],
    parts: [
      {
        id: "marker",
        type: "marker",
        group: "a",
        support: { generator: "point", params: {} },
        algorithm: { type: "placeAtPoint" },
        unit,
        params: {},
        ...(roofColor !== undefined ? { appearance: { roofColor } } : {})
      }
    ],
    relations: []
  };
  const original = JSON.stringify(input);
  try {
    const result = await implementBuilding(
      designBuilding(input, () => 0),
      { context }
    );
    captures.length = 0;
    await renderInstanceParts(
      result.instanceParts,
      { parent, camera: {} as any, assets: constructionAssets(), signal: new AbortController().signal },
      resources,
      context
    );
    expect(captures).toHaveLength(1);
    if (unit !== "wooden_plank") expect(captures[0]["globals/identities"]).toEqual([37]);
    if (unit !== "roof_tile")
      expect(captures[0][unit === "brick" ? "globals/wallColors" : "globals/woodenColors"]).toEqual([
        unit === "brick" ? 3 : 2
      ]);
    if (unit === "roof_tile") {
      expect(captures[0]["globals/roofColors"]).toEqual([roofColor ?? 0]);
      expect(captures[0]["globals/roofCounts"].every((n) => n === 0)).toBe(true);
    }
    const initial = structuredClone(captures[0]);
    expect(initial.instances.length).toBeGreaterThan(0);
    const source = buildingDraftSource(input, { id: "frame" });
    const prefab = {
      asset: { version: "2.0" },
      root: "frame",
      entities: source.entities,
      components: source.components
    } as GalaceanSourcePrefabFile;
    for (const namespace of ["a", "b"]) {
      const copy = JSON.parse(JSON.stringify(copyBuildingPrefab(prefab, namespace))) as GalaceanSourcePrefabFile;
      const replay: BuildingDraft = {
        groups: copy.components
          .filter((c) => c.type === "BuildingGroupComponent")
          .map((c) => c.props!.definition) as any,
        parts: copy.components.filter((c) => c.type === "BuildingPartComponent").map((c) => c.props!.definition) as any,
        relations: []
      };
      expect(replay).toEqual(input);
      const placed = await implementBuilding(
        designBuilding(replay, () => 0),
        { context }
      );
      captures.length = 0;
      await renderInstanceParts(
        placed.instanceParts,
        { parent, camera: {} as any, assets: constructionAssets(), signal: new AbortController().signal },
        resources,
        context
      );
      expect(captures[0]).toEqual(initial);
    }
    if (unit === "roof_tile") {
      input.parts[0].appearance = { roofColor: roofColor === 4 ? 7 : 4 };
      const changed = await implementBuilding(
        designBuilding(input, () => 0),
        { context }
      );
      captures.length = 0;
      await renderInstanceParts(
        changed.instanceParts,
        { parent, camera: {} as any, assets: constructionAssets(), signal: new AbortController().signal },
        resources,
        context
      );
      expect(captures[0].instances).toEqual(initial.instances);
      expect(captures[0]["globals/roofColors"]).toEqual([input.parts[0].appearance.roofColor]);
      if (roofColor === undefined) delete input.parts[0].appearance;
      else input.parts[0].appearance = { roofColor };
    }
    expect(JSON.stringify(input)).toBe(original);
  } finally {
    resources.dispose();
    parent.destroy();
  }
});

it.each([-1, 13, 1.5, NaN])("rejects invalid generic roof palette index %s before placement", (roofColor) => {
  const draft: BuildingDraft = {
    groups: [{ id: "g", seed: 17, wallColor: 0, woodColor: 0 }],
    relations: [],
    parts: [
      {
        id: "tile",
        group: "g",
        type: "tile",
        support: { generator: "point", params: {} },
        algorithm: { type: "placeAtPoint" },
        unit: "roof_tile",
        params: {},
        appearance: { roofColor }
      }
    ]
  };
  expect(() => designBuilding(draft, () => 0)).toThrow(Number.isFinite(roofColor) ? /Roof color/ : /finite/);
});

it("passes public roofStyle appearance to profile rendering without changing unit buffers", async () => {
  const base = European.buildHouses({ id: "house", roof: { color: 2 } });
  const styled = European.buildHouses({ id: "house", roof: { color: 2 }, roofStyle: { appearance: { roofColor: 4 } } });
  const before = await implementBuilding(designBuilding(base, () => 0, nativeAssets.compilation));
  const after = await implementBuilding(designBuilding(styled, () => 0, nativeAssets.compilation));
  expect(before.renderInput.paletteSlots[0].roofColor).toBe(2);
  expect(after.renderInput.paletteSlots[0].roofColor).toBe(4);
  expect(after.groups.map((g) => g.units)).toEqual(before.groups.map((g) => g.units));
  expect(styled.parts.find((p) => p.type === "roof")!.appearance).toEqual({ roofColor: 4 });
});
