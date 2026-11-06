import {
  buildingAuthorKey,
  buildingDesignKey
} from "../src/tiny-glade/parts/architecture/BuildingDesignIdentity";
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { describe, expect, it, vi } from "vitest";
import { European } from "../src/tiny-glade/parts/architecture/European";
import {
  combineBuildingDrafts,
  validateBuildingDraft
} from "../src/tiny-glade/parts/architecture/BuildingDraft";
import { designBuilding } from "../src/tiny-glade/parts/architecture/BuildingDesign";
import { implementBuilding } from "../src/tiny-glade/parts/architecture/BuildingImplementation";
import { buildingConnectionRules } from "../src/tiny-glade/parts/architecture/BuildingDesignRules";
import { constructionGeometry } from "./fixtures/constructionGeometry";
describe("flat building generation, design and implementation", () => {
  it.each(["house", "tower", "connected", "window", "wall", "fence"])(
    "generates unit bytes and backing geometry: %s",
    async (kind) => {
      let draft =
        kind === "tower"
          ? European.buildTower({ id: "house" })
          : kind === "fence"
            ? European.buildFence({ id: "house" })
            : kind === "wall"
              ? European.buildWall({ id: "house" })
              : European.buildHouses({
                  id: "house",
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
                      : []
                });
      if (kind === "connected")
        draft = combineBuildingDrafts(
          draft,
          European.buildHouses({ id: "wing", rectangle: { center: [5, 0], size: [8, 6], rotation: Math.PI / 2 } })
        );
      const before = JSON.stringify(draft),
        terrain = () => 0;
      const design = designBuilding(draft, terrain, constructionGeometry);
      if (kind === "window") {
        expect(design.diagnostics).toEqual([]);
        const window = draft.parts.find((p) => p.type === "window")!;
        expect(window.algorithm.type).toBe("mountAttachment");
        expect(window.unit).toMatchObject({ nativeAttachment: { type: "window-cottage", rank: 1 } });
        expect(design.prepared.decorations[0].holes.length).toBeGreaterThan(0);
        expect(design.prepared.decorations[0].parts).toHaveLength(0);
        expect(design.parts.filter((p) => p.publication?.format === "native-attachment/v1").length).toBeGreaterThan(0);
      }
      const actual = await implementBuilding(design);

      expect(JSON.stringify(draft)).toBe(before);
      expect(actual.groups.some((g) => g.cells.length)).toBe(true);
    }
  );
  it("does not persist solved publication state as author input", () => {
    const draft = European.buildHouses({ id: "house" });
    const part = { ...draft.parts[0], publication: { format: "wall-stitch/v1" } };
    expect(() => validateBuildingDraft({ ...draft, parts: [part, ...draft.parts.slice(1)] })).toThrow(
      "cannot be stored as author data"
    );
    expect(() => validateBuildingDraft(draft)).not.toThrow();
  });
  it("computes unequal intersecting roof contacts within tolerance", async () => {
    const draft = European.buildHouses([
      { id: "house", roof: { height: 0.5, ridge_length: 0.5, eave: 0.2 } },
      {
        id: "wing",
        rectangle: { center: [4, 0], size: [6, 5], rotation: Math.PI / 2 },
        roof: { height: 0.5, ridge_length: 0.5, eave: 0.2 }
      }
    ]);
    const result = await implementBuilding(designBuilding(draft, () => 0, constructionGeometry));
    expect(result.groups.some((g) => g.cells.length)).toBe(true);
  });
  it("exposes a rejected corner window instead of reporting it as generated", () => {
    const draft = European.buildHouses({
      id: "house",
      attachments: [
        {
          id: "window",
          kind: "window",
          type: "window-cottage",
          host: "wall",
          u: 0.2,
          bottom: 1.2,
          width: 1.2,
          height: 1.5,
          rank: 1,
          seed: 17
        }
      ]
    });
    const design = designBuilding(draft, () => 0, constructionGeometry);
    expect(design.diagnostics).toEqual([expect.objectContaining({ part: "house/window", code: "CROSSES_CORNER" })]);
    expect(design.prepared.decorations[0].holes).toHaveLength(0);
  });
  it("requires an explicit roof/wall relation and rejects duplicate identities", () => {
    const draft = European.buildHouses({ id: "house" });
    expect(() => combineBuildingDrafts(draft, draft)).toThrow(/identity/);
    draft.relations = [];
    expect(() => designBuilding(draft, () => 0, constructionGeometry)).toThrow(/relation/);
  });
  it("removing or moving a neighbour recomputes reservations without modifying author supports", () => {
    const a = European.buildHouses({ id: "a" }),
      b = European.buildHouses({ id: "b", rectangle: { center: [5, 0], size: [8, 6], rotation: Math.PI / 2 } });
    const connected = designBuilding(combineBuildingDrafts(a, b), () => 0, constructionGeometry);
    expect(connected.prepared.connections.candidates.length).toBeGreaterThan(0);
    b.parts[0].support.params.rectangle.center = [50, 0];
    const separated = designBuilding(combineBuildingDrafts(a, b), () => 0, constructionGeometry);
    expect(separated.prepared.connections.candidates.length).toBe(0);
    expect(JSON.stringify(a)).not.toContain("reservation");
  });
  it("custom connection rules derive flat parts without rewriting author state", () => {
    buildingConnectionRules.register("test.bridge", ({ parts, relation }) => {
      const { id, ...base } = parts[0];
      return [
        {
          ...base,
          localId: "bridge",
          selection: { kind: "part", id: relation.from.part },
          type: "bridge",
          support: {
            generator: "path",
            params: {
              points: [
                [0, 0, 0],
                [2, 0, 0]
              ]
            }
          }
        }
      ];
    });
    const draft: any = {
      groups: [{ id: "custom", seed: 17, wallColor: 0, woodColor: 0 }],
      parts: [
        {
          id: "a",
          group: "custom",
          type: "column",
          support: { generator: "point", params: {} },
          algorithm: { type: "placeAtPoint" },
          unit: "brick",
          params: {}
        }
      ],
      relations: []
    };
    draft.relations.push({
      id: "connect",
      from: { part: "a", boundary: "top" },
      to: { part: "a", boundary: "top" },
      rule: "test.bridge"
    });
    const design = designBuilding(draft, () => 0, constructionGeometry);
    expect(design.parts.map((p) => p.identity.kind)).toEqual(["author", "derived"]);
    expect(draft.parts).toHaveLength(1);
    draft.relations[0].rule = "opening";
    expect(() => designBuilding(draft, () => 0, constructionGeometry)).toThrow(/profile supports/);
  });
  it("part identity is independent from kernel geometry naming", async () => {
    const draft = European.buildHouses({ id: "house" });
    draft.parts[0].id = "stone-shell";
    draft.parts[1].id = "tile-cap";
    draft.relations[0].from.part = "stone-shell";
    draft.relations[0].to.part = "tile-cap";
    const actual = await implementBuilding(designBuilding(draft, () => 0, constructionGeometry));
    expect(actual.groups.some((g) => g.cells.length)).toBe(true);
  });
});

it("preserves plaster geometry when wall identity and relation endpoints change", async () => {
  const draft = European.buildHouses({ id: "house", plaster: { enabled: true, wear: 0.2, color: 0 } });
  const render = async () =>
    (await implementBuilding(designBuilding(draft, () => 0, constructionGeometry))).preview.parts
      .filter((p) => p.plaster)
      .map(({ positions, indices, normals, uvs, colors, plaster }) => ({
        positions,
        indices,
        normals,
        uvs,
        colors,
        plaster
      }));
  const original = await render();
  expect(original.reduce((n, p) => n + p.indices.length, 0)).toBeGreaterThan(0);
  draft.parts[0].id = "stone-shell";
  draft.relations[0].from.part = "stone-shell";
  expect(await render()).toEqual(original);
});

it("keeps authored and built-in derived part identities independent", () => {
  const draft = European.buildHouses([
    { id: "house" },
    { id: "wing", rectangle: { center: [5, 0], size: [8, 6], rotation: Math.PI / 2 } }
  ]);
  const solved = designBuilding(draft, () => 0, constructionGeometry);
  const junction = solved.parts.find((p) => p.type === "wall-junction")!;
  expect(junction).toBeDefined();
  draft.parts.push({
    id: "marker",
    group: "house",
    type: "marker",
    support: { generator: "point", params: {} },
    algorithm: { type: "placeAtPoint" },
    unit: { name: "marker" },
    params: {}
  });
  expect(
    designBuilding(draft, () => 0, constructionGeometry).parts.some(
      (p) => p.identity.kind === "author" && p.identity.id === "marker"
    )
  ).toBe(true);
  draft.parts.at(-1)!.id = buildingDesignKey(junction.identity);
  const original = JSON.stringify(draft);
  const changed = designBuilding(draft, () => 0, constructionGeometry);
  const derived = changed.parts.find((p) => p.type === "wall-junction")!;
  const authored = changed.parts.find((p) => p.identity.kind === "author" && p.identity.id === draft.parts.at(-1)!.id)!;
  expect(buildingDesignKey(derived.identity)).not.toBe(buildingDesignKey(authored.identity));
  expect(changed.supports.get(buildingDesignKey(derived.identity))).toBeDefined();
  expect(JSON.stringify(draft)).toBe(original);
});
