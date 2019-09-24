import { NodeAbility, Node, AAnimation, AnimationClip, WrapMode } from "@alipay/o3";

interface GLTFAsset {
  assets: [ { nodes: [ Node ], rootScene: { nodes: [ Node ] } } ];
  asset: {
    animations: [
      AnimationClip
      ],
  };
}

/**
 * 暂时只为编辑器使用
 */
export class GLTFModel extends NodeAbility {

  get asset() {
    return this._asset;
  }

  set asset(value: GLTFAsset) {
    (this.GLTFNode as any)._children = [];
    if (value !== null) {
      value.assets[0].rootScene.nodes.forEach(node => {
        this.GLTFNode.addChild(node.clone());
      });
    }
    this._asset = value;
  }

  get animator() {
    return this._animator;
  }

  set isAnimate(value: boolean) {
    if (this._asset && this._asset.asset && this._asset.asset.animations && this._asset.asset.animations.length && value) {
      if (!this._animator) {
        const animations = this._asset.asset.animations;
        // 加载动画
        this._animator = this.node.createAbility(AAnimation);
        animations.forEach((clip: AnimationClip) => {
          this._animator.addAnimationClip(clip, clip.name);
        });

        if (this._autoPlay) {
          this.autoPlay = this._autoPlay;
        }

      }

    } else {
      this.node.detachAbility(this._animator);
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
        wrapMode: this._loop,
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
        wrapMode: value,
      });
    }
    this._loop = value;
  }

  public _animator: AAnimation;
  public animationsNames: String[];

  private _asset: GLTFAsset;
  private GLTFNode: Node;
  private _loop: number;
  private _autoPlay: string;

  constructor(node, props) {
    super(node, props);

    this.GLTFNode = this.node.createChild("GLTF");

    const {
      asset = null,
      isAnimate,
      autoPlay,
      loop,
    } = props;
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
