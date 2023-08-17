import { Entity } from "@galacean/engine-core";
import { INode } from "../GLTFSchema";
import { GLTFParser } from "./GLTFParser";
import { GLTFParserContext, GLTFParserType, registerGLTFParser } from "./GLTFParserContext";

@registerGLTFParser(GLTFParserType.Entity)
export class GLTFEntityParser extends GLTFParser {
  /** @internal */
  static _defaultName: String = "_GLTF_ENTITY_";

  parse(context: GLTFParserContext, index?: number): Promise<Entity[] | Entity> {
    const nodes = context.glTF.nodes;

    if (!nodes) return Promise.resolve(null);

    if (index === undefined) {
      return Promise.all(nodes.map((entityInfo, index) => this._parserSingleEntity(context, entityInfo, index))).then(
        (entities) => {
          this._buildEntityTree(context, entities);
          this._createSceneRoots(context, entities);

          return entities;
        }
      );
    } else {
      return this._parserSingleEntity(context, nodes[index], index);
    }
  }

  private _parserSingleEntity(context: GLTFParserContext, entityInfo: INode, index: number): Promise<Entity> {
    const engine = context.glTFResource.engine;
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

  private _buildEntityTree(context: GLTFParserContext, entities: Entity[]): void {
    const nodes = context.glTF.nodes;

    for (let i = 0; i < nodes.length; i++) {
      const { children } = nodes[i];
      const entity = entities[i];

      if (children) {
        for (let j = 0; j < children.length; j++) {
          const childEntity = entities[children[j]];

          entity.addChild(childEntity);
        }
      }
    }
  }

  private _createSceneRoots(context: GLTFParserContext, entities: Entity[]): void {
    const { glTFResource, glTF } = context;
    const { scene: sceneID = 0, scenes } = glTF;

    if (!scenes) return;

    const sceneRoots: Entity[] = [];

    for (let i = 0; i < scenes.length; i++) {
      const { nodes } = scenes[i];

      if (!nodes) continue;

      if (nodes.length === 1) {
        sceneRoots[i] = entities[nodes[0]];
      } else {
        const rootEntity = new Entity(glTFResource.engine, "GLTF_ROOT");
        for (let j = 0; j < nodes.length; j++) {
          rootEntity.addChild(entities[nodes[j]]);
        }
        sceneRoots[i] = rootEntity;
      }
    }

    glTFResource.sceneRoots = sceneRoots;
    glTFResource.defaultSceneRoot = sceneRoots[sceneID];
    // @ts-ignore
    glTFResource.defaultSceneRoot._hookResource = glTFResource;
    // @ts-ignore
    glTFResource._addReferCount(1);
  }
}
