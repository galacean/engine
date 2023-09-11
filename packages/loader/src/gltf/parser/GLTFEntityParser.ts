import { Entity } from "@galacean/engine-core";
import { GLTFResource } from "../GLTFResource";
import { GLTFParser } from "./GLTFParser";
import { GLTFParserContext } from "./GLTFParserContext";

export class GLTFEntityParser extends GLTFParser {
  /** @internal */
  static _defaultName: String = "_GLTF_ENTITY_";

  parse(context: GLTFParserContext): void {
    const {
      glTFResource,
      glTF: { nodes }
    } = context;

    const { engine } = glTFResource;

    if (!nodes) return;

    const entities: Entity[] = [];

    for (let i = 0; i < nodes.length; i++) {
      const gltfNode = nodes[i];
      const { matrix, translation, rotation, scale } = gltfNode;
      const entity = new Entity(engine, gltfNode.name || `${GLTFEntityParser._defaultName}${i}`);

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

      entities[i] = entity;
    }

    glTFResource.entities = entities;
    this._buildEntityTree(context, glTFResource);
    this._createSceneRoots(context, glTFResource);
  }

  private _buildEntityTree(context: GLTFParserContext, glTFResource: GLTFResource): void {
    const {
      glTF: { nodes }
    } = context;
    const { entities } = glTFResource;

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

  private _createSceneRoots(context: GLTFParserContext, glTFResource: GLTFResource): void {
    const { scene: sceneID = 0, scenes } = context.glTF;
    const { engine, entities } = glTFResource;

    if (!scenes) return;

    const sceneRoots: Entity[] = [];

    for (let i = 0; i < scenes.length; i++) {
      const { nodes } = scenes[i];

      if (!nodes) continue;

      if (nodes.length === 1) {
        sceneRoots[i] = entities[nodes[0]];
      } else {
        const rootEntity = new Entity(engine, "GLTF_ROOT");
        for (let j = 0; j < nodes.length; j++) {
          rootEntity.addChild(entities[nodes[j]]);
        }
        sceneRoots[i] = rootEntity;
      }
      // @ts-ignore
      sceneRoots[i]._hookResource = glTFResource;
      // @ts-ignore
      glTFResource._addReferCount(1);
    }

    glTFResource.sceneRoots = sceneRoots;
    glTFResource.defaultSceneRoot = sceneRoots[sceneID];
  }
}
