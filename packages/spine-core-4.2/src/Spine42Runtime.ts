import {
  AnimationState,
  AnimationStateData,
  AtlasAttachmentLoader,
  Physics,
  Skeleton,
  SkeletonBinary,
  SkeletonData,
  SkeletonJson,
  TextureAtlas
} from "@esotericsoftware/spine-core";
import type { Texture2D } from "@galacean/engine";
import type { ISpineRenderTarget, ISpineRuntime } from "@galacean/engine-spine";
import { SpineGenerator } from "./SpineGenerator";
import { SpineTexture } from "./SpineTexture";

/**
 * Spine 4.2 runtime backend.
 *
 * @remarks
 * Owns everything specific to the spine 4.2 runtime line: parsing (`SkeletonJson`/`SkeletonBinary`/
 * `TextureAtlas`), object-model construction, world-transform stepping (4.2's `Physics.update`), and
 * the attachment-reading mesh generator. Registered automatically when this package is imported.
 */
export class Spine42Runtime implements ISpineRuntime {
  private _generator = new SpineGenerator();

  parseAtlasPageNames(atlasText: string): string[] {
    return new TextureAtlas(atlasText).pages.map((page) => page.name);
  }

  createTextureAtlas(atlasText: string, textures: Texture2D[]): TextureAtlas {
    const textureAtlas = new TextureAtlas(atlasText);
    textureAtlas.pages.forEach((page, index) => {
      const engineTexture = textures.find((item) => item.name === page.name) || textures[index];
      const texture = new SpineTexture(engineTexture);
      page.setTexture(texture);
    });
    return textureAtlas;
  }

  createSkeletonData(
    skeletonRawData: string | ArrayBuffer,
    textureAtlas: TextureAtlas,
    skeletonDataScale: number
  ): SkeletonData {
    const atlasLoader = new AtlasAttachmentLoader(textureAtlas);
    if (typeof skeletonRawData === "string") {
      const skeletonJson = new SkeletonJson(atlasLoader);
      skeletonJson.scale = skeletonDataScale;
      return skeletonJson.readSkeletonData(skeletonRawData);
    } else {
      const skeletonBinary = new SkeletonBinary(atlasLoader);
      skeletonBinary.scale = skeletonDataScale;
      return skeletonBinary.readSkeletonData(new Uint8Array(skeletonRawData as ArrayBuffer));
    }
  }

  createAnimationStateData(skeletonData: SkeletonData): AnimationStateData {
    return new AnimationStateData(skeletonData);
  }

  createSkeleton(skeletonData: SkeletonData): Skeleton {
    return new Skeleton(skeletonData);
  }

  createAnimationState(stateData: AnimationStateData): AnimationState {
    return new AnimationState(stateData);
  }

  updateState(skeleton: Skeleton, state: AnimationState, delta: number): void {
    state.update(delta);
    state.apply(skeleton);
    skeleton.update(delta);
    skeleton.updateWorldTransform(Physics.update);
  }

  buildPrimitive(skeleton: Skeleton, target: ISpineRenderTarget): void {
    this._generator.buildPrimitive(skeleton, target);
  }
}
