import { AssetPromise, AudioClip, AudioManager, ContentRestorer, request } from "@galacean/engine-core";
import { RequestConfig } from "@galacean/engine-core/types/asset/request";
/**
 * @internal
 */
export class AudioContentRestorer extends ContentRestorer<AudioClip> {
  constructor(
    resource: AudioClip,
    public url: string,
    public requestConfig: RequestConfig
  ) {
    super(resource);
  }

  override restoreContent(): AssetPromise<AudioClip> {
    return request<ArrayBuffer>(this.url, this.requestConfig).then((arrayBuffer) => {
      return AudioManager.getContext()
        .decodeAudioData(arrayBuffer)
        .then((audioBuffer) => {
          const resource = this.resource;
          //@ts-ignore
          resource._setAudioSource(audioBuffer);
          return resource;
        });
    });
  }
}
