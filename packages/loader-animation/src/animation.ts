import { Entity } from "@alipay/o3-core";
import { Animation, Animator, AnimationClip, AnimationClipType } from "@alipay/o3-animator";
import { Easing } from "@alipay/o3-tween";
const { Interpolation, Skeleton, AnimationComponent } = AnimationClipType;

let animClipCount = 0;
let animCount = 0;
const animationClipTypeMap = {
  Interpolation: Interpolation,
  Skeleton: Skeleton,
  AnimationComponent: AnimationComponent
};
/**
 * 解析动画
 * @param resources
 * @returns {*}
 * @private
 */
export function parseAnimationData(currentScene, resources) {
  resources._assets = resources._assets || [];
  parseResources(currentScene, resources, "nodes", parseNode);
  parseResources(currentScene, resources, "animationClips", parseAnimationClip);
  parseResources(currentScene, resources, "animations", parseAnimation);
  return buildAnimation(currentScene, resources);
}

export function registerAnimationClip(resources, name, script) {
  resources._assets = resources._assets || [];
  resources._assets["animationClipsMap"] = resources._assets["animationClipsMap"] || {};
  resources._assets["animationClipsMap"][name] = script;
}

function parseResources(currentScene, resources, name, handler) {
  // const { nodes, animationClips, animations, animator } = data
  if (resources.hasOwnProperty(name)) {
    resources._assets[name] = resources._assets[name] || [];
    const entities = resources[name] || [];
    for (let i = 0; i < entities.length; i++) {
      resources._assets[name].push(handler(currentScene, entities[i], resources));
    }
  }
}

function parseNode(currentScene, nodeData) {
  const { name } = nodeData;
  const node = currentScene.findObjectByName(name);
  return node;
}

function parseAnimationClip(currentScene, animClipData, resources) {
  const { name, type, options } = animClipData;
  const animClipType = animationClipTypeMap[type];
  let animClip;
  switch (animClipType) {
    case Interpolation:
      const { value, property, interpolation, duration } = options;
      animClip = new AnimationClip(name || `AnimationClip_${animClipCount++}`, animClipType, {
        value,
        property,
        interpolation: Easing[interpolation],
        duration
      });
      break;
    case Skeleton:
      const { action } = options;
      animClip = new AnimationClip(
        name || `AnimationClip_${animClipCount++}`,
        animClipType,
        resources._assets["animationClipsMap"][action]
      );
      break;
    case AnimationComponent:
      const { script, params } = options;
      animClip = new AnimationClip(name || `AnimationClip_${animClipCount++}`, animClipType, {
        script: resources._assets["animationClipsMap"][script],
        params
      });
      break;
  }
  return animClip;
}

function parseAnimation(currentScene, animData, resources) {
  const { name, node: nodeIndex, keyframes } = animData;
  const node = resources._assets["nodes"][nodeIndex];
  const animation = node.addComponent(Animation, {
    name: name || `Animation_${animCount++}`
  });
  const animClips = resources._assets["animationClips"];
  Object.keys(keyframes).forEach((keyframe) => {
    keyframes[keyframe].forEach((animClipIndex) => {
      animation.addAnimationClip(keyframe, animClips[animClipIndex]);
    });
  });
  return animation;
}

function buildAnimation(currentScene, resources) {
  const { animator: animatorData } = resources;
  const { type, options } = animatorData;
  const { keyframes } = options;
  const rootNode = currentScene.root;
  const animator = rootNode.addComponent(Animator);
  const animations = resources._assets["animations"];
  if (type === "timeline") {
    Object.keys(keyframes).forEach((keyframe) => {
      keyframes[keyframe].forEach((animIndex) => {
        animator.addAnimationByStartTime(parseFloat(keyframe), animations[animIndex]);
      });
    });
  }
  return animator;
}
