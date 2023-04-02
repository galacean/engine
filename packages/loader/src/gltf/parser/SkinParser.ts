import { Entity, Skin } from "@oasis-engine/core";
import { Matrix } from "@oasis-engine/math";
import { GLTFUtil } from "../GLTFUtil";
import { Parser } from "./Parser";
import { ParserContext } from "./ParserContext";

export class SkinParser extends Parser {
  parse(context: ParserContext): void {
    const { glTFResource, gltf, buffers } = context;
    const { entities } = glTFResource;
    const gltfSkins = gltf.skins;

    if (!gltfSkins) return;

    const count = gltfSkins.length;
    const skins = new Array<Skin>(count);

    for (let i = 0; i < count; i++) {
      const { inverseBindMatrices, skeleton, joints, name = `SKIN_${i}` } = gltfSkins[i];
      const jointCount = joints.length;

      const skin = new Skin(name);
      skin.inverseBindMatrices.length = jointCount;

      // parse IBM
      const accessor = gltf.accessors[inverseBindMatrices];
      const buffer = GLTFUtil.getAccessorBuffer(context, gltf, accessor).data;
      for (let i = 0; i < jointCount; i++) {
        const inverseBindMatrix = new Matrix();
        inverseBindMatrix.copyFromArray(buffer, i * 16);
        skin.inverseBindMatrices[i] = inverseBindMatrix;
      }

      // get joints
      for (let i = 0; i < jointCount; i++) {
        skin.joints[i] = entities[joints[i]].name;
      }

      // get skeleton
      if (skeleton !== undefined) {
        skin.skeleton = entities[skeleton].name;
      } else {
        const rootBone = this._findSkeletonRootBone(joints, entities);
        if (rootBone) {
          skin.skeleton = rootBone.name;
        } else {
          throw "Failed to find skeleton root bone.";
        }
      }

      skins[i] = skin;
    }

    glTFResource.skins = skins;
  }

  private _findSkeletonRootBone(joints: number[], entities: Entity[]): Entity {
    const paths = <Record<number, Entity[]>>{};
    for (const index of joints) {
      const path = new Array<Entity>();
      let entity = entities[index];
      while (entity) {
        path.unshift(entity);
        entity = entity.parent;
      }
      paths[index] = path;
    }

    let rootNode = <Entity>null;
    for (let i = 0; ; i++) {
      let path = paths[joints[0]];
      if (i >= path.length) {
        return rootNode;
      }

      const entity = path[i];
      for (let j = 1, m = joints.length; j < m; j++) {
        path = paths[joints[j]];
        if (i >= path.length || entity !== path[i]) {
          return rootNode;
        }
      }

      rootNode = entity;
    }
  }
}
