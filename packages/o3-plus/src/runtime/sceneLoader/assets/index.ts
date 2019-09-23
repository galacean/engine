import * as r3 from "@alipay/o3";
import {loadResources} from "./resourceLoader/resource";
import {loadScripts} from "./scriptLoader/loader";

const assetCache = {};

export function script(name: string): ClassDecorator {
  return <TFunction extends Function>(target: TFunction): TFunction => {
    setResource(name, target);
    return target;
  };
}

export async function loadAssets(engine: r3.Engine, assets: { [id: string]: Asset }, onProgress?, local?:boolean) {
  const resources = filterResources(assets);
  const resPromise = loadResources(engine, resources, onProgress);

  let promises = [resPromise];

  if (!local) {
    const scripts = filterScripts(assets);
    const scriptsPromise = loadScripts(scripts);
    promises.push(scriptsPromise)
  }

  const res = await Promise.all(promises);

  loadR3Object(assets);

  generateCache(resources, res[0]);

  bindAsset();
}

function filterResources(assets: { [id: string]: Asset }) {
  return Object.values(assets)
    .filter(value => value.downloadable && value.type !== "script")
    .map(value => {
      const resource = new r3.Resource(value.name, {type: value.type as any, url: value.url});
      (resource as any).id = value.id;
      if (value.type === 'gltf' && value.props) {
        (resource as any).newMaterial = (value.props as any).newMaterial;
      }
      return resource;
    });
}

function filterScripts(assets: { [id: string]: Asset }) {
  return Object.values(assets)
    .filter(value => value.type === "script")
    .map(value => value.url);
}

function loadR3Object(assets: { [id: string]: Asset }) {
  Object.values(assets)
    .filter(value => !value.downloadable && value.type !== "script")
    .forEach(value => {
      const r3Object = new r3[value.type]();
      if (value.props) {
        for (let k in value.props) {
          if (value.props.hasOwnProperty(k)) {
            r3Object[k] = value.props[k];
          }
        }
      }
      r3Object.type = value.type;
      setResource(value.id, r3Object);
    })
}

function bindAsset() {
  Object.keys(assetCache).map(key => {
    const asset = assetCache[key];

    // 替换PBR材质中的纹理
    if (asset && asset.type === 'PBRMaterial') {
      const textureArr = ['metallicRoughnessTexture', 'specularGlossinessTexture', 'baseColorTexture', 'normalTexture', 'emissiveTexture', 'occlusionTexture'];
      textureArr.map(attr => {
        const value = asset[attr];
        if (value && checkIsAsset(value)) {
          asset[attr] = getResource(value.id).asset;
        }
      });
    }

    // 替换gltf文件中的material
    if (asset && asset.type === 'gltf' && asset.newMaterial) {
      const gltf = asset.asset;
      const meshes = gltf.meshes;
      // 兼容旧项目
      if (asset.newMaterial.id) {
        for (let i = 0; i < meshes.length; i++) {
          const assetId = asset.newMaterial.id;
          gltf.materials[i] = getResource(assetId);
          meshes[i].primitives[0].material = getResource(assetId);
        }
      } else {
        for (let i = 0; i < asset.newMaterial.length; i++) {
          gltf.materials[i] = getResource(asset.newMaterial[i].id);
        }
        let index = 0;
        for (let i = 0; i < meshes.length; i++) {
          for (let j = 0; j < meshes[i].primitives.length; j++) {
            meshes[i].primitives[j].material = getResource(asset.newMaterial[index].id);
            index++;
          }
        }
      }
      // for (let i = 0; i < meshes.length; i++) {
      //   // 兼容旧项目
      //   const assetId = asset.newMaterial.id || asset.newMaterial[i].id;
      //   gltf.materials[i] = getResource(assetId);
      //   meshes[i].primitives[0].material = getResource(assetId);
      // }
    }
  })
}

function checkIsAsset(config: any): boolean {
  return config.type === 'asset';
}

export function getResource(id: string) {
  return assetCache[id];
}

export async function fetchConfig(path: string) {
  return await fetch(path).then(value => value.json());
}

export function setResource(id: string, obj: any) {
  assetCache[id] = obj;
}

function generateCache(resources, res: any[]) {
  res.forEach((value, index) => {
    setResource(resources[index].id, value);
  });
}

export interface Asset {
  id: string;
  name: string;
  downloadable?: boolean;
  url?: string;
  localUrl?: string;
  type: string;
  props?: object
}
