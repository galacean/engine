import { Matrix } from "@galacean/engine-math";
import { Entity } from "../Entity";
import { UpdateFlagManager } from "../UpdateFlagManager";
import { Utils } from "../Utils";
import { EngineObject } from "../base/EngineObject";
import { SkinnedMeshRenderer } from "./SkinnedMeshRenderer";

/**
 * Skin used for skinned mesh renderer.
 */
export class Skin extends EngineObject {
  /** Inverse bind matrices. */
  inverseBindMatrices = new Array<Matrix>();

  /** @internal */
  _skinMatrices: Float32Array;
  /** @internal */
  _updatedManager = new UpdateFlagManager();

  private _rootBone: Entity;
  private _bones = new Array<Entity>();
  private _updateMark = -1;

  _cloneMap: Record<number, Skin> = {};

  /**
   * Root bone.
   */
  get rootBone(): Entity {
    return this._rootBone;
  }

  set rootBone(value: Entity) {
    if (this._rootBone !== value) {
      this._updatedManager.dispatch(SkinUpdateFlag.RootBoneChanged, value);
      this._rootBone = value;
    }
  }

  /**
   * Bones used for skin.
   */
  get bones(): ReadonlyArray<Entity> {
    return this._bones;
  }

  set bones(value: ReadonlyArray<Entity>) {
    const bones = this._bones;
    const boneCount = value?.length ?? 0;
    const lastBoneCount = bones.length;

    bones.length = boneCount;
    for (let i = 0; i < boneCount; i++) {
      bones[i] = value[i];
    }

    if (lastBoneCount !== boneCount) {
      this._skinMatrices = new Float32Array(boneCount * 16);
      this._updatedManager.dispatch(SkinUpdateFlag.BoneCountChanged, boneCount);
    }
  }

  constructor(public name: string) {
    super(null);
  }

  updateJointMatrices(renderer: SkinnedMeshRenderer) {
    if (this._updateMark === renderer.engine.time.frameCount) {
      // console.log("skip:_" + renderer.engine.time.frameCount);
      return;
    }
    // console.log("compute:_" + renderer.engine.time.frameCount);
    const bones = this.bones;
    // @todo: can optimize when share skin
    const skinMatrices = this._skinMatrices;
    const bindMatrices = this.inverseBindMatrices;
    const worldToLocal = (this.rootBone ?? renderer.entity).getInvModelMatrix();
    for (let i = bones.length - 1; i >= 0; i--) {
      const bone = bones[i];
      const offset = i * 16;
      if (bone) {
        Utils._floatMatrixMultiply(bone.transform.worldMatrix, bindMatrices[i].elements, 0, skinMatrices, offset);
      } else {
        skinMatrices.set(bindMatrices[i].elements, offset);
      }
      Utils._floatMatrixMultiply(worldToLocal, skinMatrices, offset, skinMatrices, offset);
    }

    this._updateMark = renderer.engine.time.frameCount;
  }

  /** @deprecated Please use `bones` instead. */
  public joints: string[] = [];

  /** @deprecated Please use `rootBone` instead. */
  get skeleton(): string {
    return this.rootBone.name;
  }

  set skeleton(value: string) {
    this.rootBone.name = value;
  }
}

export enum SkinUpdateFlag {
  BoneCountChanged = 0,
  RootBoneChanged = 1
}
