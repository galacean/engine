import { expect, it, vi } from "vitest";
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { designBuilding } from "../src/building/parts/architecture/BuildingDesign";
import { implementBuilding } from "../src/building/parts/architecture/BuildingImplementation";
import { buildingConnectionRules } from "../src/building/parts/architecture/BuildingDesignRules";
import {
  buildingAuthorKey,
  buildingDesignKey,
  buildingSelectionKey
} from "../src/building/parts/architecture/BuildingDesignIdentity";
import { buildingPartKey } from "../src/building/runtime/BuildingObjectIdentity";
import { European } from "../src/building/parts/architecture/European";
import { buildingDraftSource } from "../src/building/parts/architecture/BuildingSource";
import { copyBuildingPrefab } from "../src/building/components/BuildingPrefab";
import type { BuildingDraft } from "../src/building/parts/architecture/BuildingDraft";
import { constructionGeometry } from "./fixtures/constructionGeometry";
import "../src/building/parts/supports/PointSupport";
import "../src/building/parts/algorithms/PlaceAtPoint";
const context = {
  cache: new Map(),
  entity: null as any,
  own: () => {
    throw Error("No native allocation expected");
  }
};

it("executes an author named exactly like a derived key without altering existing house render data", async () => {
  const draft = European.buildHouses([
    { id: "house" },
    { id: "wing", rectangle: { center: [5, 0], size: [8, 6], rotation: Math.PI / 2 } }
  ]);
  const original = designBuilding(draft, () => 0, constructionGeometry);
  const junction = original.parts.find((p) => p.type === "wall-junction")!;
  const id = buildingDesignKey(junction.identity);
  const baseline = await implementBuilding(original);
  draft.parts.push({
    id,
    group: "house",
    type: "marker",
    support: { generator: "point", params: { position: [20, 1, 0] } },
    algorithm: { type: "placeAtPoint" },
    unit: { name: "marker" },
    params: {}
  });
  const next = designBuilding(draft, () => 0, constructionGeometry);
  const result = await implementBuilding(next, { context });
  expect(result.renderInput).toEqual(baseline.renderInput);
  expect(result.instanceParts).toHaveLength(1);
  expect(result.instanceParts[0].part.identity).toEqual({ kind: "author", id });
  expect(buildingSelectionKey(result.instanceParts[0].part.selection)).toBe(buildingPartKey(id));
  expect(buildingAuthorKey(id)).not.toBe(id);
  expect(result.instanceParts[0].placements).toHaveLength(1);
});

it("scopes custom derived identities by relation and preserves only authors across Prefab copy and reload", async () => {
  buildingConnectionRules.register("test.identity-links", ({ parts, relation }) => {
    const source = parts.find((p) => p.id === relation.from.part)!;
    const { id, ...definition } = source;
    return [
      {
        ...definition,
        localId: id,
        selection: { kind: "part", id },
        support: { generator: "point", params: { position: [0, 2, 0] } }
      }
    ];
  });
  const draft: BuildingDraft = {
    groups: [{ id: "group", seed: 17, wallColor: 0, woodColor: 0 }],
    parts: [
      {
        id: '["derived","test.identity-links"]',
        group: "group",
        type: "panel",
        support: { generator: "point", params: {} },
        algorithm: { type: "placeAtPoint" },
        unit: { name: "panel" },
        params: { seed: "source" },
        appearance: { roofColor: 4 }
      }
    ],
    relations: []
  };
  draft.relations = ["a", "b"].map((id) => ({
    id,
    rule: "test.identity-links",
    from: { part: draft.parts[0].id, boundary: "point" },
    to: { part: draft.parts[0].id, boundary: "point" }
  }));
  const original = JSON.stringify(draft);
  const source = buildingDraftSource(draft, { id: "frame" });
  const prefab = {
    asset: { version: "2.0" },
    root: "frame",
    entities: source.entities,
    components: source.components
  } as GalaceanSourcePrefabFile;
  for (const namespace of ["copy-a", "copy-b"]) {
    const copy = JSON.parse(JSON.stringify(copyBuildingPrefab(prefab, namespace))) as GalaceanSourcePrefabFile;
    const parts = copy.components.filter((c) => c.type === "BuildingPartComponent");
    const replay = {
      groups: copy.components.filter((c) => c.type === "BuildingGroupComponent").map((c) => c.props!.definition),
      parts: parts.map((c) => c.props!.definition),
      relations: parts.flatMap((c) => c.props!.relations as any[])
    } as unknown as BuildingDraft;
    expect(replay).toEqual(draft);
    const design = designBuilding(replay, () => 0);
    expect(design.parts).toHaveLength(3);
    expect(new Set(design.parts.map((p) => buildingDesignKey(p.identity))).size).toBe(3);
    const placed = await implementBuilding(design, { context });
    expect(placed.instanceParts).toHaveLength(3);
    for (const instance of placed.instanceParts) {
      expect(buildingSelectionKey(instance.part.selection)).toBe(buildingPartKey(draft.parts[0].id));
      expect(instance.part.params.seed).toBe(17);
      expect(instance.part.appearance).toEqual({ roofColor: 4 });
    }
    expect(copy.components.filter((c) => c.type === "BuildingPartComponent")).toHaveLength(1);
    expect(parts[0].props!.frame).toEqual({ $entity: namespace + "/frame" });
    expect(() => buildingDraftSource({ ...draft, parts: design.parts as any }, { id: "illegal" })).toThrow();
  }
  expect(JSON.stringify(draft)).toBe(original);
});
