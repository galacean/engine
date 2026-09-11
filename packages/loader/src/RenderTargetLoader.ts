import {
  AssetPromise,
  AssetType,
  LoadItem,
  Loader,
  RenderTarget,
  ResourceManager,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  resourceLoader
} from "@galacean/engine-core";

@resourceLoader(AssetType.RenderTarget, ["renderTarget"])
class RenderTargetLoader extends Loader<RenderTarget> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<RenderTarget> {
    const { engine } = resourceManager;
    const remoteAssetBaseURL = resourceManager._getRemoteUrl(item.url);
    return resourceManager
      ._requestByRemoteUrl<IRenderTargetData>(remoteAssetBaseURL, {
        ...item,
        type: "json"
      })
      .then((data: IRenderTargetData) => {
        const { width, height, colorFormats, depthFormat, antiAliasing, autoGenerateMipmaps } = data;

        const colorTextureProps = data.colorTextures;
        const colorTextures = colorFormats.map((format, i) => {
          const props = colorTextureProps?.[i];
          const mipmap = props?.mipmap ?? true;
          const isSRGB = props?.isSRGBColorSpace ?? format === TextureFormat.R8G8B8A8;
          const texture = new Texture2D(engine, width, height, format, mipmap, isSRGB);
          if (props) {
            if (props.filterMode != null) texture.filterMode = props.filterMode;
            if (props.wrapModeU != null) texture.wrapModeU = props.wrapModeU;
            if (props.wrapModeV != null) texture.wrapModeV = props.wrapModeV;
            if (props.anisoLevel != null) texture.anisoLevel = props.anisoLevel;
          }
          return texture;
        });

        const depth = depthFormat === -1 ? null : depthFormat;
        const rt = new RenderTarget(engine, width, height, colorTextures, depth, antiAliasing);
        if (autoGenerateMipmaps != null) rt.autoGenerateMipmaps = autoGenerateMipmaps;

        // Notify pending sub-asset requests for colorTextures
        for (let i = 0, n = colorTextures.length; i < n; i++) {
          resourceManager._onSubAssetSuccess(remoteAssetBaseURL, `colorTextures[${i}]`, colorTextures[i]);
        }

        return rt;
      });
  }
}

/** @internal */
interface IRenderTargetData {
  width: number;
  height: number;
  colorFormats: TextureFormat[];
  depthFormat: number;
  antiAliasing: number;
  autoGenerateMipmaps?: boolean;
  colorTextures?: IColorTextureProps[];
}

/** @internal */
interface IColorTextureProps {
  mipmap?: boolean;
  isSRGBColorSpace?: boolean;
  filterMode?: TextureFilterMode;
  wrapModeU?: TextureWrapMode;
  wrapModeV?: TextureWrapMode;
  anisoLevel?: number;
}
