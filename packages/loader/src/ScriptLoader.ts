import { AssetPromise, AssetType, Loader, LoadItem, resourceLoader, Script } from "@galacean/engine-core";

@resourceLoader(AssetType.Script, ["js", "mjs"], false)
class ScriptLoader extends Loader<Script> {
  load(item: LoadItem): AssetPromise<Script> {
    return new AssetPromise((resolve, reject) => {
      const { url } = item;
      (import(url) as Promise<Script>)
        .then((esModule) => {
          resolve(esModule);
        })
        .catch(reject);
    });
  }
}
