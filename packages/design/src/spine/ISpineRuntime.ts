import type { ISpineGeometry } from "./ISpineGeometry";
import type { ISpineSkin } from "./ISpineSkin";
import type { ISpineSkeletonData } from "./ISpineSkeletonData";
import type { ISpineSkeleton } from "./ISpineSkeleton";
import type { ISpineAnimationStateData } from "./ISpineAnimationStateData";
import type { ISpineAnimationState } from "./ISpineAnimationState";
import type { SpineCapability } from "./SpineCapability";
import type { ISpinePhysics } from "./ISpinePhysics";
import type { ISpineTextureAtlas } from "./ISpineTextureAtlas";

/**
 * The version-specific spine runtime backend.
 *
 * @remarks
 * Parses assets, creates animation objects, updates poses and builds geometry for one Spine version.
 * The texture type is supplied by the integration layer.
 */
export interface ISpineRuntime<TTexture> {
  /** Export major.minor supported by this backend. */
  readonly version: string;

  /** All textures referenced by attachments, including inactive skins and sequences. */
  getTextures(skeletonData: ISpineSkeletonData): TTexture[];

  /** Query once when an instance is created; no per-frame wrapper allocation. */
  getPhysics(skeleton: ISpineSkeleton): SpineCapability<ISpinePhysics>;

  /** Create an empty skin for composition using attachments from this resource. */
  createSkin(name: string): ISpineSkin;

  /**
   * Build an atlas from canonical straight-alpha textures in atlas page order.
   * The shared loader resolves page names and validates straight-alpha input before calling the backend.
   */
  createTextureAtlas(atlasText: string, textures: TTexture[]): ISpineTextureAtlas;

  /** Parse skeleton data (json or binary) against an atlas. */
  createSkeletonData(
    skeletonRawData: string | ArrayBuffer,
    textureAtlas: ISpineTextureAtlas,
    skeletonDataScale: number
  ): ISpineSkeletonData;

  /** Create the shared animation state data for a skeleton data. */
  createAnimationStateData(skeletonData: ISpineSkeletonData): ISpineAnimationStateData;

  /** Create a skeleton instance. */
  createSkeleton(skeletonData: ISpineSkeletonData): ISpineSkeleton;

  /** Create an animation state instance. */
  createAnimationState(stateData: ISpineAnimationStateData): ISpineAnimationState;

  /** Finish a playback command before dispatching its events. Nested calls preserve the current dispatch. */
  batchAnimationStateEvents<T>(state: ISpineAnimationState, command: () => T): T;

  /** Advance animation and skeleton time without applying the animation or solving the pose. */
  advanceState(skeleton: ISpineSkeleton, state: ISpineAnimationState, delta: number): void;

  /** Apply the current animation to the skeleton's local pose. */
  applyState(skeleton: ISpineSkeleton, state: ISpineAnimationState): void;

  /**
   * Solve bone world transforms and constraints. When advancePhysics is false, apply the existing
   * physics pose without advancing the simulation; this permits world-space-driven pose edits.
   */
  updateWorldTransform(skeleton: ISpineSkeleton, advancePhysics: boolean): void;

  /** Write CPU geometry for the current pose. GPU resources remain owned by the shared renderer. */
  buildGeometry(skeleton: ISpineSkeleton, target: ISpineGeometry<TTexture>): void;
}
