import {
  resourceLoader,
  Loader,
  AssetPromise,
  AssetType,
  LoadItem,
  AudioManager,
  AudioClip,
  ResourceManager
} from "@galacean/engine-core";
@resourceLoader(AssetType.Audio, ["mp3", "ogg", "wav"], false)
class AudioLoader extends Loader<AudioClip> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<AudioClip> {
    return new AssetPromise((resolve, reject) => {
      this.request<ArrayBuffer>(item.url, { type: "arraybuffer" }).then((arrayBuffer) => {
        AudioManager.context
          .decodeAudioData(arrayBuffer)
          .then((result: AudioBuffer) => {
            const audioClip = new AudioClip(resourceManager.engine);
            audioClip.setData(result);
            resolve(audioClip);
          })
          .catch((e) => {
            reject(e);
          });
      });
    });
  }
}
