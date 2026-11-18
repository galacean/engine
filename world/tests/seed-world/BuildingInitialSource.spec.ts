import { expect, it, vi } from "vitest";
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { constructionGeometry } from "../../../packages/building/tests/fixtures/constructionGeometry";
import { buildingGenerationPlan } from "../../demos/building-components/BuildingGenerationFixture";
import { initialBuildingDrafts } from "@galacean/engine-world-planning/masonry/BuildingInitialDraft.ts";
import { initialBuildingSource } from "@galacean/engine-world-planning/masonry/BuildingInitialSource.ts";
import {
  designBuildingCore,
  expandUnits,
  type BuildingPartDef
} from "@galacean/engine-building/building/core/index.ts";
import { createBuildingTypeRegistry, MOUNTED_PART_TYPES } from "@galacean/engine-building/building/partTypes/index.ts";
import { coreBuildingEnvironment } from "@galacean/engine-building/building/render/CoreBuilding.ts";
import { BUILTIN_BUILDING_ASSETS } from "@galacean/engine-building/building/resources/BuiltinBuildingAssets";
import { RuntimeProjectEdit } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
import { RUNTIME_PROJECT_SAVE_VERSION } from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { RuntimeSceneEdit } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-scene-edit";
import { nativeAssetFormats } from "@galacean/engine-runtime-editor/project/runtime-native-formats";
import { buildingScenePreparation } from "../../demos/seed-world/masonry/BuildingSceneInitialization";

it("keeps the mounted parts the design lays when the initial plan is saved as native author Source", async () => {
  const plan = structuredClone(buildingGenerationPlan);
  const registry = createBuildingTypeRegistry(),
    environment = coreBuildingEnvironment(() => 0, constructionGeometry);
  const laid = new Set<string>(),
    rejected = new Set<string>();
  for (const group of initialBuildingDrafts(plan)) {
    const design = designBuildingCore(group.draft, registry, { environment });
    for (const part of design.parts)
      if (part.identity.kind === "author" && MOUNTED_PART_TYPES.includes(part.type))
        if (expandUnits(part, registry, { environment }).length) laid.add(part.identity.id);
    // A mounted part the design does not lay, including one whose geometry failed.
    for (const part of group.draft.parts)
      if (MOUNTED_PART_TYPES.includes(part.type) && !laid.has(part.id)) rejected.add(part.id);
  }
  expect(laid.size).toBeGreaterThan(0);
  const source = await initialBuildingSource(
    plan,
    {
      samples: new Uint16Array(4),
      resolution: 2,
      origin: [-1000, -1000],
      size: 2000,
      decode: { offset: 0, scale: 1 }
    },
    constructionGeometry,
    "Building/Units/building-kit.prefab"
  );
  const restored = JSON.parse(JSON.stringify(source)) as typeof source;
  const parts = restored.components
    .filter((c) => c.type === "BuildingPartComponent")
    .map((c) => c.props!.definition as unknown as BuildingPartDef);
  const saved = new Set(parts.map((p) => p.id));
  for (const id of laid) expect(saved.has(id), `Laid installation lost from Source: ${id}`).toBe(true);
  for (const id of rejected) expect(saved.has(id), `Rejected installation persisted: ${id}`).toBe(false);
  expect(parts.some((p) => p.type === "window")).toBe(true);
  expect(parts.some((p) => p.type === "door")).toBe(true);
  // Some houses carry a Gothic dormer on their roof.
  expect(parts.some((p) => p.type === "dormer")).toBe(true);
});

it("keeps initialized legacy building frames and hand-placed children on reload", async () => {
  const grid = {
    samples: new Uint16Array(4), resolution: 2, origin: [0, 0] as [number, number], size: 1024,
    decode: { offset: 0, scale: 1 }
  };
  const legacy = await initialBuildingSource(
    { ...buildingGenerationPlan, buildings: buildingGenerationPlan.buildings.slice(0, 1), fences: [], courtyards: [] },
    grid, constructionGeometry, BUILTIN_BUILDING_ASSETS
  );
  expect(legacy.rootEntities).toHaveLength(1);
  const path = "Seed.scene";
  const draft = new RuntimeProjectEdit({
    version: RUNTIME_PROJECT_SAVE_VERSION,
    project: { scene: path, files: [
      { virtualPath: path, path, type: "Scene" },
      { virtualPath: BUILTIN_BUILDING_ASSETS, path: BUILTIN_BUILDING_ASSETS, type: "Prefab" }
    ] },
    contents: {
      [path]: JSON.stringify({
        asset: { version: "2.0" }, scene: { rootEntities: ["generator"] },
        entities: [{ id: "generator", components: ["init"], children: [...legacy.rootEntities, "author-prop"] },
          ...legacy.entities, { id: "author-prop", name: "Hand placed" }],
        components: [{ id: "init", type: "BuildingGeneratorComponent", props: { initialized: true } }, ...legacy.components]
      })
    }
  }, nativeAssetFormats(() => ({})));
  const plan = buildingGenerationPlan;
  const scene = new RuntimeSceneEdit(draft, path);
  const withAsset = vi.fn();
  const edit = {
    run: async (run: (args: { draft: RuntimeProjectEdit; edited: () => void }) => unknown) => run({ draft, edited() {} }),
    withAsset
  } as unknown as Parameters<ReturnType<typeof buildingScenePreparation>>[0];
  const prepare = buildingScenePreparation(path, async () => ({ plan, terrain: { grid, revision: 0 } }), plan);
  await prepare(edit, new AbortController().signal);
  const children = scene.readEntity("generator").children!.map((id) => scene.readEntity(id));
  const active = children.find((child) => child.children?.includes(legacy.rootEntities[0]));
  expect(active?.children).toEqual(legacy.rootEntities);
  expect(scene.readEntity(legacy.rootEntities[0]).position).toEqual(legacy.entities[0].position);
  expect(children.some((child) => child.id === "author-prop")).toBe(true);
  const before = draft.read(path);
  await prepare(edit, new AbortController().signal);
  expect(draft.read(path)).toBe(before);
  expect(withAsset).not.toHaveBeenCalled();
}, 60000);
