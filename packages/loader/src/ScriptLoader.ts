import { AssetPromise, AssetType, Loader, LoadItem, resourceLoader } from "@galacean/engine-core";

@resourceLoader(AssetType.Script, ["js", "mjs"], false)
export class ScriptLoader extends Loader<ESModule> {
  load(item: LoadItem): AssetPromise<ESModule> {
    return new AssetPromise((resolve, reject) => {
      (import(/* @vite-ignore */ item.url) as Promise<ESModule>)
        .then((esModule) => {
          resolve(esModule);
        })
        .catch(reject);
    });
  }
}

/**
 * Represents a generic ES module that can have a default export and additional named exports.
 */
export interface ESModule {
  /** Default export of the module. */
  default?: any;
  /** Named exports from the module. */
  [key: string]: any;
}
