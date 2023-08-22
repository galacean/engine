import { Buffer, Entity, ModelMesh, ResourceManager, Texture2D, TypedArray } from "@galacean/engine-core";
import { BufferDataRestoreInfo, GLTFContentRestorer } from "../../GLTFContentRestorer";
import { GLTFResource } from "../GLTFResource";
import type { IGLTF } from "../GLTFSchema";
import { GLTFParser } from "./GLTFParser";

/**
 * @internal
 */
export class GLTFParserContext {
  private static readonly _parsers: Record<string, GLTFParser> = {};

  /** @internal */
  static _addParser(parserType: GLTFParserType, parser: GLTFParser) {
    this._parsers[parserType] = parser;
  }

  glTF: IGLTF;
  hasSkinned: boolean = false;
  accessorBufferCache: Record<string, BufferInfo> = {};
  contentRestorer: GLTFContentRestorer;

  /** @internal */
  _buffers?: ArrayBuffer[];

  private _resourceCache = new Map<string, any>();

  constructor(
    public glTFResource: GLTFResource,
    public resourceManager: ResourceManager,
    public keepMeshData: boolean,
    public url: string
  ) {
    this.contentRestorer = new GLTFContentRestorer(glTFResource);
  }

  /**
   * Get the resource of the specified type.
   * @remarks Except for Entity, all other parsers are asynchronous
   * @param type - The type of resource
   * @param index - The index of resource, default all
   */
  get<T>(type: GLTFParserType, index?: number): T {
    const cache = this._resourceCache;
    const isOnlyOne = [GLTFParserType.JSON, GLTFParserType.Validator].indexOf(type) !== -1;
    let cacheKey: string;
    let needOnlyOne = true;

    if (isOnlyOne) {
      cacheKey = `${type}`;
    } else if (index >= 0) {
      cacheKey = `${type}:${index}`;
    } else {
      cacheKey = `${type}`;
      needOnlyOne = false;
    }

    let resource: T = cache.get(cacheKey);

    if (!resource) {
      if (needOnlyOne) {
        resource = GLTFParserContext._parsers[type].parse(this, index);

        // store glTFResource
        if (!isOnlyOne) {
          if (type === GLTFParserType.Entity) {
            if (!this.glTFResource["entities"]) {
              this.glTFResource["entities"] = [];
            }

            this.glTFResource["entities"][index] = <Entity>resource;
          } else {
            if (!this.glTFResource[type]) {
              this.glTFResource[type] = [];
            }
            (<Promise<T>>resource)
              .then((item: T) => {
                if (!this.glTFResource[type]) {
                  this.glTFResource[type] = [];
                }

                this.glTFResource[type][index] = item;

                if (type === GLTFParserType.Mesh) {
                  for (let i = 0, length = (<ModelMesh[]>item).length; i < length; i++) {
                    const mesh = item[i] as ModelMesh;
                    this.resourceManager.onSubAssetSuccess<ModelMesh>(`${this.url}?q=${type}[${index}][${i}]`, mesh);
                  }
                } else {
                  this.resourceManager.onSubAssetSuccess<T>(`${this.url}?q=${type}[${index}]`, item);
                  if (type === GLTFParserType.Scene && (this.glTF.scene ?? 0) === index) {
                    this.resourceManager.onSubAssetSuccess<Entity>(`${this.url}?q=defaultSceneRoot`, item as Entity);
                  }
                }
              })
              .catch((e) => {
                this.resourceManager.onSubAssetFail(`${this.url}?q=${type}[${index}]`, e);
              });
          }
        }
      } else {
        const items = this.glTF[type];
        if (items) {
          if (type === GLTFParserType.Entity) {
            resource = items.map((_, index) => this.get<T>(type, index));
          } else {
            resource = <T>Promise.all(items.map((_, index) => this.get<T>(type, index)));
          }
        } else {
          resource = <T>Promise.resolve(null);
        }
      }

      cache.set(cacheKey, resource);
    }

    return resource;
  }

  /** @internal */
  _parse(): Promise<GLTFResource> {
    return this.get<Promise<IGLTF>>(GLTFParserType.JSON).then((json) => {
      this.glTF = json;

      return Promise.all([
        this.get<void>(GLTFParserType.Validator),
        this.get<Texture2D[]>(GLTFParserType.Texture),
        this.get<Entity>(GLTFParserType.Scene)
      ]).then(() => {
        this.resourceManager.addContentRestorer(this.contentRestorer);
        return this.glTFResource;
      });
    });
  }
}

/**
 * @internal
 */
export class BufferInfo {
  vertexBuffer: Buffer;
  vertexBindingInfos: Record<number, number> = {};
  restoreInfo: BufferDataRestoreInfo;

  constructor(
    public data: TypedArray,
    public interleaved: boolean,
    public stride: number
  ) {}
}

export enum GLTFParserType {
  JSON = "JSON",
  Validator = "Validator",
  Scene = "scenes",
  Buffer = "buffers",
  Texture = "textures",
  Material = "materials",
  Mesh = "meshes",
  Entity = "nodes",
  Skin = "skins",
  Animation = "animations"
}

export function registerGLTFParser(pipeline: GLTFParserType) {
  return (Parser: new () => GLTFParser) => {
    const parser = new Parser();
    GLTFParserContext._addParser(pipeline, parser);
  };
}
