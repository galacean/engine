import {
  AssetPromise,
  AssetType,
  AudioClip,
  LoadItem,
  Loader,
  RequestConfig,
  ResourceManager,
  resourceLoader
} from "@galacean/engine-core";

@resourceLoader(AssetType.Audio, ["mp3", "ogg", "wav", "m4a", "aac", "flac"])
class AudioLoader extends Loader<AudioClip> {
  // Decode here instead of the playback AudioContext: decoding happens at load time (before any user
  // gesture), and creating the playback context that early breaks iOS phone-call recovery; the offline
  // context decodes without touching the playback context
  private static _decodeContext: OfflineAudioContext;

  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<AudioClip> {
    return new AssetPromise((resolve, reject) => {
      const { url } = item;
      const requestConfig = <RequestConfig>{
        ...item,
        type: "arraybuffer"
      };

      resourceManager
        // @ts-ignore
        ._request<ArrayBuffer>(url, requestConfig)
        .then((arrayBuffer) => {
          const audioClip = new AudioClip(resourceManager.engine);
          AudioLoader._getDecodeContext()
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
        })
        .catch((e) => {
          reject(e);
        });
    });
  }

  private static _getDecodeContext(): OfflineAudioContext {
    // length/channels are decode-only placeholders; 44100 is the safest cross-browser rate.
    // decodeAudioData resamples once to this rate then again to the playback rate, so pitch/duration are unaffected
    return (AudioLoader._decodeContext ||= new OfflineAudioContext(1, 1, 44100));
  }
}
