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
import { KTX2Loader } from "./ktx2/KTX2Loader";
import { FileHeader } from "./resource-deserialize/utils/FileHeader";

@resourceLoader(AssetType.AmbientLight, ["ambLight"])
class AmbientLightLoader extends Loader<AmbientLight> {
  private static _shByteLength = 27 * 4;

  private static _parse(
    engine: Engine,
    buffer: ArrayBuffer,
    texture?: TextureCube
  ): { sh: SphericalHarmonics3; texturePromise: Promise<TextureCube> } {
    const isCompressed = FileHeader.checkMagic(buffer);
    const sh = new SphericalHarmonics3();

    if (isCompressed) {
      const header = FileHeader.decode(buffer);
      const dataOffset = header.headerLength;
      sh.copyFromArray(new Float32Array(buffer, dataOffset, 27));
      const texturePromise = AmbientLightLoader._parseCompressedTexture(
        engine, buffer, dataOffset + AmbientLightLoader._shByteLength, header.dataLength - AmbientLightLoader._shByteLength, texture
      );
      return { sh, texturePromise };
    }

    sh.copyFromArray(new Float32Array(buffer, 0, 27));
    const texturePromise = AmbientLightLoader._parseRawTexture(engine, buffer, texture);
    return { sh, texturePromise };
  }

  private static _parseCompressedTexture(
    engine: Engine,
    buffer: ArrayBuffer,
    ktx2Offset: number,
    ktx2Length: number,
    texture?: TextureCube
  ): Promise<TextureCube> {
    const ktx2Data = new Uint8Array(buffer, ktx2Offset, ktx2Length);

    return KTX2Loader._parseBuffer(ktx2Data, engine).then(
      ({ ktx2Container, engine, result, targetFormat, params }) => {
        const tex = KTX2Loader._createTextureByBuffer(
          engine, ktx2Container.isSRGB, result, targetFormat, params, texture
        ) as TextureCube;
        tex.filterMode = TextureFilterMode.Trilinear;
        return tex;
      }
    );
  }

  private static _parseRawTexture(
    engine: Engine,
    buffer: ArrayBuffer,
    texture?: TextureCube
  ): Promise<TextureCube> {
    const size = new Uint16Array(buffer, AmbientLightLoader._shByteLength, 1)[0];
    texture ||= new TextureCube(engine, size, TextureFormat.R16G16B16A16, true, false);
    texture.filterMode = TextureFilterMode.Trilinear;
    const mipmapCount = texture.mipmapCount;
    let offset = AmbientLightLoader._shByteLength + 2;

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

  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<AmbientLight> {
    return new AssetPromise((resolve, reject) => {
      const requestConfig = { ...item, type: "arraybuffer" } as RequestConfig;
      const engine = resourceManager.engine;
      const url = item.url;
      resourceManager
        // @ts-ignore
        ._request<ArrayBuffer>(url, requestConfig)
        .then((arraybuffer) => {
          const { sh, texturePromise } = AmbientLightLoader._parse(engine, arraybuffer);
          texturePromise
            .then((texture) => {
              engine.resourceManager.addContentRestorer(new AmbientLightContentRestorer(texture, url, requestConfig));
              const ambientLight = new AmbientLight(engine);
              ambientLight.diffuseMode = DiffuseMode.SphericalHarmonics;
              ambientLight.diffuseSphericalHarmonics = sh;
              ambientLight.specularTexture = texture;
              resolve(ambientLight);
            })
            .catch(reject);
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
    public url: string,
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
        ._request<ArrayBuffer>(this.url, this.requestConfig)
        .then((buffer) => {
          AmbientLightLoader._parse(engine, buffer, resource).texturePromise.then(resolve).catch(reject);
        })
        .catch(reject);
    });
  }
}
