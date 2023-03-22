import {
  AnimationClip,
  AnimationFloatArrayCurve,
  AnimationQuaternionCurve,
  AnimationVector3Curve,
  AssetPromise,
  Component,
  Entity,
  InterpolationType,
  Keyframe,
  SkinnedMeshRenderer,
  Transform,
  TypedArray
} from "@oasis-engine/core";
import { Quaternion, Vector3, Vector4 } from "@oasis-engine/math";
import { GLTFUtil } from "../GLTFUtil";
import {
  AccessorType,
  AnimationChannelTargetPath,
  AnimationSamplerInterpolation,
  IAnimation,
  IAnimationChannel
} from "../GLTFSchema";
import { GLTFParser } from "./GLTFParser";
import { GLTFParserContext } from "./GLTFParserContext";

export class GLTFAnimationParser extends GLTFParser {
  /**
   * @internal
   */
  static _parseStandardProperty(context: GLTFParserContext, animationClip: AnimationClip, animationInfo: IAnimation) {
    const { glTF, glTFResource } = context;
    const { entities } = glTFResource;
    const { accessors, bufferViews } = glTF;
    const { channels, samplers } = animationInfo;

    const sampleDataCollection = new Array<SampleData>();

    let duration = -1;

    // parse samplers
    for (let j = 0, m = samplers.length; j < m; j++) {
      const gltfSampler = samplers[j];
      const inputAccessor = accessors[gltfSampler.input];
      const outputAccessor = accessors[gltfSampler.output];

      const input = GLTFUtil.getAccessorBuffer(context, bufferViews, inputAccessor).data;
      let output = GLTFUtil.getAccessorBuffer(context, bufferViews, outputAccessor).data;

      if (outputAccessor.normalized) {
        const scale = GLTFUtil.getNormalizedComponentScale(outputAccessor.componentType);
        const scaled = new Float32Array(output.length);
        for (let k = 0, v = output.length; k < v; k++) {
          scaled[k] = output[k] * scale;
        }
        output = scaled;
      }

      const outputStride = output.length / input.length;

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
        outputSize: outputStride
      });
    }

    for (let j = 0, m = channels.length; j < m; j++) {
      const gltfChannel = channels[j];
      const { target } = gltfChannel;

      const channelTargetEntity = entities[target.node];
      let relativePath = "";
      let entity = channelTargetEntity;
      while (entity.parent) {
        relativePath = relativePath === "" ? `${entity.name}` : `${entity.name}/${relativePath}`;
        entity = entity.parent;
      }

      let ComponentType: new (entity: Entity) => Component;
      let propertyName: string;
      switch (target.path) {
        case AnimationChannelTargetPath.TRANSLATION:
          ComponentType = Transform;
          propertyName = "position";
          break;
        case AnimationChannelTargetPath.ROTATION:
          ComponentType = Transform;
          propertyName = "rotationQuaternion";
          break;
        case AnimationChannelTargetPath.SCALE:
          ComponentType = Transform;
          propertyName = "scale";
          break;
        case AnimationChannelTargetPath.WEIGHTS:
          ComponentType = SkinnedMeshRenderer;
          propertyName = "blendShapeWeights";
          break;
        default:
      }

      const curve = this._addCurve(target.path, gltfChannel, sampleDataCollection);
      animationClip.addCurveBinding(relativePath, ComponentType, propertyName, curve);
    }
  }

  private static _addCurve(
    animationchannelTargetPath: AnimationChannelTargetPath,
    gltfChannel: IAnimationChannel,
    sampleDataCollection: SampleData[]
  ) {
    const sampleData = sampleDataCollection[gltfChannel.sampler];
    const { input, output, outputSize } = sampleData;

    switch (animationchannelTargetPath) {
      case AnimationChannelTargetPath.TRANSLATION:
      case AnimationChannelTargetPath.SCALE: {
        const curve = new AnimationVector3Curve();
        const interpolation = (curve.interpolation = sampleData.interpolation);

        let offset = 0;
        for (let i = 0, n = input.length; i < n; i++) {
          const keyframe = new Keyframe<Vector3>();
          keyframe.time = input[i];
          if (interpolation === InterpolationType.CubicSpine) {
            keyframe.inTangent = new Vector3(output[offset++], output[offset++], output[offset++]);
            keyframe.value = new Vector3(output[offset++], output[offset++], output[offset++]);
            keyframe.outTangent = new Vector3(output[offset++], output[offset++], output[offset++]);
          } else {
            keyframe.value = new Vector3(output[offset++], output[offset++], output[offset++]);
          }
          curve.addKey(keyframe);
        }
        return curve;
      }
      case AnimationChannelTargetPath.ROTATION: {
        const curve = new AnimationQuaternionCurve();
        const interpolation = (curve.interpolation = sampleData.interpolation);

        let offset = 0;
        for (let i = 0, n = input.length; i < n; i++) {
          const keyframe = new Keyframe<Quaternion>();
          keyframe.time = input[i];
          if (interpolation === InterpolationType.CubicSpine) {
            keyframe.inTangent = new Vector4(output[offset++], output[offset++], output[offset++], output[offset++]);
            keyframe.value = new Quaternion(output[offset++], output[offset++], output[offset++], output[offset++]);
            keyframe.outTangent = new Vector4(output[offset++], output[offset++], output[offset++], output[offset++]);
          } else {
            keyframe.value = new Quaternion(output[offset++], output[offset++], output[offset++], output[offset++]);
          }
          curve.addKey(keyframe);
        }
        return curve;
      }
      case AnimationChannelTargetPath.WEIGHTS: {
        const curve = new AnimationFloatArrayCurve();
        curve.interpolation = sampleData.interpolation;

        let offset = 0;
        for (let i = 0, n = input.length; i < n; i++) {
          const keyframe = new Keyframe<Float32Array>();
          keyframe.time = input[i];
          if (curve.interpolation === InterpolationType.CubicSpine) {
            keyframe.inTangent = Array.from(output.subarray(offset, offset + outputSize));
            offset += outputSize;
            keyframe.value = output.subarray(offset, offset + outputSize) as Float32Array;
            offset += outputSize;
            keyframe.outTangent = Array.from(output.subarray(offset, offset + outputSize));
            offset += outputSize;
          } else {
            keyframe.value = output.subarray(offset, offset + outputSize) as Float32Array;
            offset += outputSize;
          }
          curve.addKey(keyframe);
        }
        return curve;
      }
    }
  }

  parse(context: GLTFParserContext): AssetPromise<AnimationClip[]> {
    const { glTF, buffers, glTFResource } = context;
    const { entities } = glTFResource;
    const { animations, accessors, bufferViews } = glTF;
    if (!animations) {
      return;
    }
    const animationClipsPromiseInfo = context.animationClipsPromiseInfo;

    const animationClipCount = animations.length;
    const animationClipPromises = [];
    const animationsIndices = new Array<{
      name: string;
      index: number;
    }>(animationClipCount);

    for (let i = 0; i < animationClipCount; i++) {
      const animationInfo = animations[i];
      const { name = `AnimationClip${i}` } = animationInfo;

      let animationClip = <AnimationClip>(
        GLTFParser.executeExtensionsCreateAndParse(animationInfo.extensions, context, animationInfo)
      );

      if (!animationClip) {
        animationClip = new AnimationClip(name);
        GLTFAnimationParser._parseStandardProperty(context, animationClip, animationInfo);
      }

      animationClipPromises.push(animationClip);
    }

    return AssetPromise.all(animationClipPromises).then((animationClips) => {
      glTFResource.animations = animationClips;
      let promises = [];
      for (let i = 0; i < glTF.animations.length; i++) {
        const animationInfo = glTF.animations[i];
        promises.push(
          GLTFParser.executeExtensionsAdditiveAndParse(
            animationInfo.extensions,
            context,
            animationClips[i],
            animationInfo
          )
        );
      }
      Promise.all(promises).then(() => {
        animationClipsPromiseInfo.resolve(animationClips);
      });
      return animationClipsPromiseInfo.promise;
    });
  }
}
interface SampleData {
  type: AccessorType;
  input: TypedArray;
  output: TypedArray;
  interpolation: InterpolationType;
  outputSize: number;
}
