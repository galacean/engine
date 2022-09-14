import {
  AnimationClip,
  AnimationCurve,
  AnimationCurveFactory,
  Component,
  Entity,
  FloatArrayKeyframe,
  InterpolableValueType,
  InterpolationType,
  QuaternionKeyframe,
  SkinnedMeshRenderer,
  Transform,
  TypedArray,
  Vector3Keyframe
} from "@oasis-engine/core";
import { Quaternion, Vector3, Vector4 } from "@oasis-engine/math";
import { GLTFResource } from "../GLTFResource";
import { GLTFUtil } from "../GLTFUtil";
import { AccessorType, AnimationChannelTargetPath, AnimationSamplerInterpolation, IAnimationChannel } from "../Schema";
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
    const animationsIndices = new Array<{
      name: string;
      index: number;
    }>(animationClipCount);

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
            propertyName = "rotationQuaternion";
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
        animationClip.addCurveBinding(relativePath, compType, propertyName, curve as AnimationCurve);
      }

      animationClips[i] = animationClip;
      animationsIndices[i] = {
        name,
        index: i
      };
    }
    context.animations = animationClips;
    // @ts-ignore for editor
    context._animationsIndices = animationsIndices;
  }

  private _addCurve(
    interpolableValueType: InterpolableValueType,
    gltfChannel: IAnimationChannel,
    sampleDataCollection: SampleData[]
  ) {
    const sampleData = sampleDataCollection[gltfChannel.sampler];
    const { input, output, outputSize } = sampleData;

    switch (interpolableValueType) {
      case InterpolableValueType.Vector3: {
        const curve = AnimationCurveFactory.create(InterpolableValueType.Vector3);
        const interpolation = (curve.interpolation = sampleData.interpolation);

        let outputBufferOffset = 0;
        const getNextOutputValue = () => {
          const value = new Vector3(
            output[outputBufferOffset],
            output[outputBufferOffset + 1],
            output[outputBufferOffset + 2]
          );
          outputBufferOffset += 3;
          return value;
        };

        for (let i = 0, n = input.length; i < n; i++) {
          const keyframe = new Vector3Keyframe();
          keyframe.time = input[i];
          if (interpolation === InterpolationType.CubicSpine) {
            keyframe.inTangent = getNextOutputValue();
            keyframe.value = getNextOutputValue();
            keyframe.outTangent = getNextOutputValue();
          } else {
            keyframe.value = getNextOutputValue();
          }
          curve.addKey(keyframe);
        }
        return curve;
      }
      case InterpolableValueType.Quaternion: {
        const curve = AnimationCurveFactory.create(InterpolableValueType.Quaternion);
        const interpolation = (curve.interpolation = sampleData.interpolation);

        let outputBufferOffset = 0;
        const getNextOutputValue = (isQuat: boolean) => {
          const value = isQuat
            ? new Quaternion(
                output[outputBufferOffset],
                output[outputBufferOffset + 1],
                output[outputBufferOffset + 2],
                output[outputBufferOffset + 3]
              )
            : new Vector4(
                output[outputBufferOffset],
                output[outputBufferOffset + 1],
                output[outputBufferOffset + 2],
                output[outputBufferOffset + 3]
              );
          outputBufferOffset += 4;
          return value;
        };

        for (let i = 0, n = input.length; i < n; i++) {
          const keyframe = new QuaternionKeyframe();
          keyframe.time = input[i];
          if (interpolation === InterpolationType.CubicSpine) {
            keyframe.inTangent = getNextOutputValue(false) as Vector4;
            keyframe.value = getNextOutputValue(true) as Quaternion;
            keyframe.outTangent = getNextOutputValue(false) as Vector4;
          } else {
            keyframe.value = getNextOutputValue(true) as Quaternion;
          }
          curve.addKey(keyframe);
        }
        return curve;
      }
      case InterpolableValueType.FloatArray: {
        const curve = AnimationCurveFactory.create(InterpolableValueType.FloatArray);
        curve.interpolation = sampleData.interpolation;

        let outputBufferOffset = 0;
        const getNextOutputValue = () => {
          const value = output.subarray(outputBufferOffset, outputBufferOffset + outputSize);
          outputBufferOffset += outputSize;
          return value as Float32Array;
        };

        for (let i = 0, n = input.length; i < n; i++) {
          const keyframe = new FloatArrayKeyframe();
          keyframe.time = input[i];
          if (curve.interpolation === InterpolationType.CubicSpine) {
            keyframe.inTangent = getNextOutputValue();
            keyframe.value = getNextOutputValue();
            keyframe.outTangent = getNextOutputValue();
          } else {
            keyframe.value = getNextOutputValue();
          }
          curve.addKey(keyframe);
        }
        return curve;
      }
    }
  }
}
interface SampleData {
  type: AccessorType;
  input: TypedArray;
  output: TypedArray;
  interpolation: InterpolationType;
  outputSize: number;
}
