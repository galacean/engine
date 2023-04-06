import { AssetPromise, Sprite, SpriteAtlas } from "@oasis-engine/core";
import { PromiseInfo } from "../gltf/parser/ParserContext";

/**
 * @internal
 */
export class ParserContext {
  /** chain asset promise */
  chainPromises: AssetPromise<any>[] = [];
  spritesPromiseInfo: PromiseInfo<Sprite[]> = new PromiseInfo<Sprite[]>();
  masterPromiseInfo: PromiseInfo<SpriteAtlas> = new PromiseInfo<SpriteAtlas>();
  promiseMap: Record<string, AssetPromise<any>> = {};

  constructor(url: string) {
    const promiseMap = this.promiseMap;
    promiseMap[`${url}?q=sprites`] = this._initPromiseInfo(this.spritesPromiseInfo);
    promiseMap[`${url}`] = this._initPromiseInfo(this.masterPromiseInfo);
  }

  private _initPromiseInfo(promiseInfo): AssetPromise<any> {
    const promise = new AssetPromise<any>((resolve, reject, setProgress, onCancel) => {
      promiseInfo.resolve = resolve;
      promiseInfo.reject = reject;
      promiseInfo.setProgress = setProgress;
      promiseInfo.onCancel = onCancel;
    });
    promiseInfo.promise = promise;
    return promise;
  }
}
