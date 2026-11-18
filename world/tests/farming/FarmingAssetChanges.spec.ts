import { expect, it } from "vitest";
import { RuntimeAssetChanges } from "@galacean/engine-runtime-editor/project/runtime-asset-changes";
import {
  planningFarmingAssetRoots,
  planningFarmingAssetsAffected
} from "../../demos/seed-world/src/planning/spatial/farming/PlanningFarmingAssets.ts";
import { FARMING_PROP_ANIMATIONS } from "@galacean/engine-farming/farming/presentation/props/FarmingPropResources";
import { farmingTestProject, FARM_CATALOG, FARM_RULES } from "./FarmingTestProject.ts";
const HOE = FARMING_PROP_ANIMATIONS.hoe.prefabUrl;
const MATERIAL = "Custom/X.mat",
  TEXTURE = "Custom/X.ktx2",
  UNRELATED = "Other/Y.json";
function projectWithProp() {
  const pack = farmingTestProject();
  pack.project.files.push(
    { virtualPath: HOE, path: HOE, type: "Prefab", dependencies: [MATERIAL] },
    { virtualPath: MATERIAL, path: MATERIAL, type: "Material", dependencies: [TEXTURE] },
    { virtualPath: TEXTURE, path: TEXTURE, type: "KTX2", dependencies: [] },
    { virtualPath: UNRELATED, path: UNRELATED, type: "JSON", dependencies: [] }
  );
  pack.contents[HOE] = JSON.stringify({ material: { $ref: MATERIAL } });
  pack.contents[MATERIAL] = JSON.stringify({ texture: { $ref: TEXTURE } });
  pack.contents[TEXTURE] = new Uint8Array([1]);
  pack.contents[UNRELATED] = JSON.stringify({ value: 1 });
  return pack;
}
const roots = [FARM_CATALOG, FARM_RULES, HOE];
it("uses component references plus actual prop roots without restricting dependency paths", () => {
  const component = {
    id: "farm",
    type: "FarmingSystem",
    props: { catalog: { $ref: FARM_CATALOG }, rules: { $ref: FARM_RULES } }
  };
  expect(planningFarmingAssetRoots(component)).toEqual(expect.arrayContaining(roots));
});
it("rebuilds after a prefab is redirected to a custom material and that material or its texture changes", () => {
  const pack = projectWithProp();
  const changes = new RuntimeAssetChanges(pack);
  expect(planningFarmingAssetsAffected(changes, pack, roots)).toBe(false);
  pack.contents[MATERIAL] = JSON.stringify({ texture: { $ref: TEXTURE }, roughness: 1 });
  expect(planningFarmingAssetsAffected(changes, pack, roots)).toBe(true);
  changes.accept(pack);
  expect(planningFarmingAssetsAffected(changes, pack, roots)).toBe(false);
  pack.contents[TEXTURE] = new Uint8Array([2]);
  expect(planningFarmingAssetsAffected(changes, pack, roots)).toBe(true);
});
it("does not rebuild when prepare only fills previously unread farming text", () => {
  const pack = projectWithProp();
  delete pack.contents[HOE];
  delete pack.contents[MATERIAL];
  const changes = new RuntimeAssetChanges(pack);
  for (const path of [HOE, MATERIAL]) {
    const content = JSON.stringify({ read: path });
    pack.contents[path] = content;
    // Session.observeAssetReads delivers exactly this event after provider.prepare installs the cache.
    changes.recordRead(pack.project.files.find((file) => file.virtualPath === path)!, content);
  }
  expect(planningFarmingAssetsAffected(changes, pack, roots)).toBe(false);
});
it("does not rebuild for unrelated edits or identical copied binary contents", () => {
  const pack = projectWithProp(),
    changes = new RuntimeAssetChanges(pack);
  pack.contents[UNRELATED] = JSON.stringify({ value: 2 });
  pack.contents[TEXTURE] = new Uint8Array([1]);
  expect(planningFarmingAssetsAffected(changes, pack, roots)).toBe(false);
});
