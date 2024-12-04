import {
  AssetPromise,
  AssetType,
  AudioClip,
  AudioManager,
  Loader,
  LoadItem,
  resourceLoader,
  ResourceManager
} from "@galacean/engine-core";
import { RequestConfig } from "@galacean/engine-core/types/asset/request";
import { AudioContentRestorer } from "./AudioContentRestorer";
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

            resourceManager.addContentRestorer(new AudioContentRestorer(audioClip, url, requestConfig));
            resolve(audioClip);
          })
          .catch((e) => {
            reject(e);
          });
      });
    });
  }
}
