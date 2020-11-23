import { Component, Entity, WrapMode, Animation } from "@oasis-engine/core";
import { GLTFResource } from "./gltf/glTF";

/**
 * @deprecated
 * 暂时只为编辑器使用
 * 待编辑器完成 gltf 变成 prefab 移除
 */
export class GLTFModel extends Component {
  get asset() {
    return this._asset;
  }

  set asset(value: GLTFResource) {
    if (value && value.defaultSceneRoot === this.GLTFNode) {
      return;
    }
    if (!this._hasBuiltNode) {
      (this.GLTFNode as any).clearChildren();
      if (value !== null) {
        if (this.GLTFNode) {
          this.GLTFNode.destroy();
        }
        this.GLTFNode = value.defaultSceneRoot.clone();
        this._animator = this.GLTFNode.getComponent(Animation);
        this.entity.addChild(this.GLTFNode);
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
      // 播放骨骼动画
      if (value) {
        this._animator.playAnimationClip(value, {
          wrapMode: this._loop
        });
      } else {
        this._animator.stop(false);
      }
    }
    this._autoPlay = value;
  }

  get loop() {
    return this._loop;
  }

  set loop(value: WrapMode) {
    if (this._animator && this.autoPlay) {
      // 播放骨骼动画
      this._animator.playAnimationClip(this._autoPlay, {
        wrapMode: value
      });
    }
    this._loop = value;
  }

  public _animator: Animation;
  public animationsNames: String[];

  private _asset: GLTFResource;
  private GLTFNode: Entity;
  private _loop: number;
  private _autoPlay: string;
  private _hasBuiltNode: boolean = false;

  constructor(entity) {
    super(entity);
  }

  /**
   * 初始化。
   * @param props - 初始化属性
   */
  init(props): void {
    const { asset = null, autoPlay, loop, isClone } = props;
    if (isClone) {
      const rootName = (props as any).gltfRootName;
      if (rootName) {
        this.GLTFNode = this.entity.findByName(rootName);
      }
    }
    if (!this.GLTFNode) {
      const rootName = `GLTF-${Date.now()}`;
      (props as any).gltfRootName = rootName;
      this.GLTFNode = this.entity.createChild(rootName);
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
    this.GLTFNode.isActive = true;
  }

  /**
   * @override
   */
  _onDisable(): void {
    this.GLTFNode.isActive = false;
  }
}
