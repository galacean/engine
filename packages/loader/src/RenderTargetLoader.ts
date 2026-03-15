import {
  AssetPromise,
  AssetType,
  LoadItem,
  Loader,
  RenderTarget,
  ResourceManager,
  Texture2D,
  TextureFormat,
  resourceLoader
} from "@galacean/engine-core";

/** depthFormat value indicating no depth attachment. Must match editor's DEPTH_NONE. */
const DEPTH_NONE = -1;

@resourceLoader(AssetType.RenderTarget, ["renderTarget"])
class RenderTargetLoader extends Loader<RenderTarget> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<RenderTarget> {
    const { engine } = resourceManager;
    return (
      resourceManager
        // @ts-ignore
        ._request<IRenderTargetData>(item.url, {
          ...item,
          type: "json"
        })
        .then((data) => {
          const { width, height, colorFormat, depthFormat, antiAliasing, autoGenerateMipmaps } = data;

          const colorProps = data.colorTexture;
          const mipmap = colorProps?.mipmap ?? true;
          const isSRGB = colorProps?.isSRGBColorSpace ?? (colorFormat === TextureFormat.R8G8B8A8);
          const colorTexture = new Texture2D(engine, width, height, colorFormat, mipmap, isSRGB);
          if (colorProps) {
            if (colorProps.filterMode != null) colorTexture.filterMode = colorProps.filterMode;
            if (colorProps.wrapModeU != null) colorTexture.wrapModeU = colorProps.wrapModeU;
            if (colorProps.wrapModeV != null) colorTexture.wrapModeV = colorProps.wrapModeV;
            if (colorProps.anisoLevel != null) colorTexture.anisoLevel = colorProps.anisoLevel;
          }

          const depth = depthFormat === DEPTH_NONE ? null : depthFormat;
          const rt = new RenderTarget(engine, width, height, colorTexture, depth, antiAliasing);
          rt.autoGenerateMipmaps = autoGenerateMipmaps;

          // Notify pending sub-asset requests for colorTexture
          // @ts-ignore
          resourceManager._onSubAssetSuccess(item.url, "colorTextures[0]", colorTexture);

          return rt;
        })
    );
  }
}

/** @internal */
interface IRenderTargetData {
  width: number;
  height: number;
  colorFormat: TextureFormat;
  depthFormat: number;
  antiAliasing: number;
  autoGenerateMipmaps: boolean;
}
