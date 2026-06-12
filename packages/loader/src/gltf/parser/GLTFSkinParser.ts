import { AssetPromise, Entity, Skin } from "@galacean/engine-core";
import { Matrix } from "@galacean/engine-math";
import { GLTFUtils } from "../GLTFUtils";
import { GLTFParser } from "./GLTFParser";
import { GLTFParserContext, GLTFParserType, registerGLTFParser } from "./GLTFParserContext";

@registerGLTFParser(GLTFParserType.Skin)
export class GLTFSkinParser extends GLTFParser {
  parse(context: GLTFParserContext, index: number): AssetPromise<Skin> {
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
      }
      skin.bones = bones;

      // Respect explicit skeleton root. If missing, infer only from the joint
      // hierarchy; mesh nodes using the skin are owners, not skeleton roots
      if (skeleton !== undefined) {
        const rootBone = entities[skeleton];
        if (!rootBone) {
          throw `Skin skeleton index ${skeleton} is out of range.`;
        }
        skin.rootBone = rootBone;
      } else {
        const rootBone = this._findSkinRootBoneByLCA(joints, entities);
        if (rootBone) {
          skin.rootBone = rootBone;
        } else {
          throw "Failed to find skeleton root bone.";
        }
      }

      return skin;
    });

    return AssetPromise.resolve(skinPromise);
  }

  /** Resolves missing skin.skeleton from the joints' lowest common ancestor. */
  private _findSkinRootBoneByLCA(joints: number[], entities: Entity[]): Entity | null {
    const paths = joints.map((index) => {
      const path = new Array<Entity>();
      let entity = entities[index];
      while (entity) {
        path.unshift(entity);
        entity = entity.parent;
      }
      return path;
    });

    let rootNode: Entity | null = null;
    for (let i = 0; ; i++) {
      let path = paths[0];
      if (i >= path.length) {
        return rootNode;
      }

      const entity = path[i];
      for (let j = 1, m = paths.length; j < m; j++) {
        path = paths[j];
        if (i >= path.length || entity !== path[i]) {
          return rootNode;
        }
      }

      rootNode = entity;
    }
  }
}
