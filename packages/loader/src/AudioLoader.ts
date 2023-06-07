import { resourceLoader, Loader, AssetPromise, AssetType, LoadItem, AudioManager } from "@galacean/engine-core";

@resourceLoader(AssetType.Audio, ["mp3", "ogg", "wav"], false)
class AudioLoader extends Loader<AudioBuffer> {
  load(item: LoadItem): AssetPromise<AudioBuffer> {
    return new AssetPromise((resolve, reject) => {
      this.request<ArrayBuffer>(item.url, { type: "arraybuffer" }).then((arrayBuffer) => {
        AudioManager.context
          .decodeAudioData(arrayBuffer)
          .then((result) => {
            resolve(result);
          })
          .catch((e) => {
            reject(e);
          });
      });
    });
  }
}
