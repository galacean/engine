import {
  AssetPromise,
  ContentRestorer,
  RequestConfig,
  TextureCube,
  TextureCubeFace,
  request
} from "@galacean/engine-core";

/**
 * @internal
 */
export class TextureCubeContentRestorer extends ContentRestorer<TextureCube> {
  constructor(
    resource: TextureCube,
    public urls: string[],
    public requestConfig: RequestConfig
  ) {
    super(resource);
  }

  override restoreContent(): AssetPromise<TextureCube> {
    return new AssetPromise((resolve, reject) => {
      Promise.all(this.urls.map((url) => request<HTMLImageElement>(url, this.requestConfig)))
        .then((images) => {
          const resource = this.resource;
          for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
            resource.setImageSource(TextureCubeFace.PositiveX + faceIndex, images[faceIndex], 0);
          }
          resource.generateMipmaps();
          resolve(resource);
        })
        .catch((e) => {
          reject(e);
        });
    });
  }
}
