import {
  AnimationState,
  AnimationStateData,
  AtlasAttachmentLoader,
  Skeleton,
  SkeletonBinary,
  SkeletonData,
  SkeletonJson,
  TextureAtlas
} from "./spine-core";
import type { Texture2D } from "@galacean/engine";
import type { ISpineRenderTarget } from "@galacean/engine-spine";
import { SpineGenerator } from "./SpineGenerator";
import { SpineTexture } from "./SpineTexture";

/**
 * Spine 3.8 runtime backend.
 *
 * @remarks
 * Owns everything specific to the spine 3.8 runtime line: parsing (`SkeletonJson`/`SkeletonBinary`/
 * `TextureAtlas`), object-model construction, world-transform stepping (3.8 has no `Physics` argument),
 * and the attachment-reading mesh generator. Registered automatically when this package is imported.
 *
 * Deliberately does not `implements ISpineRuntime`: that interface types its methods against the
 * 4.2 npm package as the "canonical contract", but 4.2 and 3.8 have actually diverged enough
 * (4.2 added `TextureAtlas.setTextures`; 4.2 dropped `Skeleton`/`SkeletonData`'s `updateCacheReset`/
 * `findBoneIndex`/`findSlotIndex`/`findPathConstraintIndex`, all present in 3.8) that TS's structural
 * check fails even though every member `ISpineRuntime` actually calls lines up. Registered via a cast
 * in `index.ts` instead of fighting the type checker method-by-method.
 */
export class Spine38Runtime {
  private _generator = new SpineGenerator();

  parseAtlasPageNames(atlasText: string): string[] {
    // Unlike 4.2, spine 3.8's `TextureAtlas` constructor requires a synchronous texture loader and
    // calls `setFilters`/`setWraps` on whatever it returns immediately during parsing, so a bare
    // `null` loader would throw; hand back a no-op stub instead (its return type is `any`).
    const pageNames: string[] = [];
    new TextureAtlas(atlasText, (path) => {
      pageNames.push(path);
      return { setFilters() {}, setWraps() {} };
    });
    return pageNames;
  }

  createTextureAtlas(atlasText: string, textures: Texture2D[]): TextureAtlas {
    let index = 0;
    return new TextureAtlas(atlasText, (path) => {
      const engineTexture = textures.find((item) => item.name === path) || textures[index];
      index++;
      return new SpineTexture(engineTexture);
    });
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
    skeleton.updateWorldTransform();
  }

  buildPrimitive(skeleton: Skeleton, target: ISpineRenderTarget): void {
    this._generator.buildPrimitive(skeleton, target);
  }
}
