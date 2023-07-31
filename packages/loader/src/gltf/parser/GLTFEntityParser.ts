import { Entity } from "@galacean/engine-core";
import { INode } from "../GLTFSchema";
import { GLTFParser } from "./GLTFParser";
import { GLTFParserContext, GLTFParserType, registerGLTFParser } from "./GLTFParserContext";

@registerGLTFParser(GLTFParserType.Entity)
export class GLTFEntityParser extends GLTFParser {
  /** @internal */
  static _defaultName: String = "_GLTF_ENTITY_";

  parse(context: GLTFParserContext, index?: number): Promise<Entity[] | Entity> {
    const {
      glTF: { nodes },
      _cache
    } = context;

    if (!nodes) return Promise.resolve(null);

    const cacheKey = `${GLTFParserType.Entity}:${index}`;
    let promise: Promise<Entity[] | Entity> = _cache.get(cacheKey);

    if (!promise) {
      if (index === undefined) {
        promise = Promise.all(nodes.map((entityInfo, index) => this._parserSingleEntity(context, entityInfo, index)));
      } else {
        promise = this._parserSingleEntity(context, nodes[index], index);
      }

      _cache.set(cacheKey, promise);
    }

    return promise;
  }

  private _parserSingleEntity(context: GLTFParserContext, entityInfo: INode, index: number): Promise<Entity> {
    const { glTFResource } = context;

    const { engine } = glTFResource;
    const { matrix, translation, rotation, scale } = entityInfo;
    const entity = new Entity(engine, entityInfo.name || `${GLTFEntityParser._defaultName}${index}`);

    const { transform } = entity;
    if (matrix) {
      const localMatrix = transform.localMatrix;
      localMatrix.copyFromArray(matrix);
      transform.localMatrix = localMatrix;
    } else {
      if (translation) {
        transform.setPosition(translation[0], translation[1], translation[2]);
      }
      if (rotation) {
        transform.setRotationQuaternion(rotation[0], rotation[1], rotation[2], rotation[3]);
      }
      if (scale) {
        transform.setScale(scale[0], scale[1], scale[2]);
      }
    }

    return Promise.resolve(entity);
  }
}
