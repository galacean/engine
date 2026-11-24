import {
  AnimationClip,
  AnimationFloatArrayCurve,
  AnimationQuaternionCurve,
  AnimationVector3Curve,
  AssetPromise,
  Component,
  ComponentConstructor,
  Entity,
  InterpolationType,
  Keyframe,
  SkinnedMeshRenderer,
  Transform,
  TypedArray
} from "@galacean/engine-core";
import { Quaternion, Vector3, Vector4 } from "@galacean/engine-math";
import {
  AnimationChannelTargetPath,
  AnimationSamplerInterpolation,
  IAnimation,
  IAnimationSampler
} from "../GLTFSchema";
import { GLTFUtils } from "../GLTFUtils";
import { GLTFParser } from "./GLTFParser";
import { GLTFParserContext, GLTFParserType, registerGLTFParser } from "./GLTFParserContext";

@registerGLTFParser(GLTFParserType.Animation)
export class GLTFAnimationParser extends GLTFParser {
  /**
   * @internal
   */
  static _parseStandardProperty(
    context: GLTFParserContext,
    animationClip: AnimationClip,
    animationInfo: IAnimation
  ): AssetPromise<AnimationClip> {
    const { glTF } = context;
    const { accessors } = glTF;
    const { channels, samplers } = animationInfo;
    const entities = context.get<Entity>(GLTFParserType.Entity);

    return AssetPromise.all([
      this._loadSamplerAccessors(context, samplers),
      context.get<Entity>(GLTFParserType.Scene)
    ]).then(([data]) => {
      const sampleDataCollection = new Array<SampleData>(samplers.length);
      for (let j = 0, m = samplers.length; j < m; j++) {
        const sampler = samplers[j];
        const input = data.get(sampler.input)!;
        let output = data.get(sampler.output)!;
        const outputAccessor = accessors![sampler.output];
        if (outputAccessor.normalized) {
          const scale = GLTFUtils.getNormalizedComponentScale(outputAccessor.componentType);
          const scaled = new Float32Array(output.length);
          for (let k = 0, v = output.length; k < v; k++) {
            scaled[k] = output[k] * scale;
          }
          output = scaled;
        }

        const interpolation = sampler.interpolation ?? AnimationSamplerInterpolation.Linear;
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
        sampleDataCollection[j] = {
          interpolation: samplerInterpolation,
          input,
          output,
          outputSize: output.length / input.length
        };
      }

      for (let j = 0, m = channels.length; j < m; j++) {
        const glTFChannel = channels[j];
        const { target } = glTFChannel;
        const channelTargetEntity = entities[target.node];

        let relativePath = "";
        let entity = channelTargetEntity;
        while (entity.parent) {
          relativePath = relativePath === "" ? `${entity.name}` : `${entity.name}/${relativePath}`;
          entity = entity.parent;
        }

        // If the target node is in the default scene, relativePath will be empty
        if (context.glTFResource.sceneRoots.indexOf(entity) === -1) {
          continue;
        }

        let ComponentType!: ComponentConstructor<Component>;
        let propertyName!: string;
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

        const curve = this._addCurve(target.path, sampleDataCollection[glTFChannel.sampler]);

        if (target.path === AnimationChannelTargetPath.WEIGHTS) {
          const mesh = glTF.nodes![target.node].mesh;
          for (let i = 0, n = glTF.meshes![mesh!].primitives.length; i < n; i++) {
            animationClip.addCurveBinding(relativePath, ComponentType, i, propertyName, curve);
          }
        } else {
          animationClip.addCurveBinding(relativePath, ComponentType, propertyName, curve);
        }
      }
      return animationClip;
    });
  }

  private static _loadSamplerAccessors(
    context: GLTFParserContext,
    samplers: IAnimationSampler[]
  ): AssetPromise<Map<number, TypedArray>> {
    const { accessors, bufferViews } = context.glTF;
    const data = new Map<number, TypedArray>();
    const byView = new Map<number, number[]>();
    const pending: AssetPromise<void>[] = [];

    function request(index: number): void {
      if (data.has(index)) return;
      data.set(index, null!);
      const accessor = accessors![index];
      const viewIndex = accessor.bufferView;
      if (viewIndex === undefined || accessor.sparse || bufferViews![viewIndex].byteStride) {
        pending.push(
          GLTFUtils.getAccessorBuffer(context, bufferViews, accessor).then((info) => {
            data.set(index, info.data);
          })
        );
        return;
      }

      let indices = byView.get(viewIndex);
      if (!indices) {
        byView.set(viewIndex, (indices = []));
        // Animation accessors are tightly packed CPU data. Resolve their shared,
        // possibly compressed buffer view once, then slice each accessor synchronously.
        pending.push(
          context.get<Uint8Array>(GLTFParserType.BufferView, viewIndex).then((view) => {
            for (let i = 0, n = indices!.length; i < n; i++) {
              const index = indices![i];
              const { byteOffset = 0, componentType, count, type } = accessors![index];
              const ArrayType = GLTFUtils.getComponentType(componentType);
              data.set(
                index,
                new ArrayType(view.buffer, view.byteOffset + byteOffset, count * GLTFUtils.getAccessorTypeSize(type))
              );
            }
          })
        );
      }
      indices.push(index);
    }

    for (let i = 0, n = samplers.length; i < n; i++) {
      const { input, output } = samplers[i];
      request(input);
      request(output);
    }
    return AssetPromise.all(pending).then(() => data);
  }

  private static _addCurve(animationChannelTargetPath: AnimationChannelTargetPath, sampleData: SampleData) {
    const { input, output, outputSize } = sampleData;

    switch (animationChannelTargetPath) {
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
            keyframe.value = output.slice(offset, offset + outputSize) as Float32Array;
            offset += outputSize;
            keyframe.outTangent = Array.from(output.subarray(offset, offset + outputSize));
            offset += outputSize;
          } else {
            keyframe.value = output.slice(offset, offset + outputSize) as Float32Array;
            offset += outputSize;
          }
          curve.addKey(keyframe);
        }
        return curve;
      }
    }
  }

  parse(context: GLTFParserContext, index: number): AssetPromise<AnimationClip> {
    const animationInfo = context.glTF.animations![index];
    const { name = `AnimationClip${index}` } = animationInfo;

    const animationClipPromise =
      <AssetPromise<AnimationClip> | AnimationClip>(
        GLTFParser.executeExtensionsCreateAndParse(animationInfo.extensions, context, animationInfo)
      ) || GLTFAnimationParser._parseStandardProperty(context, new AnimationClip(name), animationInfo);

    return AssetPromise.resolve(animationClipPromise).then((animationClip) => {
      GLTFParser.executeExtensionsAdditiveAndParse(animationInfo.extensions, context, animationClip, animationInfo);
      return animationClip;
    });
  }
}

interface SampleData {
  input: TypedArray;
  output: TypedArray;
  interpolation: InterpolationType;
  outputSize: number;
}
