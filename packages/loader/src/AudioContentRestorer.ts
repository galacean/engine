import { AssetPromise, ContentRestorer, request, AudioClip, TextureCubeFace } from "@galacean/engine-core";
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
    return request<ArrayBuffer>(this.url, this.requestConfig)
      .then((arrayBuffer) => {
        // @ts-ignore
        return resource._context.decodeAudioData(arrayBuffer);
      })
      .then((audioBuffer) => {
        const resource = this.resource;
        resource.setAudioSource(audioBuffer);
        return resource;
      });
  }
}
