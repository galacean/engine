import { expect, it, vi } from "vitest";
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { buildingDraftSource } from "../src/tiny-glade/parts/architecture/BuildingSource";
import { European } from "../src/tiny-glade/parts/architecture/European";
import { combineBuildingDrafts, type BuildingDraft } from "../src/tiny-glade/parts/architecture/BuildingDraft";
import { copyBuildingPrefab } from "../src/tiny-glade/components/BuildingPrefab";
import { designBuilding } from "../src/tiny-glade/parts/architecture/BuildingDesign";
import { prepareBuildingPublication } from "../src/tiny-glade/parts/architecture/BuildingPublication";
import { implementBuilding } from "../src/tiny-glade/parts/architecture/BuildingImplementation";
import { constructionDecorationRecipe } from "../src/tiny-glade/runtime/ConstructionDecorationRecipe";
import { nativeAssets } from "./fixtures/constructionAssets";
import { createHash } from "node:crypto";
import { buildBuildingRenderPackage } from "../src/tiny-glade/runtime/BuildingRenderPackage";
import { prepareBuildingCpu } from "../src/tiny-glade/parts/architecture/BuildingCpu";
import { buildingGlobals } from "../src/tiny-glade/runtime/BuildingGlobals";

const makeDraft = () =>
  European.buildHouses({
    id: "home",
    seed: 17,
    height: 5,
    rectangle: { center: [0, 0], size: [10, 8], rotation: 0 },
    roof: { height: 0.9, ridge_length: 0.35, profile: 0.7 },
    foundation: { height: 0.5 },
    attachments: [
      {
        id: "window",
        kind: "window",
        type: "window-cottage",
        host: "wall",
        u: 0.35,
        bottom: 1.2,
        width: 1.2,
        height: 1.5
      }
    ]
  });
function prefab(draft = makeDraft()): GalaceanSourcePrefabFile {
  const { entities, components } = buildingDraftSource(draft, { id: "frame", assetLibrary: "Units/kit.prefab" });
  return { asset: { version: "2.0" }, root: "frame", entities, components };
}
function read(source: GalaceanSourcePrefabFile): BuildingDraft {
  const components = source.components.filter((c) => c.type === "BuildingPartComponent");
  return {
    groups: source.components.filter((c) => c.type === "BuildingGroupComponent").map((c) => c.props!.definition),
    parts: components.map((c) => c.props!.definition),
    relations: components.flatMap((c) => c.props!.relations as any[])
  } as unknown as BuildingDraft;
}

function sourcePart(source: { components: GalaceanSourceComponentSchema[] }, id: string) {
  return source.components.find((c) => c.type === "BuildingPartComponent" && (c.props!.definition as any).id === id)!;
}
function sourceNode(
  source: { entities: GalaceanSourceEntitySchema[]; components: GalaceanSourceComponentSchema[] },
  id: string
) {
  const component = sourcePart(source, id);
  return source.entities.find((entity) => entity.components?.includes(component.id))!;
}

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
  expect(read(JSON.parse(JSON.stringify(source)))).toEqual(draft);
  expect(draft).toEqual(before);
  expect(new Set([...source.entities, ...source.components].map((c) => c.id)).size).toBe(
    source.entities.length + source.components.length
  );
});

it("copies Source references while preserving instance-local architectural definitions", () => {
  const draft = makeDraft();
  const original = prefab(draft);
  (sourcePart(original, "home-wall").props!.definition as any).params.reference = {
    $entity: sourceNode(original, "home-roof").id
  };
  (sourcePart(original, "home-roof").props!.definition as any).params.reference = {
    $component: sourcePart(original, "home-wall").id
  };
  const before = structuredClone(original);
  const a = copyBuildingPrefab(original, "a"),
    b = copyBuildingPrefab(original, "b");
  expect(read(a).groups).toEqual(draft.groups);
  expect(read(b).groups).toEqual(draft.groups);
  expect(read(a).parts.map((p) => p.id)).toEqual(draft.parts.map((p) => p.id));
  expect(read(a).relations).toEqual(draft.relations);
  expect((sourcePart(a, "home-wall").props!.definition as any).params.reference).toEqual({
    $entity: sourceNode(a, "home-roof").id
  });
  expect((sourcePart(a, "home-roof").props!.definition as any).params.reference).toEqual({
    $component: sourcePart(a, "home-wall").id
  });
  expect(a.components[0].props!.assetLibrary).toEqual({ $ref: "Units/kit.prefab" });
  expect(a.components.every((c) => (c.props!.frame as any).$entity === a.root)).toBe(true);
  expect(original).toEqual(before);
  const ids = [...a.entities, ...a.components, ...b.entities, ...b.components].map((v) => v.id);
  expect(new Set(ids).size).toBe(ids.length);
});

it("keeps a native Point mount position through Source export, JSON and Prefab copy", () => {
  const draft = makeDraft(),
    part = draft.parts.find((p) => p.type === "window")!;
  delete part.support.params.spec.u;
  delete part.support.params.spec.bottom;
  part.support.params.point = [0, 0, 0];
  const position: [number, number, number] = [4.228004652928132, 0.85, -1.7513307767780637];
  const source = buildingDraftSource(draft, {
    id: "frame",
    partTransforms: { [part.id]: { position } }
  });
  const exported: GalaceanSourcePrefabFile = JSON.parse(
    JSON.stringify({ asset: { version: "2.0" }, root: "frame", ...source })
  );
  const copied = copyBuildingPrefab(exported, "copy");
  expect(sourceNode(copied, part.id).position).toEqual(position);
  const copiedPart = read(copied).parts.find((p) => p.id === part.id)!;
  expect(copiedPart.support.params.point).toEqual([0, 0, 0]);
  expect(copiedPart.support.params.spec.u).toBeUndefined();
  expect(copiedPart.support.params.spec.bottom).toBeUndefined();
  expect(() => buildingDraftSource(draft, { id: "frame", partTransforms: { missing: { position } } })).toThrow(
    "unknown part"
  );
});

it("preserves all submitted geometry through Source serialization and JSON reload", async () => {
  const draft = makeDraft();
  const compile = async (inputDraft: BuildingDraft) => {
    const design = designBuilding(inputDraft, () => 0, nativeAssets.compilation);
    expect(design.diagnostics).toEqual([]);
    const input = (await implementBuilding(design)).renderInput;
    const rendered = buildBuildingRenderPackage(
      input,
      nativeAssets,
      buildingGlobals(input.paletteSlots, nativeAssets.frame),
      true
    );
    const buffers = Object.fromEntries(
      await Promise.all(
        rendered.dynamicFiles.map(async (path) => [
          path,
          createHash("sha256")
            .update(new Uint8Array(await rendered.asset(path)))
            .digest("hex")
        ])
      )
    );
    return { package: rendered.package, buffers };
  };
  const hash = (value: unknown) =>
    createHash("sha256")
      .update(JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? String(v) : v)))
      .digest("hex");
  const restored = read(JSON.parse(JSON.stringify(prefab(draft))));
  expect(hash(await compile(restored))).toBe(hash(await compile(draft)));
}, 30000);

it("preserves attachment producer seeds when assigning new copy identities", async () => {
  const original = prefab(),
    copy = copyBuildingPrefab(original, "copy");
  const derive = async (source: GalaceanSourcePrefabFile) => {
    const design = designBuilding(read(source), () => 0, nativeAssets.compilation);
    expect(design.diagnostics).toEqual([]);
    return prepareBuildingPublication(design);
  };
  // This checks the attachment planning phase; complete submitted buffers are
  // verified separately for both the original and repeated copies.
  const old = await derive(original),
    next = await derive(copy);
  const canonical = (value: unknown) =>
    JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? String(v) : v)).replaceAll("copy/", "");
  expect(canonical(next.prepared.decorations)).toBe(canonical(old.prepared.decorations));
  const copiedAgain = copyBuildingPrefab(copy, "again");
  expect(read(copiedAgain).parts.find((p) => p.type === "window")!.support.params.spec.seed).toBe(
    read(copy).parts.find((p) => p.type === "window")!.support.params.spec.seed
  );
});

it("requires explicit project references for native Units instead of serializing a live object graph", () => {
  class NativeUnit {
    readonly instanceId = 42;
  }
  const draft = makeDraft(),
    unit = new NativeUnit();
  draft.parts[0].unit = unit as any;
  expect(() => prefab(draft)).toThrow(/project.*reference/);
  const result = buildingDraftSource(draft, {
    id: "frame",
    reference: (value) => (value === unit ? { $ref: "Tile.prefab" } : undefined)
  });
  expect((sourcePart(result, "home-wall").props!.definition as any).unit).toEqual({
    $ref: "Tile.prefab"
  });
});

it("fails malformed sources before creating colliding or disconnected copies", () => {
  const source = prefab();
  (sourcePart(source, "home-wall").props!.relations as any[])[0].to.part = "missing";
  expect(() => copyBuildingPrefab(source, "copy")).toThrow(/endpoint/);

  const cyclic = makeDraft();
  cyclic.parts[0].params.self = cyclic;
  expect(() => prefab(cyclic)).toThrow(/cyclic/);
});

it.each([
  "house",
  "flat",
  "wood",
  "wall",
  "fence",
  "window",
  "dormer",
  "gothic-dormer",
  "spire",
  "cottage-half",
  "gothic-half",
  "arrow-half",
  "joined",
  "stone-arch",
  "wood-arch"
])(
  "retains submitted instance buffers across repeated prefab copies: %s",
  async (kind) => {
    const draft =
      kind === "wall"
        ? European.buildWall({ id: "home" })
        : kind === "fence"
          ? European.buildFence({ id: "home" })
          : European.buildHouses({
              id: "home",
              seed: 17,
              height: 7,
              foundation: { height: 0.5 },
              floors: { enabled: true, interval: 3.5 },
              ...(kind === "flat" ? { roof: { height: 0 } } : {}),
              ...(kind === "spire"
                ? {
                    circle: { center: [0, 0] as [number, number], radius: 3, phase: 0 },
                    roof: { height: 0.7, profile: 0.4, ridge_length: 0 }
                  }
                : {}),
              ...(kind === "wood" ? { wall: { unit: "wooden_plank", algorithm: { type: "horizontal_rows" } } } : {})
            });
    if (kind === "window") {
      const complete = makeDraft();
      draft.groups = complete.groups;
      draft.parts = complete.parts;
      draft.relations = complete.relations;
    }
    if (kind === "dormer" || kind === "gothic-dormer") {
      const gothic = kind === "gothic-dormer";
      const recipe = gothic
        ? constructionDecorationRecipe(nativeAssets.compilation.decorations, "dormer-gothic", 2)!
        : undefined;
      const complete = European.buildHouses({
        id: "home",
        seed: 17,
        height: 5,
        rectangle: { center: [0, 0], size: [10, 8], rotation: 0 },
        roof: { height: 0.9, ridge_length: 0.35, profile: 0.7 },
        attachments: [
          {
            id: "dormer",
            kind: "window",
            type: gothic ? "dormer-gothic" : "dormer-cottage",
            ...(gothic ? { frameMaterial: "wall" as const } : {}),
            host: "roof",
            uv: [0.02, 0.5],
            bottom: 0,
            width: recipe?.installationSize[0] ?? 1.4,
            height: recipe?.installationSize[1] ?? 1.6,
            rank: gothic ? 2 : 1
          }
        ]
      });
      draft.groups = complete.groups;
      draft.parts = complete.parts;
      draft.relations = complete.relations;
    }
    if (kind.endsWith("-half")) {
      const type = kind === "arrow-half" ? "dormer-arrow-slit-half" : `dormer-${kind}`;
      const recipe = constructionDecorationRecipe(nativeAssets.compilation.decorations, type, 2)!;
      const complete = European.buildHouses({
        id: "home",
        seed: 17,
        height: 5,
        rectangle: { center: [0, 0], size: [10, 8], rotation: 0 },
        roof: { height: 0.9, ridge_length: 0.35, profile: 0.7 },
        attachments: [
          {
            id: "half",
            kind: "window",
            type,
            rank: 2,
            host: "wall",
            u: 1 / 9,
            bottom: 4.8 + recipe.bounds.min[1],
            width: recipe.installationSize[0],
            height: recipe.installationSize[1],
            ...(kind === "cottage-half" ? {} : { frameMaterial: "wall" as const })
          }
        ]
      });
      Object.assign(draft, complete);
    }
    if (kind.endsWith("-arch")) {
      const complete = European.buildHouses({
        id: "home",
        seed: 17,
        height: 5,
        ...(kind === "wood-arch" ? { wall: { unit: "wooden_plank", algorithm: { type: "horizontal_rows" } } } : {}),
        attachments: [
          {
            id: "arch",
            kind: "opening",
            type: "opening-arch",
            host: "wall",
            u: 0.15,
            bottom: 0,
            width: 2.8,
            height: 2.8,
            rank: 1,
            seed: 0
          }
        ]
      });
      draft.groups = complete.groups;
      draft.parts = complete.parts;
      draft.relations = complete.relations;
    }
    if (kind === "joined") {
      const complete = combineBuildingDrafts(
        draft,
        European.buildHouses({
          id: "annex",
          seed: 19,
          height: 4,
          rectangle: { center: [5, 0], size: [8, 6], rotation: Math.PI / 2 }
        })
      );
      draft.groups = complete.groups;
      draft.parts = complete.parts;
      draft.relations = complete.relations;
    }
    const source = prefab(draft);
    const generate = async (source: GalaceanSourcePrefabFile) => {
      const design = designBuilding(read(source), () => 0, nativeAssets.compilation);
      expect(design.diagnostics).toEqual([]);
      const result = await implementBuilding(design);
      const input = result.renderInput;
      const rendered = buildBuildingRenderPackage(
        input,
        nativeAssets,
        buildingGlobals(input.paletteSlots, nativeAssets.frame),
        true
      );
      const near = await Promise.all(
        rendered.dynamicFiles.map(async (path) => {
          const bytes = new Uint8Array(await rendered.asset(path));
          return { length: bytes.byteLength, hash: createHash("sha256").update(bytes).digest("hex") };
        })
      );
      const cpu = await prepareBuildingCpu(
        read(source),
        {
          samples: new Uint16Array(4),
          resolution: 2,
          origin: [-100, -100],
          size: 200,
          decode: { offset: 0, scale: 1 }
        },
        nativeAssets.compilation
      );
      // Identity and edit-chart references change on copy; every field submitted
      // for distance rendering, including material atlas pixels, must not change.
      const far = cpu.preview.parts.map(({ owner, bindingId, pickId, geometryId, regions, ...render }) => render);
      return { near, far: createHash("sha256").update(JSON.stringify(far)).digest("hex") };
    };
    const original = await generate(source),
      copy = copyBuildingPrefab(source, "copy");
    expect(await generate(copy)).toEqual(original);
    expect(await generate(copyBuildingPrefab(copy, "again"))).toEqual(original);
  },
  30000
);

function compoundPrefab(a: GalaceanSourcePrefabFile, b: GalaceanSourcePrefabFile): GalaceanSourcePrefabFile {
  return {
    asset: { version: "2.0" },
    root: "compound",
    entities: [{ id: "compound", children: [a.root, b.root] }, ...a.entities, ...b.entities],
    components: [...a.components, ...b.components]
  };
}
it("copies multiple native frames with repeated author IDs and preserves disabled/hidden states through JSON", () => {
  const a = copyBuildingPrefab(prefab(), "a"),
    b = copyBuildingPrefab(prefab(), "b");
  a.entities.find((e) => e.id === a.root)!.isActive = false;
  a.components.find((c) => c.type === "BuildingGroupComponent")!.props!.enabled = false;
  const compound = compoundPrefab(a, b),
    before = JSON.stringify(compound);
  const copied = copyBuildingPrefab(JSON.parse(before), "copy");
  const reloaded = JSON.parse(JSON.stringify(copied)) as GalaceanSourcePrefabFile;
  const repeated = copyBuildingPrefab(reloaded, "again");
  for (const output of [copied, reloaded, repeated]) {
    const groups = output.components.filter((c) => c.type === "BuildingGroupComponent");
    expect(groups.map((c) => c.props!.definition)).toEqual([makeDraft().groups[0], makeDraft().groups[0]]);
    expect(new Set(groups.map((c) => (c.props!.frame as any).$entity)).size).toBe(2);
    expect(groups[0].props!.enabled).toBe(false);
    expect(groups[1].props!.enabled).toBeUndefined();
    expect(output.entities.filter((e) => e.isActive === false)).toHaveLength(1);
    expect(output.components.filter((c) => c.type === "BuildingPartComponent").map((c) => c.props!.definition)).toEqual(
      [...makeDraft().parts, ...makeDraft().parts]
    );
  }
  expect(JSON.stringify(compound)).toBe(before);
});
it("checks duplicate author IDs within each frame even when the duplicate is disabled", () => {
  const source = prefab(),
    group = source.components.find((c) => c.type === "BuildingGroupComponent")!;
  source.components.push({
    ...structuredClone(group),
    id: "duplicate",
    props: { ...structuredClone(group.props), enabled: false }
  });
  source.entities.find((e) => e.components?.includes(group.id))!.components!.push("duplicate");
  expect(() => copyBuildingPrefab(source, "copy")).toThrow(/duplicate building group/);
});
it("rejects cross-frame relations instead of resolving them against another instance", () => {
  const a = copyBuildingPrefab(prefab(European.buildHouses({ id: "a" })), "a");
  const b = copyBuildingPrefab(prefab(European.buildHouses({ id: "b" })), "b");
  const wall = a.components.find(
    (c) => c.type === "BuildingPartComponent" && (c.props!.definition as any).id === "a-wall"
  )!;
  (wall.props!.relations as any[])[0].to.part = "b-roof";
  expect(() => copyBuildingPrefab(compoundPrefab(a, b), "copy")).toThrow(/Missing relation endpoint/);
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
  const unrelated = { id: "unrelated" };
  source.entities.push(unrelated);
  source.components[0].props!.frame = { $entity: unrelated.id };
  expect(() => copyBuildingPrefab(source, "copy")).toThrow(/ancestor/);
});

it.each(["home:group", "home:group-component", "home-roof:entity", "home", '["frame","part-node","home"]'])(
  "exports arbitrary author ID %s without colliding with native Source objects",
  (id) => {
    const draft = makeDraft();
    const old = draft.parts[0].id;
    draft.parts[0].id = id;
    for (const relation of draft.relations)
      for (const endpoint of [relation.from, relation.to]) if (endpoint.part === old) endpoint.part = id;
    const fragment = buildingDraftSource(draft, { id });
    const source: GalaceanSourcePrefabFile = {
      asset: { version: "2.0" },
      root: id,
      entities: fragment.entities,
      components: fragment.components
    };
    const a = copyBuildingPrefab(JSON.parse(JSON.stringify(source)), "a"),
      b = copyBuildingPrefab(source, "b");
    expect(read(a)).toEqual(draft);
    expect(read(b)).toEqual(draft);
    const objects = [...a.entities, ...a.components, ...b.entities, ...b.components];
    expect(new Set(objects.map((v) => v.id)).size).toBe(objects.length);
    for (const copy of [a, b]) {
      const entityIds = new Set(copy.entities.map((e) => e.id)),
        componentIds = new Set(copy.components.map((c) => c.id));
      for (const e of copy.entities) {
        for (const child of e.children ?? []) expect(entityIds.has(child)).toBe(true);
        for (const c of e.components ?? []) expect(componentIds.has(c)).toBe(true);
      }
      for (const c of copy.components) expect(entityIds.has((c.props!.frame as any).$entity)).toBe(true);
    }
  }
);
