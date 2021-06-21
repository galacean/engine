import { Component, Entity, WrapMode, Animator } from "@oasis-engine/core";
import { GLTFResource } from "../gltf/GLTFResource";

/**
 * @deprecated
 * Temporarily only for editor use.
 * Remove when editor finish change from gltf to prefab.
 */
export class GLTFModel extends Component {
  get asset() {
    return this._asset;
  }

  set asset(value: GLTFResource) {
    const entity = this.glTFEntity;
    if (value && value.defaultSceneRoot === this.glTFEntity) {
      return;
    }
    if (!this._hasBuiltNode) {
      entity.clearChildren();
      if (value !== null) {
        entity?.destroy();
        const gltfEntity = value.defaultSceneRoot.clone();
        this._animator = gltfEntity.getComponent(Animation);
        this.entity.addChild(gltfEntity);
        gltfEntity.isActive = this.enabled;
        this.glTFEntity = gltfEntity;
      }
    }
    this._asset = value;
  }

  get animator() {
    return this._animator;
  }

  get autoPlay() {
    return this._autoPlay;
  }

  set autoPlay(value: string) {
    if (this._animator) {
      // Play bone animation.
      if (value) {
        this._animator.play(value);
        this._animator.speed = 1;
      } else {
        this._animator.speed = 0;
      }
    }
    this._autoPlay = value;
  }

  get loop() {
    return this._loop;
  }

  set loop(value: WrapMode) {
    if (this._animator && this.autoPlay) {
      // Play bone animation
      this._animator.play(this._autoPlay);
    }
    this._loop = value;
  }

  public _animator: Animator;
  public animationsNames: String[];

  private _asset: GLTFResource;
  private glTFEntity: Entity;
  private _loop: number;
  private _autoPlay: string;
  private _hasBuiltNode: boolean = false;

  constructor(entity) {
    super(entity);
  }

  /**
   * Init.
   * @param props - Init props
   */
  init(props): void {
    const { asset = null, autoPlay, loop, isClone } = props;
    if (isClone) {
      const rootName = (props as any).gltfRootName;
      if (rootName) {
        this.glTFEntity = this.entity.findByName(rootName);
      }
    }
    if (!this.glTFEntity) {
      const rootName = `GLTF-${Date.now()}`;
      (props as any).gltfRootName = rootName;
      this.glTFEntity = this.entity.createChild(rootName);
      this._hasBuiltNode = false;
    } else {
      this._hasBuiltNode = true;
    }

    this.asset = asset;
    this.loop = loop;
    this.autoPlay = autoPlay;
  }

  /**
   * @override
   */
  _onEnable(): void {
    this.glTFEntity && (this.glTFEntity.isActive = true);
  }

  /**
   * @override
   */
  _onDisable(): void {
    this.glTFEntity && (this.glTFEntity.isActive = false);
  }
}
