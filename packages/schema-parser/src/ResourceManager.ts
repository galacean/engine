import { Oasis } from "./Oasis";
import {
  SchemaResource,
  GLTFResource,
  PBRMaterialResource,
  TextureResource,
  ScriptResource,
  BlinnPhongMaterialResource,
  TextureCubeMapResource
} from "./resouces";
import * as o3 from "@alipay/o3";

const RESOURCE_CLASS = {
  script: ScriptResource,
  gltf: GLTFResource,
  texture: TextureResource,
  // 'image': TextureResource,
  cubemap: TextureCubeMapResource,
  PBRMaterial: PBRMaterialResource,
  BlinnPhongMaterial: BlinnPhongMaterialResource
};

const resourceFactory = {
  createResource(assetConfig: AssetConfig): SchemaResource {
    const type = assetConfig.type;
    const ResourceConstructor = RESOURCE_CLASS[type];
    return new ResourceConstructor(assetConfig);
  }
};

export class ResourceManager {
  private resourceMap: { [id: string]: SchemaResource } = {};
  private resourceLoader: o3.ResourceLoader = new o3.ResourceLoader(this.oasis.engine, null);

  constructor(private oasis: Oasis) {}

  load(asset: AssetConfig): Promise<SchemaResource> {
    const resource = resourceFactory.createResource(asset);
    const loadPromise = resource.load(this.resourceLoader);
    loadPromise.then(() => {
      this.resourceMap[asset.id] = resource;
    });
    return loadPromise;
  }

  get(id: string): SchemaResource {
    return this.resourceMap[id];
  }

  getAll(): Array<SchemaResource> {
    return Object.values(this.resourceMap);
  }
}

const a = 1;
