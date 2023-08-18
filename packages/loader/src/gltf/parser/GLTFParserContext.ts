import {
  AnimationClip,
  AssetPromise,
  Buffer,
  Entity,
  Material,
  ModelMesh,
  Texture2D,
  TypedArray
} from "@galacean/engine-core";
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
  glTFResource: GLTFResource;
  keepMeshData: boolean;
  hasSkinned: boolean = false;
  chainPromises: AssetPromise<any>[] = [];
  accessorBufferCache: Record<string, BufferInfo> = {};

  texturesPromiseInfo: PromiseInfo<Texture2D[]> = new PromiseInfo<Texture2D[]>();
  materialsPromiseInfo: PromiseInfo<Material[]> = new PromiseInfo<Material[]>();
  meshesPromiseInfo: PromiseInfo<ModelMesh[][]> = new PromiseInfo<ModelMesh[][]>();
  animationClipsPromiseInfo: PromiseInfo<AnimationClip[]> = new PromiseInfo<AnimationClip[]>();
  defaultSceneRootPromiseInfo: PromiseInfo<Entity> = new PromiseInfo<Entity>();
  masterPromiseInfo: PromiseInfo<GLTFResource> = new PromiseInfo<GLTFResource>();
  promiseMap: Record<string, AssetPromise<any>> = {};

  contentRestorer: GLTFContentRestorer;

  /** @internal */
  _buffers?: ArrayBuffer[];

  private _resourceCache = new Map<string, any>();

  constructor(url: string) {
    const promiseMap = this.promiseMap;
    promiseMap[`${url}?q=textures`] = this._initPromiseInfo(this.texturesPromiseInfo);
    promiseMap[`${url}?q=materials`] = this._initPromiseInfo(this.materialsPromiseInfo);
    promiseMap[`${url}?q=meshes`] = this._initPromiseInfo(this.meshesPromiseInfo);
    promiseMap[`${url}?q=animations`] = this._initPromiseInfo(this.animationClipsPromiseInfo);
    promiseMap[`${url}?q=defaultSceneRoot`] = this._initPromiseInfo(this.defaultSceneRootPromiseInfo);
    promiseMap[`${url}`] = this._initPromiseInfo(this.masterPromiseInfo);
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
            (<Promise<T>>resource).then((item: T) => {
              if (!this.glTFResource[type]) {
                this.glTFResource[type] = [];
              }

              this.glTFResource[type][index] = item;
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

      return Promise.all([this.get<void>(GLTFParserType.Validator), this.get<Entity>(GLTFParserType.Scene)]).then(
        () => {
          const {
            materialsPromiseInfo,
            defaultSceneRootPromiseInfo,
            texturesPromiseInfo,
            meshesPromiseInfo,
            animationClipsPromiseInfo
          } = this;
          const glTFResource = this.glTFResource;

          texturesPromiseInfo.resolve(this.get<Promise<Texture2D[]>>(GLTFParserType.Texture));
          materialsPromiseInfo.resolve(this.get<Promise<Material[]>>(GLTFParserType.Material));
          meshesPromiseInfo.resolve(this.get<Promise<ModelMesh[][]>>(GLTFParserType.Mesh));
          animationClipsPromiseInfo.resolve(this.get<Promise<AnimationClip[]>>(GLTFParserType.Animation));
          defaultSceneRootPromiseInfo.resolve(glTFResource.defaultSceneRoot);

          return glTFResource;
        }
      );
    });
  }

  private _initPromiseInfo(promiseInfo: PromiseInfo<any>): AssetPromise<any> {
    const promise = new AssetPromise<any>((resolve, reject, setProgress, onCancel) => {
      promiseInfo.resolve = resolve;
      promiseInfo.reject = reject;
      promiseInfo.setProgress = setProgress;
      promiseInfo.onCancel = onCancel;
    });
    promiseInfo.promise = promise;
    return promise;
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

/**
 * @internal
 */
export class PromiseInfo<T> {
  public promise: AssetPromise<T>;
  public resolve: (value?: T | PromiseLike<T>) => void;
  public reject: (reason?: any) => void;
  public setProgress: (progress: number) => void;
  public onCancel: (callback: () => void) => void;
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
