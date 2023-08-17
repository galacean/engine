import {
  AnimationClip,
  AssetPromise,
  Buffer,
  Entity,
  Material,
  ModelMesh,
  Skin,
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

  /** @internal */
  _cache = new Map<string, any>();

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
   * @param type - The type of resource
   * @param index - The index of resource, default all
   */
  get<T>(type: GLTFParserType, index?: number): Promise<T> {
    const cacheKey = `${type}:${index}`;
    const cache = this._cache;
    let promise: Promise<T> = cache.get(cacheKey);

    if (!promise) {
      if (index !== undefined) {
        const allPromise: Promise<T> = cache.get(`${type}:${undefined}`);
        if (allPromise) {
          return allPromise.then((res) => res[index]);
        }
      }

      promise = GLTFParserContext._parsers[type].parse(this, index);
      cache.set(cacheKey, promise);
    }

    return promise;
  }

  /** @internal */
  _parse(): Promise<GLTFResource> {
    return this.get<IGLTF>(GLTFParserType.JSON).then((json) => {
      this.glTF = json;

      return Promise.all([
        this.get<Texture2D[]>(GLTFParserType.Texture),
        this.get<Material[]>(GLTFParserType.Material),
        this.get<ModelMesh[][]>(GLTFParserType.Mesh),
        this.get<Entity[]>(GLTFParserType.Entity),
        this.get<Skin[]>(GLTFParserType.Skin),
        this.get<AnimationClip[]>(GLTFParserType.Animation),
        this.get<Entity>(GLTFParserType.Scene),
        this.get<void>(GLTFParserType.Validator)
      ]).then(([textures, materials, meshes, entities, skins, animations, defaultSceneRoot]) => {
        const {
          materialsPromiseInfo,
          defaultSceneRootPromiseInfo,
          texturesPromiseInfo,
          meshesPromiseInfo,
          animationClipsPromiseInfo
        } = this;

        const glTFResource = this.glTFResource;

        glTFResource.textures = textures;
        glTFResource.materials = materials;
        glTFResource.meshes = meshes;
        glTFResource.entities = entities;
        glTFResource.skins = skins;
        glTFResource.animations = animations;

        texturesPromiseInfo.resolve(textures);
        materialsPromiseInfo.resolve(materials);
        meshesPromiseInfo.resolve(meshes);
        animationClipsPromiseInfo.resolve(animations);
        defaultSceneRootPromiseInfo.resolve(defaultSceneRoot);
        
        return glTFResource;
      });
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
  JSON,
  Buffer,
  Texture,
  Material,
  Mesh,
  Entity,
  Skin,
  Animation,
  Scene,
  Validator
}

export function registerGLTFParser(pipeline: GLTFParserType) {
  return (Parser: new () => GLTFParser) => {
    const parser = new Parser();
    GLTFParserContext._addParser(pipeline, parser);
  };
}
