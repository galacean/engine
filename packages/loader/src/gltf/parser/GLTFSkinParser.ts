import { AssetPromise, Entity, Skin } from "@galacean/engine-core";
import { Matrix } from "@galacean/engine-math";
import { GLTFParserContext } from ".";
import { GLTFUtils } from "../GLTFUtils";
import { GLTFParser } from "./GLTFParser";

export class GLTFSkinParser extends GLTFParser {
  parse(context: GLTFParserContext): AssetPromise<void> {
    const { glTFResource, glTF } = context;
    const { entities } = glTFResource;
    const glTFSkins = glTF.skins;

    if (!glTFSkins) return;

    const count = glTFSkins.length;
    const promises = new Array<Promise<Skin>>();

    for (let i = 0; i < count; i++) {
      const { inverseBindMatrices, skeleton, joints, name = `SKIN_${i}` } = glTFSkins[i];
      const jointCount = joints.length;

      const skin = new Skin(name);
      skin.inverseBindMatrices.length = jointCount;
      skin._bones.length = jointCount;

      // Parse IBM
      const accessor = glTF.accessors[inverseBindMatrices];
      const promise = GLTFUtils.getAccessorBuffer(context, glTF.bufferViews, accessor).then((bufferInfo) => {
        const buffer = bufferInfo.data;
        for (let i = 0; i < jointCount; i++) {
          const inverseBindMatrix = new Matrix();
          inverseBindMatrix.copyFromArray(buffer, i * 16);
          skin.inverseBindMatrices[i] = inverseBindMatrix;

          // Get bones
          const bone = entities[joints[i]];
          skin._bones[i] = bone;
          skin.joints[i] = bone.name;

          // Get skeleton
          if (skeleton !== undefined) {
            const rootBone = entities[skeleton];
            skin._rootBone = rootBone;
            skin.skeleton = rootBone.name;
          } else {
            const rootBone = this._findSkeletonRootBone(joints, entities);
            if (rootBone) {
              skin._rootBone = rootBone;
              skin.skeleton = rootBone.name;
            } else {
              throw "Failed to find skeleton root bone.";
            }
          }
        }
        return skin;
      });

      promises.push(promise);
    }

    return AssetPromise.all(promises).then((skins) => {
      glTFResource.skins = skins;
    });
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
