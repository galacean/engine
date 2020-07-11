import { Asset, Config, Loader, LoaderType } from "./types";
import { BinaryLoader } from "./loader/BinaryLoader";
import { CubeTextureLoader } from "./loader/CubeTextureLoader";
import { GLTFLoader } from "./loader/GLTFLoader";
import { HDRLoader } from "./loader/HDRLoader";
import { TextLoader } from "./loader/TextLoader";
import { JSONLoader } from "./loader/JSONLoader";
import { TextureLoader } from "./loader/TextureLoader";
import { KTXLoader } from "./loader/KTXLoader";
import { ImageLoader } from "./loader/ImageLoader";

function allProgress<T>(promises: Promise<T>[], onProgress: ProgressFunc) {
  let currentCount = 0;
  const total = promises.length;
  for (let i = 0; i < total; i++) {
    promises[i].then((item) => {
      currentCount++;
      onProgress(item, currentCount, total);
    });
  }
  return Promise.all(promises);
}

const mimeTypeMap = {
  png: LoaderType.Image,
  jpg: LoaderType.Image,
  json: LoaderType.JSON,
  bin: LoaderType.Binary,
  txt: LoaderType.Text,
  ktx: LoaderType.KTX,
  hdr: LoaderType.HDR,
  gltf: LoaderType.GLTF
};

class ResourceManager {
  private loaders: Record<LoaderType, Loader<Asset>> = {
    [LoaderType.Binary]: new BinaryLoader(),
    [LoaderType.TextureCube]: new CubeTextureLoader(),
    [LoaderType.GLTF]: new GLTFLoader(),
    [LoaderType.HDR]: new HDRLoader(),
    [LoaderType.Text]: new TextLoader(),
    [LoaderType.JSON]: new JSONLoader(),
    [LoaderType.Texture]: new TextureLoader(),
    [LoaderType.KTX]: new KTXLoader(),
    [LoaderType.Image]: new ImageLoader()
  };

  constructor() {}

  load(config: Config) {
    let type = config.type;
    if (!type) {
      type = ResourceManager._getType(config.url);
    }

    return this.loaders[type].load(config);
  }

  loadAll(configs: Config[], onProgress?: ProgressFunc) {
    const promises = [];
    for (let i = 0, len = configs.length; i < len; i++) {
      promises.push(this.load(configs[i]));
    }
    if (onProgress) {
      return allProgress(promises, onProgress);
    }
    return Promise.all(promises);
  }

  gc(): void {}

  private static _getType(url: string | string[]): LoaderType {
    if (typeof url === "string") {
      const index = url.lastIndexOf(".");
      const type = mimeTypeMap[url.substring(index + 1)];
      if (type) {
        return type;
      }
      throw `can't find loader type for ${url}, please specify loader type`;
    } else {
      return LoaderType.TextureCube;
    }
  }
}
