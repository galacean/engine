import {
  AnimationClip,
  AnimationCurve,
  Component,
  Entity,
  FloatKeyframe,
  InterpolationType,
  QuaternionKeyframe,
  SkinnedMeshRenderer,
  Transform,
  TypedArray,
  Vector2Keyframe,
  Vector3Keyframe
} from "@oasis-engine/core";
import { Quaternion, Vector2, Vector3, Vector4 } from "@oasis-engine/math";
import { GLTFResource } from "../GLTFResource";
import { GLTFUtil } from "../GLTFUtil";
import { AnimationChannelTargetPath, AnimationSamplerInterpolation, IAnimationChannel } from "../Schema";
import { Parser } from "./Parser";

export class AnimationParser extends Parser {
  parse(context: GLTFResource): void {
    const { gltf, buffers, entities } = context;
    const { animations, accessors } = gltf;
    if (!animations) {
      return;
    }

    const animationClipCount = animations.length;
    const animationClips = new Array<AnimationClip>(animationClipCount);

    for (let i = 0; i < animationClipCount; i++) {
      const gltfAnimation = animations[i];
      const { channels, samplers, name = `AnimationClip${i}` } = gltfAnimation;
      const animationClip = new AnimationClip(name);
      const sampleDataCollection = new Array<SampleData>();

      let duration = -1;

      // parse samplers
      for (let i = 0; i < samplers.length; i++) {
        const gltfSampler = samplers[i];
        const inputAccessor = accessors[gltfSampler.input];
        const outputAccessor = accessors[gltfSampler.output];
        const input = GLTFUtil.getAccessorData(gltf, inputAccessor, buffers);
        const output = GLTFUtil.getAccessorData(gltf, outputAccessor, buffers);
        let outputAccessorSize = GLTFUtil.getAccessorTypeSize(outputAccessor.type);
        if (outputAccessorSize * input.length !== output.length) {
          outputAccessorSize = output.length / input.length;
        }

        let samplerInterpolation: InterpolationType;
        switch (gltfSampler.interpolation) {
          case AnimationSamplerInterpolation.CubicSpine:
            samplerInterpolation = InterpolationType.CubicSpine;
            break;
          case AnimationSamplerInterpolation.Step:
            samplerInterpolation = InterpolationType.Step;
            break;
          case AnimationSamplerInterpolation.Linear:
            samplerInterpolation = InterpolationType.Linear;
            break;
        }
        const maxTime = input[input.length - 1];
        if (maxTime > duration) {
          duration = maxTime;
        }

        sampleDataCollection.push({
          interpolation: samplerInterpolation,
          input,
          output,
          outputSize: outputAccessorSize
        });
      }

      for (let i = 0; i < channels.length; i++) {
        const gltfChannel = channels[i];
        const { target } = gltfChannel;
        let targetPath = "";

        switch (target.path) {
          case AnimationChannelTargetPath.TRANSLATION:
            targetPath = "position";
            break;
          case AnimationChannelTargetPath.ROTATION:
            targetPath = "rotation";
            break;
          case AnimationChannelTargetPath.SCALE:
            targetPath = "scale";
            break;
          case AnimationChannelTargetPath.WEIGHTS:
            targetPath = "weights";
            break;
        }

        const channelTargetEntity = entities[target.node];
        let path: string;
        let parent = channelTargetEntity.parent;
        if (parent) {
          path = channelTargetEntity.name;
          while (parent.parent) {
            path = `${parent.name}/${path}`;
            parent = parent.parent;
          }
        } else {
          path = "";
        }

        let compType: new (entity: Entity) => Component;
        let propertyName: string;
        switch (target.path) {
          case AnimationChannelTargetPath.TRANSLATION:
            compType = Transform;
            propertyName = "position";
            break;
          case AnimationChannelTargetPath.ROTATION:
            compType = Transform;
            propertyName = "rotation";
            break;
          case AnimationChannelTargetPath.SCALE:
            compType = Transform;
            propertyName = "scale";
            break;
          case AnimationChannelTargetPath.WEIGHTS:
            compType = SkinnedMeshRenderer;
            propertyName = "blendShapeWeights";
            break;
          default:
            break;
        }

        const curve = this._addCurve(gltfChannel, sampleDataCollection);
        animationClip.setCurve(path, compType, propertyName, curve);
      }

      animationClips[i] = animationClip;
    }
    context.animations = animationClips;
  }

  private _addCurve(gltfChannel: IAnimationChannel, sampleDataCollection: SampleData[]): AnimationCurve {
    const curve = new AnimationCurve();
    const sampleData = sampleDataCollection[gltfChannel.sampler];
    const { input, output, outputSize } = sampleData;

    curve.interpolation = sampleData.interpolation;
    for (let j = 0, n = input.length; j < n; j++) {
      const offset = j * outputSize;
      if (outputSize === 1) {
        const keyframe = new FloatKeyframe();
        keyframe.time = input[j];
        keyframe.value = output[offset];
        keyframe.inTangent = 0;
        keyframe.outTangent = 0;
        curve.addKey(keyframe);
      }
      if (outputSize === 2) {
        const keyframe = new Vector2Keyframe();
        keyframe.time = input[j];
        keyframe.value = new Vector2(output[offset], output[offset + 1]);
        keyframe.inTangent = new Vector2();
        keyframe.outTangent = new Vector2();
        curve.addKey(keyframe);
      }
      if (outputSize === 3) {
        const keyframe = new Vector3Keyframe();
        keyframe.time = input[j];
        keyframe.value = new Vector3(output[offset], output[offset + 1], output[offset + 2]);
        keyframe.inTangent = new Vector3();
        keyframe.outTangent = new Vector3();
        curve.addKey(keyframe);
      }
      if (outputSize === 4) {
        const keyframe = new QuaternionKeyframe();
        keyframe.time = input[j];
        keyframe.value = new Quaternion(output[offset], output[offset + 1], output[offset + 2], output[offset + 3]);
        keyframe.inTangent = new Vector4();
        keyframe.outTangent = new Vector4();
        curve.addKey(keyframe);
      }
    }
    return curve;
  }
}

interface SampleData {
  input: TypedArray;
  output: TypedArray;
  interpolation: InterpolationType;
  outputSize: number;
}
