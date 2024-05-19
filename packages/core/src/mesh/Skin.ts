import { Matrix } from "@galacean/engine-math";
import { Entity } from "../Entity";
import { UpdateFlagManager } from "../UpdateFlagManager";
import { Utils } from "../Utils";
import { EngineObject } from "../base/EngineObject";
import { deepClone, ignoreClone } from "../clone/CloneManager";
import { IComponentCustomClone } from "../clone/ComponentCloner";
import { SkinnedMeshRenderer } from "./SkinnedMeshRenderer";

/**
 * Skin used for skinned mesh renderer.
 */
export class Skin extends EngineObject implements IComponentCustomClone {
  /** Inverse bind matrices. */
  @deepClone
  inverseBindMatrices = new Array<Matrix>();

  /** @internal */
  @ignoreClone
  _skinMatrices: Float32Array;
  /** @internal */
  @ignoreClone
  _updatedManager = new UpdateFlagManager();

  @ignoreClone
  private _rootBone: Entity;
  @ignoreClone
  private _bones = new Array<Entity>();
  @ignoreClone
  private _updateMark = -1;

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

  /**
   * @internal
   */
  _cloneTo(target: Skin, srcRoot: Entity, targetRoot: Entity): void {
    const paths = new Array<number>();

    // Clone rootBone
    const rootBone = this.rootBone;
    if (rootBone) {
      const success = Entity._getEntityHierarchyPath(srcRoot, rootBone, paths);
      target.rootBone = success ? Entity._getEntityByHierarchyPath(targetRoot, paths) : rootBone;
    }

    // Clone bones
    const bones = this.bones;
    if (bones.length > 0) {
      const boneCount = bones.length;
      const destBones = new Array<Entity>(boneCount);
      for (let i = 0; i < boneCount; i++) {
        const bone = bones[i];
        const success = Entity._getEntityHierarchyPath(srcRoot, bone, paths);
        destBones[i] = success ? Entity._getEntityByHierarchyPath(targetRoot, paths) : bone;
      }
      target.bones = destBones;
    }
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
