import { Entity } from "@oasis-engine/core";
import { Matrix, Quaternion, Vector3 } from "@oasis-engine/math";
import { GLTFResource } from "../GLTFResource";
import { Parser } from "./Parser";

export class EntityParser extends Parser {
  /** @internal */
  static _defaultName: String = "_GLTF_ENTITY_";

  parse(context: GLTFResource): void {
    const {
      engine,
      gltf: { nodes }
    } = context;
    if (!nodes) return;

    const entities: Entity[] = [];

    for (let i = 0; i < nodes.length; i++) {
      const gltfNode = nodes[i];
      const { matrix, translation, rotation, scale } = gltfNode;
      const entity = new Entity(engine, gltfNode.name || `${EntityParser._defaultName}${i}`);

      const { transform } = entity;
      if (matrix) {
        const localMatrix = transform.localMatrix;
        localMatrix.setValueByArray(matrix);
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

    context.entities = entities;
    this._buildEntityTree(context);
    this._createSceneRoots(context);
  }

  private _buildEntityTree(context: GLTFResource): void {
    const {
      gltf: { nodes },
      entities
    } = context;

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

  private _createSceneRoots(context: GLTFResource): void {
    const {
      engine,
      gltf: { scene: sceneID = 0, scenes },
      entities
    } = context;

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
    }
    
    context.sceneRoots = sceneRoots;
    context.defaultSceneRoot = sceneRoots[sceneID];
  }
}
