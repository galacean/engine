import {
  MeshAttachment,
  RegionAttachment,
  AnimationState,
  AnimationStateData,
  AtlasAttachmentLoader,
  Skeleton,
  SkeletonBinary,
  SkeletonData,
  SkeletonJson,
  Skin,
  TextureAtlas,
  TextureAtlasRegion
} from "./spine-core";
import { Texture2D } from "@galacean/engine";
import type { ISpineRuntime, ISpineGeometry, SpineCapability, ISpinePhysics } from "@galacean/engine-design";
import { SpineGenerator } from "./SpineGenerator";
import { SpineTexture } from "./SpineTexture";

/**
 * Spine 3.8 runtime backend.
 *
 * @remarks
 * Owns everything specific to the spine 3.8 runtime line: parsing (`SkeletonJson`/`SkeletonBinary`/
 * `TextureAtlas`), object-model construction, world-transform stepping (3.8 has no `Physics` argument),
 * and the attachment-reading mesh generator. Register an instance before loading assets of this version.
 *
 */
export class Spine38Runtime implements ISpineRuntime<Texture2D> {
  readonly version = "3.8";

  private _generator = new SpineGenerator();

  getTextures(data: SkeletonData): Texture2D[] {
    const textures = new Set<Texture2D>();
    for (const skin of data.skins) {
      for (const { attachment } of skin.getAttachments()) {
        if (attachment instanceof RegionAttachment || attachment instanceof MeshAttachment) {
          const region = attachment.region;
          const image = region instanceof TextureAtlasRegion ? region.texture?.texture : null;
          if (image instanceof Texture2D) textures.add(image);
        }
      }
    }
    return Array.from(textures);
  }

  getPhysics(skeleton: Skeleton): SpineCapability<ISpinePhysics> {
    return { supported: false, reason: "Spine 3.8 does not support physics constraints." };
  }

  createSkin(name: string): Skin {
    return new Skin(name);
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

  buildGeometry(skeleton: Skeleton, target: ISpineGeometry<Texture2D>): void {
    this._generator.buildGeometry(skeleton, target);
  }
}
