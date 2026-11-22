import {
  AnimationClip,
  Animator,
  AnimatorController,
  AssetPromise,
  Buffer,
  Entity,
  Logger,
  Material,
  ModelMesh,
  ReferResource,
  ResourceManager,
  Skin,
  Texture2D,
  TypedArray
} from "@galacean/engine-core";
import { BufferDataRestoreInfo, GLTFContentRestorer } from "../../GLTFContentRestorer";
import { GLTFParams } from "../../GLTFLoader";
import { GLTFResource } from "../GLTFResource";
import type { IGLTF } from "../GLTFSchema";
import { GLTFParser } from "./GLTFParser";

/**
 * @internal
 */
export class GLTFParserContext {
  private static readonly _parsers: Record<string, GLTFParser> = {};

  static addParser(parserType: GLTFParserType, parser: GLTFParser) {
    this._parsers[parserType] = parser;
  }

  glTF: IGLTF;
  accessorBufferCache: Record<string, BufferInfo> = {};
  contentRestorer: GLTFContentRestorer;
  buffers?: ArrayBuffer[];
  needAnimatorController = false;

  /** @internal */
  _getPromises: AssetPromise<unknown>[] = [];
  /** @internal */
  _aborted = false;

  private _resourceCache = new Map<string, any>();
  private _ownedResources = new Set<ReferResource>();
  private readonly _remoteAssetBaseURL: string;
  private _progress = {
    taskDetail: {},
    taskComplete: { loaded: 0, total: 0 }
  };

  /** @internal */
  _setTaskCompleteProgress: (loaded: number, total: number) => void;
  /** @internal */
  _setTaskDetailProgress: (url: string, loaded: number, total: number) => void;

  constructor(
    public glTFResource: GLTFResource,
    public resourceManager: ResourceManager,
    public params: GLTFParams
  ) {
    this._remoteAssetBaseURL = resourceManager._getRemoteUrl(glTFResource.url);
    this.contentRestorer = new GLTFContentRestorer(glTFResource);
  }

  get<T>(type: GLTFParserType.Entity, index: number): Entity;
  get<T>(type: GLTFParserType.Entity): Entity[];
  get<T>(type: GLTFParserType.Schema): AssetPromise<T>;
  get<T>(type: GLTFParserType.Validator): AssetPromise<T | null>;
  get<T>(type: GLTFParserType.AnimatorController): AssetPromise<T | null>;
  get<T>(type: GLTFParserType, index: number): AssetPromise<T>;
  get<T>(type: GLTFParserType): AssetPromise<T[] | null>;
  get<T>(type: GLTFParserType, index?: number): Entity | Entity[] | AssetPromise<T | null> | AssetPromise<T[] | null> {
    const parser = GLTFParserContext._parsers[type];

    if (!parser) {
      return AssetPromise.resolve(null);
    }

    const cache = this._resourceCache;
    const cacheKey = index === undefined ? `${type}` : `${type}:${index}`;
    let resource: Entity | Entity[] | AssetPromise<T | null> | AssetPromise<T[] | null> = cache.get(cacheKey);

    if (resource) {
      return resource;
    }

    if (this._aborted) {
      if (type === GLTFParserType.Entity) {
        return index === undefined ? [] : (null as unknown as Entity);
      }
      return new AssetPromise<T | null>(() => {});
    }

    const glTFSchemaKey = glTFSchemaMap[type];
    let shouldHandleSubAsset = false;

    if (glTFSchemaKey) {
      const glTFItems = this.glTF[glTFSchemaKey];
      if (glTFItems && (index === undefined || glTFItems[index])) {
        if (index === undefined) {
          resource =
            type === GLTFParserType.Entity
              ? <Entity[]>glTFItems.map((_, index) => this.get<Entity>(type, index))
              : AssetPromise.all<T>(glTFItems.map((_, index) => this.get<T>(type, index)));
        } else {
          resource = parser.parse(this, index);
          shouldHandleSubAsset = !!glTFResourceMap[type];
        }
      } else {
        resource = AssetPromise.resolve(null);
      }
    } else {
      resource = parser.parse(this, index);
      shouldHandleSubAsset = !!glTFResourceMap[type];
    }

    if (resource instanceof AssetPromise || resource instanceof Promise) {
      const rawPromise = resource as AssetPromise<T | null> | Promise<T | null>;
      if (rawPromise instanceof AssetPromise) {
        this._getPromises.push(rawPromise);
      }
      // Single abort gate: suppress downstream continuations and cancel errors once aborted
      resource = new AssetPromise<T | null>((resolve, reject) => {
        rawPromise.then(
          (value) => {
            if (!this._aborted) {
              resolve(value);
            }
          },
          (reason) => {
            if (!this._aborted) {
              reject(reason);
            }
          }
        );
      });
    }

    if (shouldHandleSubAsset) {
      this._handleSubAsset(resource, type, index);
    }
    cache.set(cacheKey, resource);
    return resource;
  }

  parse(): AssetPromise<GLTFResource> {
    const promise = this.get<IGLTF>(GLTFParserType.Schema).then((json) => {
      this.glTF = json;
      this.needAnimatorController = !!(json.skins || json.animations);

      return AssetPromise.all([
        this.get<void>(GLTFParserType.Validator),
        this.get<Entity>(GLTFParserType.Scene),
        this.get<Texture2D>(GLTFParserType.Texture),
        this.get<Material>(GLTFParserType.Material),
        this.get<ModelMesh[]>(GLTFParserType.Mesh),
        this.get<Skin>(GLTFParserType.Skin),
        this.get<AnimationClip>(GLTFParserType.Animation),
        this.get<AnimatorController>(GLTFParserType.AnimatorController)
      ]).then(() => {
        if (this._aborted) {
          return this.glTFResource;
        }
        if (this.glTFResource.destroyed) {
          this._abort();
          throw new Error("GLTFResource was destroyed during load.");
        }
        const glTFResource = this.glTFResource;
        const animatorController = glTFResource.animatorController;

        if (animatorController) {
          const animator = glTFResource._defaultSceneRoot.addComponent(Animator);
          animator.animatorController = animatorController;
        }

        this.resourceManager.addContentRestorer(this.contentRestorer);
        this._ownedResources.clear();
        this._getPromises.length = 0;
        return glTFResource;
      });
    });

    this._addTaskCompletePromise(promise);
    return promise;
  }

  /**
   * @internal
   */
  _trackResource<T extends ReferResource>(resource: T): T {
    if (this._aborted) {
      resource.destroy();
      return resource;
    }
    this._ownedResources.add(resource);
    this.glTFResource._associateResource(resource);
    return resource;
  }

  /**
   * @internal
   */
  _abort(): void {
    if (this._aborted) {
      return;
    }
    this._aborted = true;

    const getPromises = this._getPromises;
    for (let i = 0, n = getPromises.length; i < n; i++) {
      getPromises[i].cancel();
    }
    getPromises.length = 0;

    // Disassociate before destroying glTFResource so owned resources can be released even during deferred frame teardown
    this.glTFResource._disassociateAllResources();
    this.glTFResource.destroy();

    this._ownedResources.forEach((resource) => {
      resource.destroy();
    });
    this._ownedResources.clear();
  }

  /**
   * @internal
   */
  _onTaskDetail = (url: string, loaded: number, total: number) => {
    const detail = (this._progress.taskDetail[url] ||= {});
    detail.loaded = loaded;
    detail.total = total;

    this._setTaskDetailProgress(url, loaded, total);
  };

  /**
   * @internal
   */
  _addTaskCompletePromise(taskPromise: AssetPromise<any>): void {
    const task = this._progress.taskComplete;
    task.total += 1;
    taskPromise
      .finally(() => {
        this._setTaskCompleteProgress(++task.loaded, task.total);
      })
      .catch((e) => {
        // Need catch to avoid unhandled rejection
      });
  }

  private _handleSubAsset<T>(
    resource: Entity | Entity[] | AssetPromise<T | null> | AssetPromise<T[] | null>,
    type: GLTFParserType,
    index?: number
  ): void {
    const glTFResourceKey = glTFResourceMap[type];

    if (type === GLTFParserType.Entity) {
      (this.glTFResource[glTFResourceKey] ||= [])[index] = <Entity>resource;
    } else {
      const remoteAssetBaseURL = this._remoteAssetBaseURL;

      (<AssetPromise<T>>resource)
        .then((item: T) => {
          if (index == undefined) {
            this.glTFResource[glTFResourceKey] = item;
          } else {
            (this.glTFResource[glTFResourceKey] ||= [])[index] = item;
          }

          if (type === GLTFParserType.Mesh) {
            for (let i = 0, length = (<ModelMesh[]>item).length; i < length; i++) {
              const mesh = item[i] as ModelMesh;
              this.resourceManager._onSubAssetSuccess<ModelMesh>(
                remoteAssetBaseURL,
                `${glTFResourceKey}[${index}][${i}]`,
                mesh
              );
            }
          } else {
            this.resourceManager._onSubAssetSuccess<T>(
              remoteAssetBaseURL,
              `${glTFResourceKey}${index === undefined ? "" : `[${index}]`}`,
              item
            );

            if (type === GLTFParserType.Scene && (this.glTF.scene ?? 0) === index) {
              this.resourceManager._onSubAssetSuccess<Entity>(remoteAssetBaseURL, `defaultSceneRoot`, item as Entity);
            }
          }
        })
        .catch((e) => {
          Logger.error("GLTFParserContext", `Failed to load ${glTFResourceKey} ${index}: ${e}`);
        });
    }
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
  Schema,
  Validator,
  Scene,
  Buffer,
  BufferView,
  Texture,
  Material,
  Mesh,
  Entity,
  Skin,
  Animation,
  AnimatorController
}

const glTFSchemaMap = {
  [GLTFParserType.Scene]: "scenes",
  [GLTFParserType.Buffer]: "buffers",
  [GLTFParserType.Texture]: "textures",
  [GLTFParserType.Material]: "materials",
  [GLTFParserType.Mesh]: "meshes",
  [GLTFParserType.Entity]: "nodes",
  [GLTFParserType.Skin]: "skins",
  [GLTFParserType.Animation]: "animations",
  [GLTFParserType.BufferView]: "bufferViews"
};

const glTFResourceMap = {
  [GLTFParserType.Scene]: "_sceneRoots",
  [GLTFParserType.Texture]: "textures",
  [GLTFParserType.Material]: "materials",
  [GLTFParserType.Mesh]: "meshes",
  [GLTFParserType.Entity]: "entities",
  [GLTFParserType.Skin]: "skins",
  [GLTFParserType.Animation]: "animations",
  [GLTFParserType.AnimatorController]: "animatorController"
};

export function registerGLTFParser(pipeline: GLTFParserType) {
  return (Parser: new () => GLTFParser) => {
    const parser = new Parser();
    GLTFParserContext.addParser(pipeline, parser);
  };
}
