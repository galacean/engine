import {
  MeshAttachment,
  RegionAttachment,
  AnimationState,
  AnimationStateData,
  AtlasAttachmentLoader,
  Physics,
  Skeleton,
  SkeletonBinary,
  SkeletonData,
  SkeletonJson,
  Skin,
  TextureAtlas
} from "@esotericsoftware/spine-core";
import { Texture2D } from "@galacean/engine";
import type { ISpineRuntime, ISpineGeometry, SpineCapability, ISpinePhysics } from "@galacean/engine-design";
import { SpineGenerator } from "./SpineGenerator";
import { SpineTexture } from "./SpineTexture";

/**
 * Spine 4.2 runtime backend.
 *
 * @remarks
 * Owns everything specific to the spine 4.2 runtime line: parsing (`SkeletonJson`/`SkeletonBinary`/
 * `TextureAtlas`), object-model construction, world-transform stepping (4.2's `Physics.update`), and
 * the attachment-reading mesh generator. Register an instance before loading assets of this version.
 */
export class Spine42Runtime implements ISpineRuntime<Texture2D> {
  readonly version = "4.2";

  private _generator = new SpineGenerator();

  getTextures(data: SkeletonData): Texture2D[] {
    const textures = new Set<Texture2D>();
    for (const skin of data.skins) {
      for (const { attachment } of skin.getAttachments()) {
        if (attachment instanceof RegionAttachment || attachment instanceof MeshAttachment) {
          const image = attachment.region?.texture?.getImage();
          if (image instanceof Texture2D) textures.add(image);
          for (const region of attachment.sequence?.regions ?? []) {
            const image = region?.texture?.getImage();
            if (image instanceof Texture2D) textures.add(image);
          }
        }
      }
    }
    return Array.from(textures);
  }

  getPhysics(skeleton: Skeleton): SpineCapability<ISpinePhysics> {
    return { supported: true, value: skeleton };
  }

  createSkin(name: string): Skin {
    return new Skin(name);
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

  buildGeometry(skeleton: Skeleton, target: ISpineGeometry<Texture2D>): void {
    this._generator.buildGeometry(skeleton, target);
  }
}
