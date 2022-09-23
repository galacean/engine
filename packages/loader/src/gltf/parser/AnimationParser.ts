import {
  AnimationClip,
  AnimationCurve,
  Component,
  Entity,
  InterpolableKeyframe,
  InterpolableValueType,
  InterpolationType,
  SkinnedMeshRenderer,
  Transform,
  TypedArray
} from "@oasis-engine/core";
import { Quaternion, Vector2, Vector3, Vector4 } from "@oasis-engine/math";
import { GLTFResource } from "../GLTFResource";
import { GLTFUtil } from "../GLTFUtil";
import { AccessorType, AnimationChannelTargetPath, AnimationSamplerInterpolation, IAnimationChannel } from "../Schema";
import { Parser } from "./Parser";

export class AnimationParser extends Parser {
  parse(context: GLTFResource) {
    const { gltf, buffers, entities, animationIndex } = context;
    const { animations, accessors } = gltf;
    if (!animations) {
      return;
    }
    const animationClipCount = animations.length;
    const animationClips = new Array<AnimationClip>(animationClipCount);
    const animationsIndices = new Array<{
      name: string;
      index: number;
    }>(animationClipCount);

    for (let i = 0; i < animationClipCount; i++) {
      if (animationIndex >= 0 && animationIndex !== i) {
        continue;
      }
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
        const outputAccessorSize = output.length / input.length;

        const interpolation = gltfSampler.interpolation ?? AnimationSamplerInterpolation.Linear;
        let samplerInterpolation: InterpolationType;
        switch (interpolation) {
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
          type: outputAccessor.type,
          interpolation: samplerInterpolation,
          input,
          output,
          outputSize: outputAccessorSize
        });
      }

      for (let i = 0; i < channels.length; i++) {
        const gltfChannel = channels[i];
        const { target } = gltfChannel;

        const channelTargetEntity = entities[target.node];
        let relativePath = "";
        let entity = channelTargetEntity;
        while (entity.parent) {
          relativePath = relativePath === "" ? `${entity.name}` : `${entity.name}/${relativePath}`;
          entity = entity.parent;
        }

        let compType: new (entity: Entity) => Component;
        let propertyName: string;
        let interpolableValueType: InterpolableValueType;
        switch (target.path) {
          case AnimationChannelTargetPath.TRANSLATION:
            compType = Transform;
            propertyName = "position";
            interpolableValueType = InterpolableValueType.Vector3;
            break;
          case AnimationChannelTargetPath.ROTATION:
            compType = Transform;
            propertyName = "rotation";
            interpolableValueType = InterpolableValueType.Quaternion;
            break;
          case AnimationChannelTargetPath.SCALE:
            compType = Transform;
            propertyName = "scale";
            interpolableValueType = InterpolableValueType.Vector3;
            break;
          case AnimationChannelTargetPath.WEIGHTS:
            compType = SkinnedMeshRenderer;
            propertyName = "blendShapeWeights";
            interpolableValueType = InterpolableValueType.FloatArray;
            break;
          default:
        }

        const curve = this._addCurve(interpolableValueType, gltfChannel, sampleDataCollection);
        animationClip.addCurveBinding(relativePath, compType, propertyName, curve);
      }

      animationClips[i] = animationClip;
      animationsIndices[i] = {
        name,
        index: i
      };
    }

    if (animationIndex >= 0) {
      const animationClip = animationClips[animationIndex];
      if (animationClip) {
        return animationClip;
      } else {
        throw `animation index not find in: ${animationIndex}`;
      }
    }
    context.animations = animationClips;
    // @ts-ignore for editor
    context._animationsIndices = animationsIndices;
  }

  private _addCurve(
    interpolableValueType: InterpolableValueType,
    gltfChannel: IAnimationChannel,
    sampleDataCollection: SampleData[]
  ): AnimationCurve {
    const curve = new AnimationCurve();
    const sampleData = sampleDataCollection[gltfChannel.sampler];
    const { input, output, outputSize } = sampleData;

    curve.interpolation = sampleData.interpolation;
    for (let j = 0, n = input.length; j < n; j++) {
      const offset = j * outputSize;
      if (interpolableValueType === InterpolableValueType.Float) {
        const keyframe = new InterpolableKeyframe<number, number>();
        keyframe.time = input[j];
        keyframe.inTangent = 0;
        keyframe.outTangent = 0;
        keyframe.value = output[offset];
        curve.addKey(keyframe);
      } else if (interpolableValueType === InterpolableValueType.FloatArray) {
        const keyframe = new InterpolableKeyframe<Float32Array, Float32Array>();
        keyframe.time = input[j];
        keyframe.inTangent = new Float32Array(outputSize);
        keyframe.outTangent = new Float32Array(outputSize);
        keyframe.value = <Float32Array>output.subarray(offset, offset + outputSize);
        curve.addKey(keyframe);
      } else if (interpolableValueType === InterpolableValueType.Vector2) {
        const keyframe = new InterpolableKeyframe<Vector2, Vector2>();
        keyframe.time = input[j];
        keyframe.value = new Vector2(output[offset], output[offset + 1]);
        keyframe.inTangent = new Vector2();
        keyframe.outTangent = new Vector2();
        curve.addKey(keyframe);
      } else if (interpolableValueType === InterpolableValueType.Vector3) {
        const keyframe = new InterpolableKeyframe<Vector3, Vector3>();
        keyframe.time = input[j];
        keyframe.value = new Vector3(output[offset], output[offset + 1], output[offset + 2]);
        keyframe.inTangent = new Vector3();
        keyframe.outTangent = new Vector3();
        curve.addKey(keyframe);
      } else if (interpolableValueType === InterpolableValueType.Vector4) {
        const keyframe = new InterpolableKeyframe<Vector4, Vector4>();
        keyframe.time = input[j];
        keyframe.value = new Vector4(output[offset], output[offset + 1], output[offset + 2], output[offset + 3]);
        keyframe.inTangent = new Vector4();
        keyframe.outTangent = new Vector4();
        curve.addKey(keyframe);
      } else if (interpolableValueType === InterpolableValueType.Quaternion) {
        const keyframe = new InterpolableKeyframe<Vector4, Quaternion>();
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
  type: AccessorType;
  input: TypedArray;
  output: TypedArray;
  interpolation: InterpolationType;
  outputSize: number;
}
