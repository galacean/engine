import {
  resourceLoader,
  Loader,
  AssetPromise,
  AssetType,
  LoadItem,
  ResourceManager,
  PhysicsMaterial
} from "@galacean/engine-core";

@resourceLoader(AssetType.PhysicsMaterial, ["physMat"])
class PhysicsMaterialLoader extends Loader<PhysicsMaterial> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<PhysicsMaterial> {
    return resourceManager
      ._request<any>(item.url!, {
        ...item,
        type: "json"
      })
      .then(({ bounciness, dynamicFriction, staticFriction, bounceCombine, frictionCombine }) => {
        const physicsMaterial = new PhysicsMaterial(resourceManager.engine);
        // Only apply present fields so sparse JSON preserves constructor defaults.
        if (bounciness !== undefined) physicsMaterial.bounciness = bounciness;
        if (dynamicFriction !== undefined) physicsMaterial.dynamicFriction = dynamicFriction;
        if (staticFriction !== undefined) physicsMaterial.staticFriction = staticFriction;
        if (bounceCombine !== undefined) physicsMaterial.bounceCombine = bounceCombine;
        if (frictionCombine !== undefined) physicsMaterial.frictionCombine = frictionCombine;

        return physicsMaterial;
      });
  }
}
