import { AssetPromise, AssetType, Loader, LoadItem, resourceLoader, Script } from "@galacean/engine-core";

interface ESModuleStructure {
  default?: Script;
  [key: string]: any;
}

@resourceLoader(AssetType.Script, ["js", "mjs"], false)
export class ScriptLoader extends Loader<ESModuleStructure> {
  load(item: LoadItem): AssetPromise<ESModuleStructure> {
    return new AssetPromise((resolve, reject) => {
      (import(/* @vite-ignore */ item.url) as Promise<ESModuleStructure>)
        .then((esModule) => {
          resolve(esModule);
        })
        .catch(reject);
    });
  }
}
