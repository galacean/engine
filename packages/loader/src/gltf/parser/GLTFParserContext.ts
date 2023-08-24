import {
  AnimationClip,
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
  hasSkinned: boolean = false;
  accessorBufferCache: Record<string, BufferInfo> = {};
  contentRestorer: GLTFContentRestorer;
  buffers?: ArrayBuffer[];

  private _resourceCache = new Map<string, any>();

  constructor(
    public url: string,
    public glTFResource: GLTFResource,
    public resourceManager: ResourceManager,
    public keepMeshData: boolean
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
    if (!parser) return Promise.resolve(null);

    const cache = this._resourceCache;
    const glTFSchemaKey = glTFSchemaMap[type];
    const glTFResourceKey = glTFResourceMap[type];
    const isSchemaParser = type === GLTFParserType.Schema;
    const isValidatorParser = type === GLTFParserType.Validator;
    const cacheKey = isSchemaParser || isValidatorParser || index === undefined ? `${type}` : `${type}:${index}`;
    let resource: Entity | Entity[] | Promise<T> | Promise<T[]> = cache.get(cacheKey);

    if (!resource) {
      const isEntityParser = type === GLTFParserType.Entity;

      if (index >= 0 || isSchemaParser || isValidatorParser) {
        resource = parser.parse(this, index);

        // store glTF sub assets
        if (glTFResourceKey) {
          if (isEntityParser) {
            this.glTFResource[glTFResourceKey] ||= [];
            this.glTFResource[glTFResourceKey][index] = <Entity>resource;
          } else {
            (<Promise<T>>resource)
              .then((item: T) => {
                this.glTFResource[glTFResourceKey] ||= [];
                this.glTFResource[glTFResourceKey][index] = item;

                if (type === GLTFParserType.Mesh) {
                  for (let i = 0, length = (<ModelMesh[]>item).length; i < length; i++) {
                    const mesh = item[i] as ModelMesh;
                    // @ts-ignore
                    this.resourceManager._onSubAssetSuccess<ModelMesh>(
                      `${this.url}?q=${glTFResourceKey}[${index}][${i}]`,
                      mesh
                    );
                  }
                } else {
                  // @ts-ignore
                  this.resourceManager._onSubAssetSuccess<T>(`${this.url}?q=${glTFResourceKey}[${index}]`, item);
                  if (type === GLTFParserType.Scene && (this.glTF.scene ?? 0) === index) {
                    // @ts-ignore
                    this.resourceManager._onSubAssetSuccess<Entity>(`${this.url}?q=defaultSceneRoot`, item as Entity);
                  }
                }
              })
              .catch((e) => {
                // @ts-ignore
                this.resourceManager._onSubAssetFail(`${this.url}?q=${glTFResourceKey}[${index}]`, e);
              });
          }
        }
      } else {
        const items = this.glTF[glTFSchemaKey];
        if (items) {
          resource = isEntityParser
            ? <Entity[]>items.map((_, index) => this.get<T>(type, index))
            : Promise.all<T>(items.map((_, index) => this.get<T>(type, index)));
        } else {
          resource = Promise.resolve<T>(null);
        }
      }

      cache.set(cacheKey, resource);
    }

    return resource;
  }

  /** @internal */
  _parse(): Promise<GLTFResource> {
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
  [GLTFParserType.Scene]: "sceneRoots",
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
