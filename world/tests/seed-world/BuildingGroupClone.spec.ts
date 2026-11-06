import { Entity, type Engine, ReferResource } from "@galacean/engine-core";
import { PrefabResource } from "@galacean/engine-loader";
import { BuildingGroupComponent } from "@galacean/engine-building/tiny-glade/parts/architecture/BuildingGroupComponent";
import { expect, it } from "vitest";

const engine = {
  canvas: { width: 800, height: 600 },
  resourceManager: { _deleteAsset() {}, _deleteContentRestorer() {}, _addReferResource() {}, _deleteReferResource() {} }
} as unknown as Engine;

it("runs against one engine module graph, so native clone ownership applies", () => {
  expect(new PrefabResource(engine, "identity.prefab")).toBeInstanceOf(ReferResource);
});

it("retains the asset library once per group through cloning and destruction", () => {
  const library = new PrefabResource(engine, "group-library.prefab");
  const source = new Entity(engine, "group");
  source.addComponent(BuildingGroupComponent).assetLibrary = library;
  expect(library.refCount).toBe(1);

  const copy = source.clone();
  expect(copy.getComponent(BuildingGroupComponent)!.assetLibrary).toBe(library);
  expect(library.refCount).toBe(2);

  source.destroy();
  expect(library.refCount).toBe(1);
  copy.destroy();
  expect(library.refCount).toBe(0);
  library.destroy();
});
