import {
  AnimationClip,
  Animator,
  AnimatorController,
  AssetPromise,
  Buffer,
  Entity,
  Material,
  ModelMesh,
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
  chainPromises: AssetPromise<any>[] = [];

  private _resourceCache = new Map<string, any>();
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
    this.contentRestorer = new GLTFContentRestorer(glTFResource);
  }

  get<T>(type: GLTFParserType.Entity, index: number): Entity;
  get<T>(type: GLTFParserType.Entity): Entity[];
  get<T>(type: GLTFParserType.Schema): AssetPromise<T>;
  get<T>(type: GLTFParserType.Validator): AssetPromise<T>;
  get<T>(type: GLTFParserType.AnimatorController): AssetPromise<T>;
  get<T>(type: GLTFParserType, index: number): AssetPromise<T>;
  get<T>(type: GLTFParserType): AssetPromise<T[]>;
  get<T>(type: GLTFParserType, index?: number): Entity | Entity[] | AssetPromise<T> | AssetPromise<T[]> {
    const parser = GLTFParserContext._parsers[type];

    if (!parser) {
      return AssetPromise.resolve(null);
    }

    const cache = this._resourceCache;
    const cacheKey = index === undefined ? `${type}` : `${type}:${index}`;
    let resource: Entity | Entity[] | AssetPromise<T> | AssetPromise<T[]> = cache.get(cacheKey);

    if (resource) {
      return resource;
    }

    const glTFSchemaKey = glTFSchemaMap[type];
    const isSubAsset = !!glTFResourceMap[type];

    if (glTFSchemaKey) {
      const glTFItems = this.glTF[glTFSchemaKey];
      if (glTFItems && (index === undefined || glTFItems[index])) {
        if (index === undefined) {
          resource =
            type === GLTFParserType.Entity
              ? <Entity[]>glTFItems.map((_, index) => this.get<T>(type, index))
              : AssetPromise.all<T>(glTFItems.map((_, index) => this.get<T>(type, index)));
        } else {
          resource = parser.parse(this, index);
          isSubAsset && this._handleSubAsset(resource, type, index);
        }
      } else {
        resource = AssetPromise.resolve<T>(null);
      }
    } else {
      resource = parser.parse(this, index);
      isSubAsset && this._handleSubAsset(resource, type, index);
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
        this.get<Texture2D>(GLTFParserType.Texture),
        this.get<Material>(GLTFParserType.Material),
        this.get<ModelMesh[]>(GLTFParserType.Mesh),
        this.get<Skin>(GLTFParserType.Skin),
        this.get<AnimationClip>(GLTFParserType.Animation),
        this.get<AnimatorController>(GLTFParserType.AnimatorController),
        this.get<Entity>(GLTFParserType.Scene)
      ]).then(() => {
        const glTFResource = this.glTFResource;
        const animatorController = glTFResource.animatorController;

        if (animatorController) {
          const animator = glTFResource._defaultSceneRoot.addComponent(Animator);
          animator.animatorController = animatorController;
        }

        this.resourceManager.addContentRestorer(this.contentRestorer);
        return glTFResource;
      });
    });

    this._addTaskCompletePromise(promise);
    return promise;
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
    taskPromise.then(
      () => {
        this._setTaskCompleteProgress(++task.loaded, task.total);
      },
      () => {}
    );
  }

  private _handleSubAsset<T>(
    resource: Entity | Entity[] | AssetPromise<T> | AssetPromise<T[]>,
    type: GLTFParserType,
    index?: number
  ): void {
    const glTFResourceKey = glTFResourceMap[type];

    if (type === GLTFParserType.Entity) {
      (this.glTFResource[glTFResourceKey] ||= [])[index] = <Entity>resource;
    } else {
      const url = this.glTFResource.url;

      (<AssetPromise<T>>resource).then((item: T) => {
        if (index == undefined) {
          this.glTFResource[glTFResourceKey] = item;
        } else {
          (this.glTFResource[glTFResourceKey] ||= [])[index] = item;
        }

        if (type === GLTFParserType.Mesh) {
          for (let i = 0, length = (<ModelMesh[]>item).length; i < length; i++) {
            const mesh = item[i] as ModelMesh;
            // @ts-ignore
            this.resourceManager._onSubAssetSuccess<ModelMesh>(url, `${glTFResourceKey}[${index}][${i}]`, mesh);
          }
        } else {
          // @ts-ignore
          this.resourceManager._onSubAssetSuccess<T>(
            url,
            `${glTFResourceKey}${index === undefined ? "" : `[${index}]`}`,
            item
          );

          if (type === GLTFParserType.Scene && (this.glTF.scene ?? 0) === index) {
            // @ts-ignore
            this.resourceManager._onSubAssetSuccess<Entity>(url, `defaultSceneRoot`, item as Entity);
          }
        }
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
