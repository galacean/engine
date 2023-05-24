import { Entity, Skin } from "@galacean/engine-core";
import { Matrix } from "@galacean/engine-math";
import { GLTFParserContext } from ".";
import { GLTFUtils } from "../GLTFUtils";
import { GLTFParser } from "./GLTFParser";

export class GLTFSkinParser extends GLTFParser {
  parse(context: GLTFParserContext): void {
    const { glTFResource, glTF, buffers } = context;
    const { entities } = glTFResource;
    const gltfSkins = glTF.skins;

    if (!gltfSkins) return;

    const count = gltfSkins.length;
    const skins = new Array<Skin>(count);

    for (let i = 0; i < count; i++) {
      const { inverseBindMatrices, skeleton, joints, name = `SKIN_${i}` } = gltfSkins[i];
      const jointCount = joints.length;

      const skin = new Skin(name);
      skin.inverseBindMatrices.length = jointCount;

      // parse IBM
      const accessor = glTF.accessors[inverseBindMatrices];
      const buffer = GLTFUtils.getAccessorBuffer(context, glTF.bufferViews, accessor).data;
      for (let i = 0; i < jointCount; i++) {
        const inverseBindMatrix = new Matrix();
        inverseBindMatrix.copyFromArray(buffer, i * 16);
        skin.inverseBindMatrices[i] = inverseBindMatrix;
      }

      // get joints
      for (let i = 0; i < jointCount; i++) {
        const jointIndex = joints[i];
        const jointName = entities[jointIndex].name;
        skin.joints[i] = jointName;
        // @todo Temporary solution, but it can alleviate the current BUG, and the skinning data mechanism of SkinnedMeshRenderer will be completely refactored in the future
        for (let j = entities.length - 1; j >= 0; j--) {
          if (jointIndex !== j && entities[j].name === jointName) {
            entities[j].name = `${jointName}_${j}`;
          }
        }
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
