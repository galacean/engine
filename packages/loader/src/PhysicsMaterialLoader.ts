import {
  resourceLoader,
  Loader,
  AssetPromise,
  AssetType,
  LoadItem,
  ResourceManager,
  PhysicsMaterial
} from "@galacean/engine-core";

const properties = Object.freeze([
  "bounciness",
  "dynamicFriction",
  "staticFriction",
  "bounceCombine",
  "frictionCombine"
] as const);

type PhysicsMaterialData = Partial<Pick<PhysicsMaterial, (typeof properties)[number]>>;

@resourceLoader(AssetType.PhysicsMaterial, ["physMat"])
class PhysicsMaterialLoader extends Loader<PhysicsMaterial> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<PhysicsMaterial> {
    return resourceManager
      ._request<PhysicsMaterialData>(item.url!, {
        ...item,
        type: "json"
      })
      .then((data) => {
        if (!data || typeof data !== "object" || Array.isArray(data)) {
          throw new TypeError("Physics material data must be an object.");
        }
        const physicsMaterial = new PhysicsMaterial(resourceManager.engine);
        try {
          for (const property of properties) {
            const value = data[property];
            if (value !== undefined) {
              physicsMaterial[property] = value;
            }
          }
          return physicsMaterial;
        } catch (error) {
          physicsMaterial.destroy();
          throw error;
        }
      });
  }
}
