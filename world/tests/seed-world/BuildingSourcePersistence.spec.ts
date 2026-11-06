import { copyBuildingPrefab } from "@galacean/engine-building/building/components/BuildingPrefab.ts";
import { BuildingGroupComponent } from "@galacean/engine-building/building/parts/architecture/BuildingGroupComponent.ts";
import { expect, it, vi } from "vitest";
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Matrix, Quaternion, Vector3 } from "@galacean/engine-math";
import { BuildingPartComponent } from "@galacean/engine-building/building/parts/architecture/BuildingPartComponent.ts";
import {
  collectBuildingParts,
  validatePartCollection
} from "@galacean/engine-building/building/parts/architecture/BuildingPartCollection.ts";
import { designBuilding } from "@galacean/engine-building/building/parts/architecture/BuildingDesign.ts";
import { implementBuilding } from "@galacean/engine-building/building/parts/architecture/BuildingImplementation.ts";
import { initialBuildingSource } from "@galacean/engine-world-planning/masonry/BuildingInitialSource.ts";
import { buildingGenerationPlan } from "../../demos/building-components/BuildingGenerationFixture";
import { nativeAssets } from "../../../packages/building/tests/fixtures/constructionAssets";
import { buildBuildingRenderPackage } from "@galacean/engine-building/building/runtime/BuildingRenderPackage.ts";
import { buildingGlobals } from "@galacean/engine-building/building/runtime/BuildingGlobals.ts";

const hash = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? String(v) : v)))
    .digest("hex");
const xyz = (v = [0, 0, 0]) => new Vector3(...v);
function matrix(e: GalaceanSourceEntitySchema) {
  const rotation = new Quaternion(),
    result = new Matrix(),
    [x, y, z] = e.rotation ?? [0, 0, 0];
  Quaternion.rotationEuler((x * Math.PI) / 180, (y * Math.PI) / 180, (z * Math.PI) / 180, rotation);
  Matrix.affineTransformation(xyz(e.scale ?? [1, 1, 1]), rotation, xyz(e.position), result);
  return result;
}
function sourceFrames(source: GalaceanSourceSceneFile | GalaceanSourcePrefabFile) {
  const engine = {},
    scene = {},
    library: any = { engine, destroyed: false, instanceId: 1 };
  const entities = new Map(
    source.entities.map((e) => [
      e.id,
      {
        engine,
        scene,
        destroyed: false,
        isActive: e.isActive !== false,
        parent: null as any,
        transform: {
          localMatrix: matrix(e),
          worldMatrix: new Matrix(),
          position: new Vector3(...(e.position ?? [0, 0, 0]))
        }
      }
    ])
  );
  for (const e of source.entities) for (const id of e.children ?? []) entities.get(id)!.parent = entities.get(e.id)!;
  const owners = new Map(source.entities.flatMap((e) => (e.components ?? []).map((id) => [id, e.id] as const)));
  const parts = source.components
    .filter((c) => ["BuildingPartComponent", "BuildingGroupComponent"].includes(c.type))
    .map((c) => {
      const p = c.props as any,
        part = Object.create(
          c.type === "BuildingGroupComponent" ? BuildingGroupComponent.prototype : BuildingPartComponent.prototype
        );
      Object.defineProperties(part, {
        enabled: { value: p.enabled !== false },
        entity: { value: entities.get(owners.get(c.id)!) },
        frame: { value: entities.get(p.frame.$entity) },
        assetLibrary: { value: p.assetLibrary ? library : null },
        definition: { get: () => structuredClone(p.definition) },
        relations: { get: () => structuredClone(p.relations) }
      });
      return part as BuildingPartComponent;
    });
  validatePartCollection(parts);
  const active = parts.filter((p) => {
    if (!p.enabled) return false;
    for (let entity: any = p.entity; entity; entity = entity.parent) if (!entity.isActive) return false;
    return true;
  });
  return new Map(
    [...new Set(parts.map((p) => p.frame!))].map((frame) => {
      const frameId = [...entities].find(([, e]) => e === (frame as any))![0];
      return [
        frameId,
        collectBuildingParts(
          frame,
          active.filter((p) => p.frame === frame && p instanceof BuildingGroupComponent),
          active,
          undefined
        ).draft
      ];
    })
  );
}
async function verifyCurrentSource(source: GalaceanSourceSceneFile | GalaceanSourcePrefabFile) {
  const original = sourceFrames(source);
  const saved = sourceFrames(JSON.parse(JSON.stringify(source)));
  expect(original.size).toBeGreaterThan(0);
  for (const [id, draft] of original) {
    const design = designBuilding(draft, () => 0, nativeAssets.compilation);
    expect(design.diagnostics).toEqual([]);
    const input = (await implementBuilding(design)).renderInput;
    expect(input.rawDraws.length + input.surfaceParts.length + input.backingParts.length).toBeGreaterThan(0);
    const replay = await implementBuilding(designBuilding(saved.get(id)!, () => 0, nativeAssets.compilation));
    expect(hash(replay.renderInput)).toBe(hash(input));
    const rendered = buildBuildingRenderPackage(
      input,
      nativeAssets,
      buildingGlobals(input.paletteSlots, nativeAssets.frame),
      true
    );
    expect(rendered.package.draws.length).toBeGreaterThan(0);
    let resourceBytes = 0;
    for (const path of rendered.dynamicFiles) {
      const buffer = await rendered.asset(path);
      expect(buffer).toBeInstanceOf(ArrayBuffer);
      resourceBytes += buffer.byteLength;
    }
    expect(resourceBytes).toBeGreaterThan(0);
  }
}

it.each(["circle-circle", "gable-junction", "round-gothic"])(
  "current %s preset preserves render data through save/reload",
  async (name) => {
    const source = JSON.parse(
      readFileSync(new URL(`../../../packages/building/src/building/assets/prefabs/${name}.prefab`, import.meta.url), "utf8")
    );
    await verifyCurrentSource(source);
  },
  30000
);

it("generates initial flat authoring with executable, persistent component references", async () => {
  const fragment = await initialBuildingSource(
    buildingGenerationPlan,
    {
      samples: new Uint16Array(4),
      resolution: 2,
      origin: [-1024, -1024],
      size: 2048,
      decode: { offset: 0, scale: 1 }
    },
    nativeAssets.compilation,
    "Units/kit.prefab"
  );
  const source: GalaceanSourceSceneFile = {
    asset: { version: "2.0" },
    scene: { rootEntities: fragment.rootEntities },
    entities: fragment.entities,
    components: fragment.components
  };
  expect(source.components.filter((c) => c.type === "BuildingGroupComponent")).toHaveLength(17);
  await verifyCurrentSource(source);
}, 60000);

it.each(["disabled-group", "hidden-frame"])(
  "multi-instance Prefab preserves %s and visible render data through copy/save/reload",
  async (state) => {
    const original = JSON.parse(
      readFileSync(new URL("../../../packages/building/src/building/assets/prefabs/gable-junction.prefab", import.meta.url), "utf8")
    );
    const a = copyBuildingPrefab(original, "a"),
      b = copyBuildingPrefab(original, "b");
    const compound: GalaceanSourcePrefabFile = {
      asset: { version: "2.0" },
      root: "compound",
      entities: [{ id: "compound", children: [a.root, b.root] }, ...a.entities, ...b.entities],
      components: [...a.components, ...b.components]
    };
    const before = sourceFrames(compound);
    if (state === "disabled-group") {
      for (const c of a.components) if (c.type === "BuildingGroupComponent") c.props!.enabled = false;
    } else a.entities.find((e) => e.id === a.root)!.isActive = false;
    const saved = copyBuildingPrefab(JSON.parse(JSON.stringify(compound)), "saved");
    const loaded = JSON.parse(JSON.stringify(saved)) as GalaceanSourcePrefabFile;
    const after = sourceFrames(loaded);
    expect(after.get("saved/" + a.root)!.parts).toEqual([]);
    expect(after.get("saved/" + b.root)).toEqual(before.get(b.root));
    const renderHash = async (draft: any) =>
      hash((await implementBuilding(designBuilding(draft, () => 0, nativeAssets.compilation))).renderInput);
    expect(await renderHash(after.get("saved/" + b.root))).toBe(await renderHash(before.get(b.root)));
    if (state === "disabled-group") {
      for (const c of loaded.components) if (c.type === "BuildingGroupComponent") c.props!.enabled = true;
    } else loaded.entities.find((e) => e.id === "saved/" + a.root)!.isActive = true;
    const restored = sourceFrames(loaded);
    expect(restored.get("saved/" + a.root)).toEqual(before.get(a.root));
    expect(await renderHash(restored.get("saved/" + a.root))).toBe(await renderHash(before.get(a.root)));
  },
  30000
);
