import { Entity } from "@oasis-engine/core";
import { Matrix, Quaternion, Vector3 } from "@oasis-engine/math";
import { GLTFResource } from "../GLTFResource";
import { Parser } from "./Parser";

export class EntityParser extends Parser {
  private static _nodeCount = 0;
  private static _position = new Vector3();
  private static _scale = new Vector3(1, 1, 1);
  private static _rotation = new Quaternion();

  parse(context: GLTFResource): void {
    const {
      engine,
      gltf: { nodes }
    } = context;
    if (!nodes) return;

    const entities = [];

    for (let i = 0; i < nodes.length; i++) {
      const gltfNode = nodes[i];
      const { matrix, translation, rotation, scale } = gltfNode;
      const entity = new Entity(engine, gltfNode.name || `GLTF_NODE_${EntityParser._nodeCount++}`);

      if (matrix) {
        const mat = new Matrix();
        mat.setValueByArray(matrix);
        mat.decompose(EntityParser._position, EntityParser._rotation, EntityParser._scale);

        entity.transform.position = EntityParser._position;
        entity.transform.rotationQuaternion = EntityParser._rotation;
        entity.transform.scale = EntityParser._scale;
      } else {
        if (translation) {
          // @ts-ignore
          entity.transform.setPosition(...translation);
        }
        if (rotation) {
          // @ts-ignore
          entity.transform.setRotationQuaternion(...rotation);
        }
        if (scale) {
          // @ts-ignore
          entity.transform.setScale(...scale);
        }
      }

      entities[i] = entity;
    }

    context.entities = entities;
    this._buildEntityTree(context);
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
}
