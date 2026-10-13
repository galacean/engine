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
      ._request<any>(item.url, {
        ...item,
        type: "json"
      })
      .then((data) => {
        const physicsMaterial = new PhysicsMaterial();
        physicsMaterial.bounciness = data.bounciness;
        physicsMaterial.dynamicFriction = data.dynamicFriction;
        physicsMaterial.staticFriction = data.staticFriction;
        physicsMaterial.bounceCombine = data.bounceCombine;
        physicsMaterial.frictionCombine = data.frictionCombine;

        return physicsMaterial;
      });
  }
}
