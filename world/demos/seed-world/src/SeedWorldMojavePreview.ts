import { AssetType, MeshRenderer, type Entity, type GLTFResource } from "@galacean/engine";
import type { IslandPlan, PlanLandscape, PlanRock } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import { planningRemovedObjectIds } from "@galacean/engine-world-planning/spatial/PlanningResources";
import { MOJAVE_ROCK_GROUP, MOJAVE_STONE } from "@galacean/engine-world-planning/spatial/layout/MojaveDesertLayout";

const models = {
  [MOJAVE_ROCK_GROUP]: { url: new URL("../assets/mojave-preview/A01.glb", import.meta.url).href, size: [11.13, 5.4, 7.42] },
  [MOJAVE_STONE]: { url: new URL("../assets/mojave-preview/R03.glb", import.meta.url).href, size: [3.38, 2.15, 2.52] }
} as const;
type MojavePlacement = (PlanRock | PlanLandscape) & { assetId: keyof typeof models };

function isMojaveModel(id?: string): id is keyof typeof models {
  return id !== undefined && Object.hasOwn(models, id);
}

export async function createSeedWorldMojavePreview(
  parent: Entity,
  plan: IslandPlan,
  isCurrent: () => boolean
): Promise<Entity | undefined> {
  const removed = planningRemovedObjectIds(plan.authoredResources ?? []);
  const placements = [...plan.rocks, ...(plan.landscapes ?? [])].flatMap<MojavePlacement>((item) => {
    const { assetId } = item;
    return isMojaveModel(assetId) && !removed.has(item.id) ? [{ ...item, assetId }] : [];
  });
  if (!placements.length) return undefined;
  const assetIds = new Set(placements.map((item) => item.assetId));
  const resources = new Map(await Promise.all([...assetIds].map(async (id) =>
    [id, await parent.engine.resourceManager.load<GLTFResource>({ type: AssetType.GLTF, url: models[id].url })] as const
  )));
  if (!isCurrent()) return undefined;

  const group = parent.createChild("Mojave desert layout");
  try {
    for (const item of placements) {
      const model = resources.get(item.assetId)!.instantiateSceneRoot();
      group.addChild(model);
      model.name = item.id;
      model.transform.setPosition(item.center.x, item.baseHeight ?? 0, item.center.z);
      model.transform.setRotation(0, (-item.yaw * 180) / Math.PI, 0);
      const [width, height, depth] = models[item.assetId].size;
      model.transform.setScale(item.width / width, item.height / height, item.depth / depth);
      for (const renderer of model.getComponentsIncludeChildren(MeshRenderer, [])) {
        renderer.castShadows = true;
        renderer.receiveShadows = true;
      }
    }
  } catch (error) {
    group.destroy();
    throw error;
  }
  return group;
}
