import { AnimationClip, Animation, WrapMode } from "@alipay/o3-animation";
import { Component, Node } from "@alipay/o3-core";

interface GLTFAsset {
  nodes: [Node];
  rootScene: { nodes: [Node] };
  animations: [AnimationClip];
}

/**
 * 暂时只为编辑器使用
 */
export class GLTFModel extends Component {
  get asset() {
    return this._asset;
  }

  set asset(value: GLTFAsset) {
    if (!this._hasBuiltNode) {
      (this.GLTFNode as any).clearChildren();
      if (value !== null) {
        value.rootScene.nodes.forEach((node) => {
          this.GLTFNode.addChild(node.clone());
        });
      }
    }
    this._asset = value;
  }

  get animator() {
    return this._animator;
  }

  set isAnimate(value: boolean) {
    if (this._asset && this._asset && this._asset.animations && this._asset.animations.length && value) {
      if (!this._animator) {
        const animations = this._asset.animations;
        // 加载动画
        this._animator = this.node.addComponent(Animation);
        animations.forEach((clip: AnimationClip) => {
          this._animator.addAnimationClip(clip, clip.name);
        });

        if (this._autoPlay) {
          this.autoPlay = this._autoPlay;
        }
      }
    } else {
      this._animator.destroy();
      this._animator = null;
    }
  }

  get autoPlay() {
    return this._autoPlay;
  }

  set autoPlay(value: string) {
    if (this._animator && value) {
      // 播放骨骼动画
      this._animator.playAnimationClip(value, {
        wrapMode: this._loop
      });
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

  private _asset: GLTFAsset;
  private GLTFNode: Node;
  private _loop: number;
  private _autoPlay: string;
  private _hasBuiltNode: boolean = false;

  constructor(node, props) {
    super(node, props);

    const { asset = null, isAnimate, autoPlay, loop, isClone } = props;
    if (isClone) {
      const rootName = (this._props as any).gltfRootName;
      if (rootName) {
        this.GLTFNode = this.node.findByName(rootName);
      }
    }
    if (!this.GLTFNode) {
      const rootName = `GLTF-${Date.now()}`;
      (this._props as any).gltfRootName = rootName;
      this.GLTFNode = this.node.createChild(rootName);
      this._hasBuiltNode = false;
    } else {
      this._hasBuiltNode = true;
    }

    this.asset = asset;
    this.isAnimate = isAnimate;
    this.loop = loop;
    this.autoPlay = autoPlay;

    this.addEventListener("enabled", () => {
      this.GLTFNode.isActive = true;
    });
    this.addEventListener("disabled", () => {
      this.GLTFNode.isActive = false;
    });
  }
}
