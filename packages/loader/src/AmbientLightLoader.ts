import {
  AmbientLight,
  AssetPromise,
  AssetType,
  ContentRestorer,
  DiffuseMode,
  Engine,
  LoadItem,
  Loader,
  RequestConfig,
  ResourceManager,
  TextureCube,
  TextureCubeFace,
  TextureFilterMode,
  TextureFormat,
  resourceLoader
} from "@galacean/engine-core";
import { SphericalHarmonics3 } from "@galacean/engine-math";
import { KTX2Container } from "./ktx2/KTX2Container";
import { KTX2Loader } from "./ktx2/KTX2Loader";
import { FileHeader } from "./resource-deserialize/utils/FileHeader";

@resourceLoader(AssetType.AmbientLight, ["ambLight"])
/** @internal */
class AmbientLightLoader extends Loader<AmbientLight> {
  static _shByteLength = 27 * 4;

  /** @internal */
  static _parseTexture(
    engine: Engine,
    buffer: ArrayBuffer,
    textureOffset: number,
    textureLength: number,
    texture?: TextureCube
  ): Promise<TextureCube> {
    if (KTX2Container.checkMagic(buffer, textureOffset)) {
      const ktx2Data = new Uint8Array(buffer, textureOffset, textureLength);
      return KTX2Loader._parseBuffer(ktx2Data, engine).then(
        ({ ktx2Container, engine, result, targetFormat, params }) => {
          const tex = KTX2Loader._createTextureByBuffer(
            engine,
            ktx2Container.isSRGB,
            result,
            targetFormat,
            params,
            texture
          ) as TextureCube;
          tex.filterMode = TextureFilterMode.Trilinear;
          return tex;
        }
      );
    } else {
      const size = new Uint16Array(buffer, textureOffset, 1)[0];
      texture ||= new TextureCube(engine, size, TextureFormat.R16G16B16A16, true, false);
      texture.filterMode = TextureFilterMode.Trilinear;
      const mipmapCount = texture.mipmapCount;
      let offset = textureOffset + 2;

      for (let mipLevel = 0; mipLevel < mipmapCount; mipLevel++) {
        const mipSize = size >> mipLevel;
        for (let face = 0; face < 6; face++) {
          const dataSize = mipSize * mipSize * 4;
          const data = new Uint16Array(buffer, offset, dataSize);
          offset += dataSize * 2;
          texture.setPixelBuffer(TextureCubeFace.PositiveX + face, data, mipLevel);
        }
      }
      return Promise.resolve(texture);
    }
  }

  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<AmbientLight> {
    const remoteUrl = resourceManager._getRemoteUrl(item.url);
    return new AssetPromise((resolve, reject) => {
      const requestConfig = { ...item, type: "arraybuffer" } as RequestConfig;
      const engine = resourceManager.engine;
      resourceManager
        ._requestByRemoteUrl<ArrayBuffer>(remoteUrl, requestConfig)
        .then((buffer) => {
          const header = FileHeader.decode(buffer);
          const dataOffset = header.headerLength;
          const sh = new SphericalHarmonics3();
          sh.copyFromArray(new Float32Array(buffer, dataOffset, 27));

          const textureOffset = dataOffset + AmbientLightLoader._shByteLength;
          return AmbientLightLoader._parseTexture(
            engine,
            buffer,
            textureOffset,
            header.dataLength - AmbientLightLoader._shByteLength
          ).then((specularTexture) => {
            engine.resourceManager.addContentRestorer(
              new AmbientLightContentRestorer(specularTexture, remoteUrl, requestConfig)
            );
            const ambientLight = new AmbientLight(engine);
            ambientLight.diffuseMode = DiffuseMode.SphericalHarmonics;
            ambientLight.diffuseSphericalHarmonics = sh;
            ambientLight.specularTexture = specularTexture;
            resolve(ambientLight);
          });
        })
        .catch(reject);
    });
  }
}

/**
 * @internal
 */
class AmbientLightContentRestorer extends ContentRestorer<TextureCube> {
  constructor(
    resource: TextureCube,
    public remoteUrl: string,
    public requestConfig: RequestConfig
  ) {
    super(resource);
  }

  override restoreContent(): AssetPromise<TextureCube> {
    return new AssetPromise((resolve, reject) => {
      const resource = this.resource;
      const engine = resource.engine;
      engine.resourceManager
        // @ts-ignore
        ._requestByRemoteUrl<ArrayBuffer>(this.remoteUrl, this.requestConfig)
        .then((buffer) => {
          const header = FileHeader.decode(buffer);
          const dataOffset = header.headerLength;
          const textureOffset = dataOffset + AmbientLightLoader._shByteLength;
          return AmbientLightLoader._parseTexture(
            engine,
            buffer,
            textureOffset,
            header.dataLength - AmbientLightLoader._shByteLength,
            resource
          );
        })
        .then(resolve)
        .catch(reject);
    });
  }
}
