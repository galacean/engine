import type {
  AnimationState,
  AnimationStateData,
  Skeleton,
  SkeletonData,
  TextureAtlas
} from "@esotericsoftware/spine-core";
import type { Texture2D } from "@galacean/engine";
import type { ISpineRenderTarget } from "./ISpineRenderTarget";

/**
 * The version-specific spine runtime backend.
 *
 * @remarks
 * The engine-spine analogue of `IPhysics`: a narrow factory + stepping interface that a spine core
 * package (e.g. `@galacean/engine-spine-core-4.2`) implements and registers via {@link registerSpineRuntime}.
 * It owns everything that differs between spine runtime versions — parsing, object-model construction,
 * world-transform stepping (e.g. spine 4.2's `Physics` argument), and the attachment-reading mesh
 * generator — so the shared renderer/loader never reference a concrete spine-core version at runtime.
 *
 * The spine-core types in these signatures are the 4.2 line, used as the canonical type contract; a
 * 3.8 backend returns structurally-3.8 objects typed against the same contract.
 */
export interface ISpineRuntime {
  /** Parse the page names declared in an atlas text, used to resolve which page textures to load. */
  parseAtlasPageNames(atlasText: string): string[];

  /** Build a `TextureAtlas`, binding the given engine textures to its pages (matched by page name). */
  createTextureAtlas(atlasText: string, textures: Texture2D[]): TextureAtlas;

  /** Parse skeleton data (json or binary) against an atlas. */
  createSkeletonData(
    skeletonRawData: string | ArrayBuffer,
    textureAtlas: TextureAtlas,
    skeletonDataScale: number
  ): SkeletonData;

  /** Create the shared animation state data for a skeleton data. */
  createAnimationStateData(skeletonData: SkeletonData): AnimationStateData;

  /** Create a skeleton instance. */
  createSkeleton(skeletonData: SkeletonData): Skeleton;

  /** Create an animation state instance. */
  createAnimationState(stateData: AnimationStateData): AnimationState;

  /** Advance the animation state and apply it to the skeleton, then update world transforms. */
  updateState(skeleton: Skeleton, state: AnimationState, delta: number): void;

  /** Build the renderable primitive for the current skeleton pose into the given target. */
  buildPrimitive(skeleton: Skeleton, target: ISpineRenderTarget): void;
}
