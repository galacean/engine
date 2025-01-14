import {
  AssetPromise,
  AssetType,
  AudioClip,
  AudioManager,
  LoadItem,
  Loader,
  RequestConfig,
  ResourceManager,
  resourceLoader
} from "@galacean/engine-core";
@resourceLoader(AssetType.Audio, ["mp3", "ogg", "wav"])
class AudioLoader extends Loader<AudioClip> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<AudioClip> {
    return new AssetPromise((resolve, reject) => {
      const { url } = item;
      const requestConfig = <RequestConfig>{
        ...item,
        type: "arraybuffer"
      };

      // @ts-ignore
      resourceManager._request<ArrayBuffer>(url, requestConfig).then((arrayBuffer) => {
        const audioClip = new AudioClip(resourceManager.engine);
        AudioManager.getContext()
          .decodeAudioData(arrayBuffer)
          .then((result: AudioBuffer) => {
            // @ts-ignore
            audioClip._setAudioSource(result);

            if (url.indexOf("data:") !== 0) {
              const index = url.lastIndexOf("/");
              audioClip.name = url.substring(index + 1);
            }

            resolve(audioClip);
          })
          .catch((e) => {
            reject(e);
          });
      });
    });
  }
}
