import { Entity, Skin } from "@galacean/engine-core";
import { Matrix } from "@galacean/engine-math";
import { GLTFUtils } from "../GLTFUtils";
import { GLTFParser } from "./GLTFParser";
import { GLTFParserContext, GLTFParserType, registerGLTFParser } from "./GLTFParserContext";

@registerGLTFParser(GLTFParserType.Skin)
export class GLTFSkinParser extends GLTFParser {
  parse(context: GLTFParserContext, index: number): Promise<Skin> {
    const glTF = context.glTF;
    const skinInfo = glTF.skins[index];
    const { inverseBindMatrices, skeleton, joints, name = `SKIN_${index}` } = skinInfo;
    const jointCount = joints.length;

    const skin = new Skin(name);
    skin.inverseBindMatrices.length = jointCount;

    const bones = new Array<Entity>(jointCount);

    // parse IBM
    const accessor = glTF.accessors[inverseBindMatrices];
    const skinPromise = GLTFUtils.getAccessorBuffer(context, glTF.bufferViews, accessor).then((bufferInfo) => {
      const entities = context.get<Entity>(GLTFParserType.Entity);
      const buffer = bufferInfo.data;
      for (let i = 0; i < jointCount; i++) {
        const inverseBindMatrix = new Matrix();
        inverseBindMatrix.copyFromArray(buffer, i * 16);
        skin.inverseBindMatrices[i] = inverseBindMatrix;

        // Get bones
        const bone = entities[joints[i]];
        bones[i] = bone;
        skin.joints[i] = bone.name;

        // Get skeleton
        if (skeleton !== undefined) {
          const rootBone = entities[skeleton];
          skin.rootBone = rootBone;
        } else {
          const rootBone = this._findSkeletonRootBone(joints, entities);
          if (rootBone) {
            skin.rootBone = rootBone;
          } else {
            throw "Failed to find skeleton root bone.";
          }
        }
      }
      skin.bones = bones;
      return skin;
    });

    return Promise.resolve(skinPromise);
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
