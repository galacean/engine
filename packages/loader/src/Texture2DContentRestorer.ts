import { AssetPromise, ContentRestorer, request, Texture2D } from "@galacean/engine-core";
import { RequestConfig } from "@galacean/engine-core/types/asset/request";

/**
 * @internal
 */
export class Texture2DContentRestorer extends ContentRestorer<Texture2D> {
  constructor(
    resource: Texture2D,
    public url: string,
    public requestConfig: RequestConfig
  ) {
    super(resource);
  }

  override restoreContent(): AssetPromise<Texture2D> {
    return request<HTMLImageElement>(this.url, this.requestConfig).then((image) => {
      const resource = this.resource;
      resource.setImageSource(image);
      resource.generateMipmaps();
      return resource;
    });
  }
}
