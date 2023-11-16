import {
  AnimationClip,
  Animator,
  AnimatorController,
  AnimatorControllerLayer,
  AnimatorStateMachine,
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

  private _resourceCache = new Map<string, any>();

  constructor(
    public glTFResource: GLTFResource,
    public resourceManager: ResourceManager,
    public params: GLTFParams
  ) {
    this.contentRestorer = new GLTFContentRestorer(glTFResource);
  }

  get<T>(type: GLTFParserType.Entity, index: number): Entity;
  get<T>(type: GLTFParserType.Entity): Entity[];
  get<T>(type: GLTFParserType.Schema): Promise<T>;
  get<T>(type: GLTFParserType.Validator): Promise<T>;
  get<T>(type: GLTFParserType, index: number): Promise<T>;
  get<T>(type: GLTFParserType): Promise<T[]>;
  get<T>(type: GLTFParserType, index?: number): Entity | Entity[] | Promise<T> | Promise<T[]> {
    const parser = GLTFParserContext._parsers[type];

    if (!parser) {
      return Promise.resolve(null);
    }

    const cache = this._resourceCache;
    const isOnlyOne = type === GLTFParserType.Schema || type === GLTFParserType.Validator;
    const cacheKey = isOnlyOne || index === undefined ? `${type}` : `${type}:${index}`;
    let resource: Entity | Entity[] | Promise<T> | Promise<T[]> = cache.get(cacheKey);

    if (resource) {
      return resource;
    }

    if (isOnlyOne) {
      resource = parser.parse(this);
    } else {
      const glTFItems = this.glTF[glTFSchemaMap[type]];
      if (glTFItems && (index === undefined || glTFItems[index])) {
        if (index === undefined) {
          resource =
            type === GLTFParserType.Entity
              ? <Entity[]>glTFItems.map((_, index) => this.get<T>(type, index))
              : Promise.all<T>(glTFItems.map((_, index) => this.get<T>(type, index)));
        } else {
          resource = parser.parse(this, index);
          this._handleSubAsset(resource, type, index);
        }
      } else {
        resource = Promise.resolve<T>(null);
      }
    }

    cache.set(cacheKey, resource);
    return resource;
  }

  parse(): Promise<GLTFResource> {
    return this.get<IGLTF>(GLTFParserType.Schema).then((json) => {
      this.glTF = json;

      return Promise.all([
        this.get<void>(GLTFParserType.Validator),
        this.get<Texture2D>(GLTFParserType.Texture),
        this.get<Material>(GLTFParserType.Material),
        this.get<ModelMesh[]>(GLTFParserType.Mesh),
        this.get<Skin>(GLTFParserType.Skin),
        this.get<AnimationClip>(GLTFParserType.Animation),
        this.get<Entity>(GLTFParserType.Scene)
      ]).then(() => {
        const glTFResource = this.glTFResource;
        if (glTFResource.skins || glTFResource.animations) {
          this._createAnimator(this, glTFResource.animations);
        }
        this.resourceManager.addContentRestorer(this.contentRestorer);
        return glTFResource;
      });
    });
  }

  private _createAnimator(context: GLTFParserContext, animations: AnimationClip[]): void {
    const defaultSceneRoot = context.glTFResource.defaultSceneRoot;
    const animator = defaultSceneRoot.addComponent(Animator);
    const animatorController = new AnimatorController();
    const layer = new AnimatorControllerLayer("layer");
    const animatorStateMachine = new AnimatorStateMachine();
    animatorController.addLayer(layer);
    animator.animatorController = animatorController;
    layer.stateMachine = animatorStateMachine;
    if (animations) {
      for (let i = 0; i < animations.length; i++) {
        const animationClip = animations[i];
        const name = animationClip.name;
        const uniqueName = animatorStateMachine.makeUniqueStateName(name);
        if (uniqueName !== name) {
          console.warn(`AnimatorState name is existed, name: ${name} reset to ${uniqueName}`);
        }
        const animatorState = animatorStateMachine.addState(uniqueName);
        animatorState.clip = animationClip;
      }
    }
  }

  private _handleSubAsset<T>(
    resource: Entity | Entity[] | Promise<T> | Promise<T[]>,
    type: GLTFParserType,
    index: number
  ): void {
    const glTFResourceKey = glTFResourceMap[type];
    if (!glTFResourceKey) return;

    if (type === GLTFParserType.Entity) {
      (this.glTFResource[glTFResourceKey] ||= [])[index] = <Entity>resource;
    } else {
      const url = this.glTFResource.url;

      (<Promise<T>>resource).then((item: T) => {
        (this.glTFResource[glTFResourceKey] ||= [])[index] = item;

        if (type === GLTFParserType.Mesh) {
          for (let i = 0, length = (<ModelMesh[]>item).length; i < length; i++) {
            const mesh = item[i] as ModelMesh;
            // @ts-ignore
            this.resourceManager._onSubAssetSuccess<ModelMesh>(`${url}?q=${glTFResourceKey}[${index}][${i}]`, mesh);
          }
        } else {
          // @ts-ignore
          this.resourceManager._onSubAssetSuccess<T>(`${url}?q=${glTFResourceKey}[${index}]`, item);
          if (type === GLTFParserType.Scene && (this.glTF.scene ?? 0) === index) {
            // @ts-ignore
            this.resourceManager._onSubAssetSuccess<Entity>(`${url}?q=defaultSceneRoot`, item as Entity);
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
  Texture,
  Material,
  Mesh,
  Entity,
  Skin,
  Animation
}

const glTFSchemaMap = {
  [GLTFParserType.Scene]: "scenes",
  [GLTFParserType.Buffer]: "buffers",
  [GLTFParserType.Texture]: "textures",
  [GLTFParserType.Material]: "materials",
  [GLTFParserType.Mesh]: "meshes",
  [GLTFParserType.Entity]: "nodes",
  [GLTFParserType.Skin]: "skins",
  [GLTFParserType.Animation]: "animations"
};

const glTFResourceMap = {
  [GLTFParserType.Scene]: "_sceneRoots",
  [GLTFParserType.Texture]: "textures",
  [GLTFParserType.Material]: "materials",
  [GLTFParserType.Mesh]: "meshes",
  [GLTFParserType.Entity]: "entities",
  [GLTFParserType.Skin]: "skins",
  [GLTFParserType.Animation]: "animations"
};

export function registerGLTFParser(pipeline: GLTFParserType) {
  return (Parser: new () => GLTFParser) => {
    const parser = new Parser();
    GLTFParserContext.addParser(pipeline, parser);
  };
}
