import { Skin } from "@oasis-engine/core";
import { Matrix } from "@oasis-engine/math";
import { GLTFResource } from "../GLTFResource";
import { getAccessorData } from "../Util";
import { EntityParser } from "./EntityParser";
import { Parser } from "./Parser";

export class SkinParser extends Parser {
  parse(context: GLTFResource): void {
    const { gltf, buffers } = context;
    const gltfSkins = gltf.skins;

    if (!gltfSkins) return;

    const gltfNodes = gltf.nodes;
    const skins: Skin[] = [];

    for (let i = 0; i < gltfSkins.length; i++) {
      const { inverseBindMatrices, skeleton, joints, name = `SKIN_${i}` } = gltfSkins[i];
      const jointCount = joints.length;

      const skin = new Skin(name);
      // parse IBM
      const accessor = gltf.accessors[inverseBindMatrices];
      const buffer = getAccessorData(gltf, accessor, buffers);
      const MAT4_LENGTH = 16;

      for (let i = 0; i < jointCount; i++) {
        const startIdx = MAT4_LENGTH * i;
        const endIdx = startIdx + MAT4_LENGTH;
        skin.inverseBindMatrices[i] = new Matrix(...buffer.subarray(startIdx, endIdx));
      }

      // get joints
      for (let i = 0; i < jointCount; i++) {
        skin.joints[i] = gltfNodes[joints[i]].name;
      }

      // get skeleton
      const skeletonIndex =
        skeleton ??
        (gltf.scenes ? (gltf.scenes[gltf.scene].nodes.length ? -1 : gltf.scenes[gltf.scene].nodes[0]) : joints[0]);
      if (skeletonIndex === -1) {
        skin.skeleton = "GLTF_ROOT";
      } else {
        skin.skeleton = gltfNodes[skeletonIndex].name || `${EntityParser._defaultName}${skeletonIndex}`;
      }

      skins[i] = skin;
    }

    context.skins = skins;
  }
}
