import type { ISpineSkeletonData } from "@galacean/engine-design";
import { SpineSkeletonData } from "../SpineSkeletonData";
import { SpineAnimationStateData } from "../SpineAnimationStateData";
import type { SpineSkin } from "../SpineSkin";
import type { ISpineRuntime } from "../runtime/ISpineRuntime";
import { Engine, Entity, ReferResource, Texture2D } from "@galacean/engine";
import { SpineAnimationRenderer } from "../renderer/SpineAnimationRenderer";

/**
 * Represents a resource that manages Spine animation data, textures, and entity templates for the Galacean engine.
 *
 */
export class SpineResource extends ReferResource {
  /** The url of spine resource. */
  readonly url: string;

  private _texturesInSpineAtlas: Texture2D[] = [];
  private _skeletonData: SpineSkeletonData;
  private _stateData: SpineAnimationStateData;

  private _template: Entity;

  /** @internal */
  readonly _runtime: ISpineRuntime;

  private constructor(engine: Engine, runtime: ISpineRuntime, skeletonData: ISpineSkeletonData, url?: string) {
    super(engine);
    this._runtime = runtime;
    this.url = url;
    this._skeletonData = SpineSkeletonData._create(skeletonData);
    this._stateData = SpineAnimationStateData._create(
      this._runtime.createAnimationStateData(skeletonData),
      this._skeletonData
    );
    this._associationTextureInSkeletonData(skeletonData);
    this._createTemplate();
  }

  /** @internal */
  static _create(
    engine: Engine,
    runtime: ISpineRuntime,
    skeletonData: ISpineSkeletonData,
    url?: string
  ): SpineResource {
    return new SpineResource(engine, runtime, skeletonData, url);
  }

  /**
   * The skeleton data associated with this Spine resource.
   */
  get skeletonData(): SpineSkeletonData {
    return this._skeletonData;
  }

  /**
   * The animation state data associated with this Spine resource.
   */
  get stateData(): SpineAnimationStateData {
    return this._stateData;
  }

  /**
   * Create an empty skin for composing skins/attachments from this resource.
   * The returned skin can be assigned to one or more instances of this resource.
   */
  createSkin(name: string): SpineSkin {
    return this._skeletonData._wrapSkin(this._runtime.createSkin(name));
  }

  /** Creates an independent pose and playback state using this resource's shared data. */
  instantiate(): Entity {
    return this._template.clone();
  }

  protected override _onDestroy(): void {
    super._onDestroy();
    this._template?.destroy();
    this._template = null;
    this._disassociateTextures();
    this._skeletonData = null;
    this._stateData = null;
  }

  private _createTemplate(): void {
    const name = this._extractFileName(this.url);
    const spineEntity = new Entity(this.engine, name);
    const spineAnimationRenderer = spineEntity.addComponent(SpineAnimationRenderer);
    const runtime = this._runtime;
    const skeleton = runtime.createSkeleton(this._skeletonData._native);
    const state = runtime.createAnimationState(this._stateData._native);
    spineAnimationRenderer._setRuntime(runtime);
    spineAnimationRenderer._setSkeleton(skeleton, this._skeletonData);
    spineAnimationRenderer._setState(state, this._stateData);
    spineEntity._markAsTemplate(this);
    this._template = spineEntity;
  }

  private _associationTextureInSkeletonData(skeletonData: ISpineSkeletonData): void {
    const textures = (this._texturesInSpineAtlas = this._runtime.getTextures(skeletonData));
    for (const texture of textures) {
      texture._associationSuperResource(this);
    }
  }

  private _disassociateTextures(): void {
    const textures = this._texturesInSpineAtlas;
    for (let i = 0, n = textures.length; i < n; i++) {
      textures[i]._disassociationSuperResource(this);
    }
    textures.length = 0;
  }

  private _extractFileName(url: string): string {
    if (!url) return "Spine Entity";
    const match = url.match(/\/([^\/]+?)(\.[^\/]*)?$/);
    return match ? match[1] : "Spine Entity";
  }
}
