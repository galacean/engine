import { Entity, Skin } from "@galacean/engine-core";
import { Matrix } from "@galacean/engine-math";
import { ISkin } from "../GLTFSchema";
import { GLTFUtils } from "../GLTFUtils";
import { GLTFParser } from "./GLTFParser";
import { GLTFParserContext, GLTFParserType, registerGLTFParser } from "./GLTFParserContext";

@registerGLTFParser(GLTFParserType.Skin)
export class GLTFSkinParser extends GLTFParser {
  parse(context: GLTFParserContext, index?: number): Promise<Skin[] | Skin> {
    const {
      glTF: { skins },
      _cache
    } = context;

    if (!skins) return Promise.resolve(null);

    const cacheKey = `${GLTFParserType.Skin}:${index}`;
    let promise: Promise<Skin[] | Skin> = _cache.get(cacheKey);

    if (!promise) {
      if (index === undefined) {
        promise = Promise.all(skins.map((skinInfo, index) => this._parseSingleSkin(context, skinInfo, index)));
      } else {
        promise = this._parseSingleSkin(context, skins[index], index);
      }

      _cache.set(cacheKey, promise);
    }

    return promise;
  }

  private _parseSingleSkin(context: GLTFParserContext, skinInfo: ISkin, index: number): Promise<Skin> {
    const glTF = context.glTF;
    const { inverseBindMatrices, skeleton, joints, name = `SKIN_${index}` } = skinInfo;
    const jointCount = joints.length;

    const skin = new Skin(name);
    skin.inverseBindMatrices.length = jointCount;

    // parse IBM
    const accessor = glTF.accessors[inverseBindMatrices];
    const skinPromise = GLTFUtils.getAccessorBuffer(context, glTF.bufferViews, accessor).then((bufferInfo) => {
      return context.get<Entity[]>(GLTFParserType.Entity).then((entities) => {
        const buffer = bufferInfo.data;
        for (let i = 0; i < jointCount; i++) {
          const inverseBindMatrix = new Matrix();
          inverseBindMatrix.copyFromArray(buffer, i * 16);
          skin.inverseBindMatrices[i] = inverseBindMatrix;
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
        }
        return skin;
      });
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
