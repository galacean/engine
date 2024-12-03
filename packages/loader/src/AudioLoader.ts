import {
  resourceLoader,
  Loader,
  AssetPromise,
  AssetType,
  LoadItem,
  AudioClip,
  ResourceManager
} from "@galacean/engine-core";
import { RequestConfig } from "@galacean/engine-core/types/asset/request";
import { AudioContentRestorer } from "./AudioContentRestorer";
@resourceLoader(AssetType.Audio, ["mp3", "ogg", "wav"], false)
class AudioLoader extends Loader<AudioClip> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<AudioClip> {
    return new AssetPromise((resolve, reject) => {
      const url = item.url;
      const requestConfig = <RequestConfig>{
        ...item,
        type: "arraybuffer"
      };

      // @ts-ignore
      resourceManager._request<ArrayBuffer>(url, requestConfig).then((arrayBuffer) => {
        const audioClip = new AudioClip(resourceManager.engine);
        // @ts-ignore
        audioClip._context
          .decodeAudioData(arrayBuffer)
          .then((result: AudioBuffer) => {
            audioClip.setAudioSource(result);

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
