import { Node } from '@alipay/o3-core'
import { AAnimation, AAnimator, AnimationClip, AnimationType } from '@alipay/o3-animator'
import { Easing } from '@alipay/o3-tween'
const { Interpolation, Skelton, AnimationComponent } = AnimationType

let animClipCount = 0
let animCount = 0
const animationClipTypeMap = {
  Interpolation: Interpolation,
  Skelton: Skelton,
  AnimationComponent: AnimationComponent
}
/**
 * 解析动画
 * @param resources
 * @returns {*}
 * @private
 */
export function parseAnimationData(currentScene, resources) {
  resources._assets = resources._assets || []
  parseResources(currentScene, resources, 'nodes', parseNode)
  parseResources(currentScene, resources, 'animationClips', parseAnimationClip)
  parseResources(currentScene, resources, 'animations', parseAnimation)
  return buildAnimation(currentScene, resources)
}

export function registerAnimationClip(resources, name, script) {
  resources._assets = resources._assets || []
  resources._assets['animationClipsMap'] = resources._assets['animationClipsMap'] || {}
  resources._assets['animationClipsMap'][name] = script
}

function parseResources(currentScene, resources, name, handler) {
  // const { nodes, animationClips, animations, animator } = data
  if (resources.hasOwnProperty(name)) {
    resources._assets[name] = resources._assets[name] || []
    const entities = resources[name] || []
    for (let i = 0; i < entities.length; i++) {
      resources._assets[name].push(handler(currentScene, entities[i], resources))
    }
  }
}

function parseNode(currentScene, nodeData) {
  const { name } = nodeData
  const node = currentScene.findObjectByName(name)
  return node
}

function parseAnimationClip(currentScene, animClipData, resources) {
  const { name, type, options } = animClipData
  const animClipType = animationClipTypeMap[type]
  let animClip
  switch (animClipType) {
    case Interpolation:
      const { value, property, interpolation, duration } = options
      animClip = new AnimationClip(name || `AnimationClip_${animClipCount++}`, animClipType, {
        value,
        property,
        interpolation: Easing[interpolation],
        duration
      })
      break
    case Skelton:
      const { action } = options
      animClip = new AnimationClip(
        name || `AnimationClip_${animClipCount++}`,
        animClipType,
        resources._assets['animationClipsMap'][action]
      )
      break
    case AnimationComponent:
      const { script, params } = options
      animClip = new AnimationClip(name || `AnimationClip_${animClipCount++}`, animClipType, {
        script: resources._assets['animationClipsMap'][script],
        params
      })
      break
  }
  return animClip
}

function parseAnimation(currentScene, animData, resources) {
  const { name, node: nodeIndex, keyFrames } = animData
  const node = resources._assets['nodes'][nodeIndex]
  const animation = node.createAbility(AAnimation, {
    name: name || `Animation_${animCount++}`
  })
  const animClips = resources._assets['animationClips']
  Object.keys(keyFrames).forEach(keyFrame => {
    keyFrames[keyFrame].forEach(animClipIndex => {
      animation.addAnimationClip(keyFrame, animClips[animClipIndex])
    })
  })
  return animation
}

function buildAnimation(currentScene, resources) {
  const { animator: animatorData } = resources
  const { type, options } = animatorData
  const { keyFrames } = options
  const rootNode = currentScene.root
  const animator = rootNode.createAbility(AAnimator)
  const animations = resources._assets['animations']
  if (type === 'timeline') {
    Object.keys(keyFrames).forEach(keyFrame => {
      keyFrames[keyFrame].forEach(animIndex => {
        animator.addAnimationByStartTime(parseFloat(keyFrame), animations[animIndex])
      })
    })
  }
  return animator
}
