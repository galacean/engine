import { AssetPromise, Loader, LoadItem, resourceLoader, ResourceManager, UnlitMaterial } from "@oasis-engine/core";
import { ReflectionParser } from "../prefab/ReflectionParser";

@resourceLoader("UnlitMaterial", ["prefab"], true)
export class UnlitMaterialLoader extends Loader<UnlitMaterial> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<UnlitMaterial> {
    return new AssetPromise((resolve, reject) => {
      this.request<any>(item.url, { type: "json" }).then((data) => {
        const mtl = new UnlitMaterial(resourceManager.engine);
        delete data.shader;
        ReflectionParser.parsePropsAndMethods(mtl, { props: data }, resourceManager.engine).then(() => {
          resolve(mtl);
        });
      });
    });
  }
}
