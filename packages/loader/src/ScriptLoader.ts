import { AssetPromise, AssetType, Loader, LoadItem, resourceLoader } from "@galacean/engine-core";

export interface ESModule {
  default?: any;
  [key: string]: any;
}

@resourceLoader(AssetType.Script, ["js", "mjs"], false)
export class ScriptLoader extends Loader<ESModule> {
  load(item: LoadItem): AssetPromise<ESModule> {
    return new AssetPromise((resolve, reject) => {
      const { url } = item;
      (import(/* @vite-ignore */ url) as Promise<ESModule>)
        .then((esModule) => {
          resolve(esModule);
        })
        .catch(reject);
    });
  }
}
