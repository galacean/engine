import { Entity } from "@alipay/o3-core";
import { RfuiRenderer } from "./rfuiRenderer";
import { ARenderEachRow } from "./ability";

/**
 * RfuiNode 节点类
 * @extends Entity
 */
export class RfuiNode extends Entity {
  public outAnimations;
  public nodesConfig;
  public animationParam;
  public inAnimations;
  /**
   * RFUI 转场动画配置
   * @typedef {Object} AnimationConfig
   * @property {string} type 动画类型：scaleIn/Out、translateIn/Out、rotateIn/Out、fadeIn/Out、scaleXIn/Out、scaleYIn/Out
   * @property {AnimationParam} param 动画参数
   */

  /**
   * RFUI 子节点配置项
   * @typedef {Object} NodeConfig
   * @property {string} name 名称
   * @property {vec3} position 位置
   * @property {vec3} scale 大小
   * @property {vec3} rotation 旋转
   * @property {Object} rendererConfig 渲染类配置
   * @property {Object} animationsConfig 转场动画配置数组
   * @property {AnimationConfig[]} animationsConfig.in 入场动画配置数组
   * @property {AnimationConfig[]} animationsConfig.out 出场动画配置数组
   * @property {Array} abilities 技能配置数组
   */

  /**
   * @constructor
   * @param {string} name 名称
   * @param {Props} props 节点配置
   * @param {Object} [props.scene] 场景
   * @param {Object} [props.parent]  父节点
   * @param {NodeConfig[]} [props.nodesConfig]  子节点配置项数组
   * @param {AnimationParam} [props.animationParam]  转场动画参数
   */
  constructor(name, props) {
    super(name);
    this.parent = props.parent;
    this.nodesConfig = props.nodesConfig;
    this.animationParam = props.animationParam || {};
    this.inAnimations = [];
    this.outAnimations = [];
    this._initNode();
  }

  _initNode() {
    this.nodesConfig.forEach((nodeConfig) => {
      const node = this.createChild(nodeConfig.name);
      if (nodeConfig.position) {
        node.position = nodeConfig.position;
      }
      if (nodeConfig.scale) {
        node.scale = nodeConfig.scale;
      }
      if (nodeConfig.rotation) {
        node.transform.rotation = nodeConfig.rotation;
      }

      const renderer = this.initRenderer(node, nodeConfig);
      const inAnimation = this.initAniamtion(node, nodeConfig, renderer);
      this.initAbility(node, nodeConfig, renderer, inAnimation);
    });
  }

  initRenderer(node, nodeConfig) {
    const animationParam = Object.assign({}, this.animationParam, nodeConfig.rendererConfig.animationParam || {});
    nodeConfig.rendererConfig.animationParam = animationParam;
    return node.addComponent(RfuiRenderer, nodeConfig.rendererConfig);
  }

  initAniamtion(node, nodeConfig, renderer) {
    const inAnimation = {
      manager: renderer.animationManager,
      animations: []
    };
    nodeConfig.animationsConfig["in"].forEach((animationInConfig) => {
      inAnimation.animations.push({ type: animationInConfig.type, param: animationInConfig.param });
    });
    this.inAnimations.push(inAnimation);

    const outAnimation = {
      manager: renderer.animationManager,
      animations: []
    };
    nodeConfig.animationsConfig.out.forEach((animationOutConfig) => {
      outAnimation.animations.push({ type: animationOutConfig.type, param: animationOutConfig.param });
    });
    this.outAnimations.push(outAnimation);
    return inAnimation;
  }

  initAbility(node, nodeConfig, renderer, inAnimation) {
    if (nodeConfig.abilities) {
      nodeConfig.abilities.forEach((type) => {
        if (type === "ARenderEachRow") {
          const aType = node.addComponent(ARenderEachRow, {
            geometry: renderer.geometry
          });
          if (inAnimation.animations.length > 0) {
            let last = 0;
            let delay = 0;
            inAnimation.animations.forEach((animation, index) => {
              if (animation.param && animation.param.delay && animation.param.delay > delay) {
                last = index;
                delay = animation.param.delay;
              }
            });
            inAnimation.animations[last].param.onComplete = () => {
              aType.start();
            };
          } else {
            aType.start();
          }
        }
      });
    }
  }

  animationIn(onComplete?) {
    this.inAnimations.forEach((inAnimation) => {
      inAnimation.animations.forEach((animation) => {
        animation.tweener = inAnimation.manager[animation.type](animation.param);
      });
    });
  }

  animationInStop(onComplete?) {
    this.inAnimations.forEach((inAnimation) => {
      inAnimation.animations.forEach((animation) => {
        animation.tweener && animation.tweener.stop();
      });
    });
  }

  animationOut(onComplete?) {
    this.outAnimations.forEach((outAnimation) => {
      outAnimation.animations.forEach((animation) => {
        animation.tweener = outAnimation.manager[animation.type](animation.param);
      });
    });
  }

  animationOutStop(onComplete?) {
    this.outAnimations.forEach((outAnimation) => {
      outAnimation.animations.forEach((animation) => {
        animation.tweener && animation.tweener.stop();
      });
    });
  }
}
