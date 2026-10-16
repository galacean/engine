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
 * Texture and render-target types are supplied by the integration layer.
 */
export interface ISpineRuntime<TTexture, TRenderTarget> {
  /** Export major.minor supported by this backend. */
  readonly version: string;

  /** All textures referenced by attachments, including inactive skins and sequences. */
  getTextures(skeletonData: ISpineSkeletonData): TTexture[];

  /** Query once when an instance is created; no per-frame wrapper allocation. */
  getPhysics(skeleton: ISpineSkeleton): SpineCapability<ISpinePhysics>;

  /** Create an empty skin for composition using attachments from this resource. */
  createSkin(name: string): ISpineSkin;

  /** Build an atlas, binding the given engine textures to its pages (matched by page name). */
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

  /** Advance the animation state and apply it to the skeleton, then update world transforms. */
  updateState(skeleton: ISpineSkeleton, state: ISpineAnimationState, delta: number): void;

  /** Build the renderable primitive for the current skeleton pose into the given target. */
  buildPrimitive(skeleton: ISpineSkeleton, target: TRenderTarget): void;
}
