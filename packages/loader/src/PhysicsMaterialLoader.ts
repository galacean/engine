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
      .then((data) => {
        const physicsMaterial = new PhysicsMaterial(resourceManager.engine);
        // Only apply present fields so sparse JSON preserves constructor defaults.
        if (data.bounciness !== undefined) physicsMaterial.bounciness = data.bounciness;
        if (data.dynamicFriction !== undefined) physicsMaterial.dynamicFriction = data.dynamicFriction;
        if (data.staticFriction !== undefined) physicsMaterial.staticFriction = data.staticFriction;
        if (data.bounceCombine !== undefined) physicsMaterial.bounceCombine = data.bounceCombine;
        if (data.frictionCombine !== undefined) physicsMaterial.frictionCombine = data.frictionCombine;

        return physicsMaterial;
      });
  }
}
