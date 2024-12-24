import {
  resourceLoader,
  Loader,
  AssetPromise,
  AssetType,
  LoadItem,
  ResourceManager,
  ModelMesh,
  PhysicsMaterial
} from "@galacean/engine-core";
import { decode } from "./resource-deserialize";

@resourceLoader(AssetType.PhysicsMaterial, ["mesh"])
class PhysicsMaterialLoader extends Loader<PhysicsMaterial> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<PhysicsMaterial> {
    return new AssetPromise((resolve, reject) => {
      resourceManager
        // @ts-ignore
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
        })
        .then((mesh) => {
          resolve(mesh);
        })
        .catch(reject);
    });
  }
}
