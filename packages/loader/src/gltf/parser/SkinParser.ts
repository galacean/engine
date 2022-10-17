import { Skin } from "@oasis-engine/core";
import { Matrix } from "@oasis-engine/math";
import { GLTFUtil } from "../GLTFUtil";
import { Parser } from "./Parser";
import { ParserContext } from "./ParserContext";

export class SkinParser extends Parser {
  parse(context: ParserContext): void {
    const glTFResource = context.glTFResource;
    const { gltf, buffers, entities, defaultSceneRoot } = glTFResource;
    const gltfSkins = gltf.skins;

    if (!gltfSkins) return;

    const skins: Skin[] = [];

    for (let i = 0; i < gltfSkins.length; i++) {
      const { inverseBindMatrices, skeleton, joints, name = `SKIN_${i}` } = gltfSkins[i];
      const jointCount = joints.length;

      const skin = new Skin(name);
      skin.inverseBindMatrices.length = jointCount;

      // parse IBM
      const accessor = gltf.accessors[inverseBindMatrices];
      const buffer = GLTFUtil.getAccessorData(gltf, accessor, buffers);
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
        skin.skeleton = defaultSceneRoot.name;
      }

      skins[i] = skin;
    }

    glTFResource.skins = skins;
  }
}
