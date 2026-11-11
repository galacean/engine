import { expect, it, vi } from "vitest";
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { buildingDraftSource } from "../src/building/parts/architecture/BuildingSource";
import { European } from "../src/building/application/European";
import type { BuildingCoreDraft } from "../src/building/core";
import { copyBuildingPrefab } from "../src/building/components/BuildingPrefab";
import { compileBuildingCpu, prepareBuildingCpu } from "../src/building/parts/architecture/BuildingCpu";
import { nativeAssets } from "./fixtures/constructionAssets";
import { createHash } from "node:crypto";

const makeDraft = () =>
  European.buildHouses({
    id: "home",
    seed: 17,
    height: 5,
    rectangle: { center: [0, 0], size: [10, 8], rotation: 0 },
    roof: { height: 0.9, ridge_length: 0.35, profile: 0.7 },
    attachments: [{ id: "window", kind: "window", u: 0.35, bottom: 1.2, width: 1.2, height: 1.5 }]
  });
function prefab(draft: BuildingCoreDraft = makeDraft()): GalaceanSourcePrefabFile {
  const { entities, components } = buildingDraftSource(draft, { id: "frame", assetLibrary: "Units/kit.prefab" });
  return { asset: { version: "2.0" }, root: "frame", entities, components };
}
function read(source: GalaceanSourcePrefabFile): BuildingCoreDraft {
  const parts = source.components.filter((c) => c.type === "BuildingPartComponent");
  return {
    groups: source.components.filter((c) => c.type === "BuildingGroupComponent").map((c) => c.props!.definition),
    parts: parts.map((c) => c.props!.definition),
    connections: parts.flatMap((c) => c.props!.connections as never[])
  } as unknown as BuildingCoreDraft;
}
const sorted = (draft: BuildingCoreDraft) => ({
  ...draft,
  connections: [...(draft.connections ?? [])].sort((a, b) => a.id.localeCompare(b.id))
});
function sourcePart(source: { components: GalaceanSourceComponentSchema[] }, id: string) {
  return source.components.find((c) => c.type === "BuildingPartComponent" && (c.props!.definition as any).id === id)!;
}
const terrain = {
  samples: new Uint16Array(4),
  resolution: 2,
  origin: [-100, -100] as [number, number],
  size: 200,
  decode: { offset: 0, scale: 1 }
};
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

it("writes only flat native author components and restores the exact draft through JSON", () => {
  const draft = makeDraft(),
    before = structuredClone(draft),
    source = prefab(draft);
  expect(source.components.every((c) => ["BuildingPartComponent", "BuildingGroupComponent"].includes(c.type))).toBe(
    true
  );
  expect(source.components.filter((c) => c.type === "BuildingGroupComponent")).toHaveLength(1);
  expect(source.components.every((c) => (c.props!.frame as any).$entity === source.root)).toBe(true);
  expect(source.components.filter((c) => c.props!.assetLibrary)).toHaveLength(1);
  // Every connection is stored once, on the part that starts it.
  expect(sorted(read(JSON.parse(JSON.stringify(source))))).toEqual(sorted(draft));
  expect(draft).toEqual(before);
  expect(new Set([...source.entities, ...source.components].map((c) => c.id)).size).toBe(
    source.entities.length + source.components.length
  );
});

it("copies Source references while preserving instance-local architectural definitions", () => {
  const draft = makeDraft(),
    original = prefab(draft),
    before = structuredClone(original);
  const a = copyBuildingPrefab(original, "a"),
    b = copyBuildingPrefab(original, "b");
  for (const copy of [a, b]) expect(sorted(read(copy))).toEqual(sorted(draft));
  expect(a.components[0].props!.assetLibrary).toEqual({ $ref: "Units/kit.prefab" });
  expect(a.components.every((c) => (c.props!.frame as any).$entity === a.root)).toBe(true);
  expect(original).toEqual(before);
  const ids = [...a.entities, ...a.components, ...b.entities, ...b.components].map((v) => v.id);
  expect(new Set(ids).size).toBe(ids.length);
});

it.each(["house", "flat", "round", "window", "gothic", "wall", "fence", "joined"])(
  "a draft restored from Source and copied compiles to the same render input: %s",
  async (kind) => {
    const draft =
      kind === "wall"
        ? European.buildWall({ id: "home" })
        : kind === "fence"
          ? European.buildFence({ id: "home" })
          : kind === "joined"
            ? European.buildHouses([{ id: "home" }, { id: "wing", rectangle: { center: [5, 0], size: [6, 8] } }])
            : kind === "window" || kind === "gothic"
              ? European.buildHouses({
                  id: "home",
                  height: 5,
                  attachments: [
                    kind === "window"
                      ? { id: "window", kind: "window", u: 0.35, bottom: 1.2, width: 1.2, height: 1.5 }
                      : {
                          id: "g",
                          kind: "window",
                          type: "window-gothic",
                          rank: 2,
                          u: 0.4,
                          bottom: 1,
                          width: 1.49,
                          height: 2.66
                        }
                  ]
                })
              : European.buildHouses({
                  id: "home",
                  ...(kind === "flat" ? { roof: { height: 0 } } : {}),
                  ...(kind === "round" ? { circle: { center: [0, 0] as [number, number], radius: 3 } } : {})
                });
    const compile = async (input: BuildingCoreDraft) =>
      (await compileBuildingCpu((await prepareBuildingCpu(input, terrain, nativeAssets.compilation)).prepared))
        .renderInput;
    const copied = read(copyBuildingPrefab(JSON.parse(JSON.stringify(prefab(draft))), "copy"));
    expect(hash(await compile(copied))).toBe(hash(await compile(draft)));
  },
  30000
);

it("requires explicit project references for native values instead of serializing a live object graph", () => {
  class NativeUnit {
    readonly instanceId = 42;
  }
  const draft = makeDraft(),
    unit = new NativeUnit();
  (draft.parts[0] as { unit: unknown }).unit = unit;
  expect(() => prefab(draft)).toThrow(/project.*reference/);
  const result = buildingDraftSource(draft, {
    id: "frame",
    reference: (value) => (value === unit ? { $ref: "Tile.prefab" } : undefined)
  });
  expect((sourcePart(result, draft.parts[0].id).props!.definition as any).unit).toEqual({ $ref: "Tile.prefab" });
  const cyclic = makeDraft() as unknown as { parts: { self?: unknown }[] };
  cyclic.parts[0].self = cyclic;
  expect(() => prefab(cyclic as unknown as BuildingCoreDraft)).toThrow(/cyclic/);
});

it("fails malformed sources before creating colliding copies", () => {
  const duplicate = prefab(),
    group = duplicate.components.find((c) => c.type === "BuildingGroupComponent")!;
  duplicate.components.push({
    ...structuredClone(group),
    id: "duplicate",
    props: { ...structuredClone(group.props), enabled: false }
  });
  duplicate.entities.find((e) => e.components?.includes(group.id))!.components!.push("duplicate");
  expect(() => copyBuildingPrefab(duplicate, "copy")).toThrow(/duplicate building group/);
  const orphan = prefab();
  (sourcePart(orphan, "home/window").props!.definition as any).group = "missing";
  expect(() => copyBuildingPrefab(orphan, "copy")).toThrow(/Missing group/);
});

it("validates default native frames and rejects unrelated explicit frame references", () => {
  const source = prefab();
  // Without an explicit frame, each component uses its owning Entity's parent.
  for (const c of source.components) {
    const owner = source.entities.find((e) => e.components?.includes(c.id))!;
    for (const e of source.entities) if (e.children) e.children = e.children.filter((id) => id !== owner.id);
    source.entities.find((e) => e.id === source.root)!.children!.push(owner.id);
    delete c.props!.frame;
  }
  expect(() => copyBuildingPrefab(source, "copy")).not.toThrow();
  source.entities.push({ id: "unrelated" });
  source.components[0].props!.frame = { $entity: "unrelated" };
  expect(() => copyBuildingPrefab(source, "copy")).toThrow(/ancestor/);
});

it.each(["home:group", "home:group-component", "home-roof:entity", '["frame","part-node","home"]'])(
  "exports arbitrary author ID %s without colliding with native Source objects",
  (id) => {
    const draft = makeDraft();
    const fragment = buildingDraftSource(draft, { id });
    const source: GalaceanSourcePrefabFile = {
      asset: { version: "2.0" },
      root: id,
      entities: fragment.entities,
      components: fragment.components
    };
    const a = copyBuildingPrefab(JSON.parse(JSON.stringify(source)), "a"),
      b = copyBuildingPrefab(source, "b");
    expect(sorted(read(a))).toEqual(sorted(draft));
    const objects = [...a.entities, ...a.components, ...b.entities, ...b.components];
    expect(new Set(objects.map((v) => v.id)).size).toBe(objects.length);
  }
);
