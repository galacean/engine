import { Entity } from "@galacean/engine-core";
import { GLTFParser } from "./GLTFParser";
import { GLTFParserContext, GLTFParserType, registerGLTFParser } from "./GLTFParserContext";

@registerGLTFParser(GLTFParserType.Entity)
export class GLTFEntityParser extends GLTFParser {
  parse(context: GLTFParserContext, index: number): Entity {
    const glTFResource = context.glTFResource;
    const entityInfo = context.glTF.nodes[index];
    const engine = glTFResource.engine;
    const { matrix, translation, rotation, scale, extensions } = entityInfo;
    const entity = new Entity(engine, entityInfo.name || `_GLTF_ENTITY_${index}`);
    // @ts-ignore
    entity._markAsTemplate(glTFResource);

    const { transform } = entity;
    if (this._isValidArray(matrix, 16)) {
      const localMatrix = transform.localMatrix;
      localMatrix.copyFromArray(matrix);
      transform.localMatrix = localMatrix;
    } else {
      if (this._isValidArray(translation, 3)) {
        transform.setPosition(translation[0], translation[1], translation[2]);
      }
      if (this._isValidArray(rotation, 4)) {
        transform.setRotationQuaternion(rotation[0], rotation[1], rotation[2], rotation[3]);
      }
      if (this._isValidArray(scale, 3)) {
        transform.setScale(scale[0], scale[1], scale[2]);
      }
    }

    const children = entityInfo.children;
    if (children) {
      for (let i = 0; i < children.length; i++) {
        const childIndex = children[i];
        const childEntity = context.get<Entity>(GLTFParserType.Entity, childIndex);
        entity.addChild(childEntity);
      }
    }

    GLTFParser.executeExtensionsAdditiveAndParse(extensions, context, entity, entityInfo);

    return entity;
  }

  private _isValidArray(v: ArrayLike<number>, l: number): boolean {
    if (!v || v.length < l) return false;
    for (let i = 0; i < l; i++) {
      if (!Number.isFinite(v[i])) return false;
    }
    return true;
  }
}
