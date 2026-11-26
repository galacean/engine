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
  SkinnedMeshRenderer,
  Transform,
  TypedArray
} from "@galacean/engine-core";
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
      let normalizedOutputs: Map<number, Float32Array> | undefined;

      function samples(index: number, normalize = false): TypedArray {
        const values = data.get(index)!;
        if (normalize) {
          const outputs = (normalizedOutputs ||= new Map());
          const cached = outputs.get(index);
          if (cached) return cached;
          const scale = GLTFUtils.getNormalizedComponentScale(accessors![index].componentType);
          const output = new Float32Array(values.length);
          for (let i = 0, n = values.length; i < n; i++) {
            // glTF 2.0 signed normalized min values (-128 BYTE, -32768 SHORT) exceed -1 and must clamp.
            output[i] = Math.max(-1, values[i] * scale);
          }
          outputs.set(index, output);
          return output;
        }
        // Detach sub-views from shared .bin/.glb ArrayBuffers so retained curves do not pin unrelated asset data.
        if (values.byteLength === values.buffer.byteLength) return values;
        const retained = values.slice();
        data.set(index, retained);
        return retained;
      }

      for (let j = 0, m = samplers.length; j < m; j++) {
        const sampler = samplers[j];
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
          input: samples(sampler.input),
          output: samples(sampler.output, accessors![sampler.output].normalized)
        };
      }

      // Animation extensions can rename or reparent targets between clips.
      const paths: (string | null | undefined)[] = [];
      const sceneRoots = context.glTFResource.sceneRoots;
      for (let j = 0, m = channels.length; j < m; j++) {
        const glTFChannel = channels[j];
        const { target } = glTFChannel;
        const node = target.node;
        let relativePath = paths[node];
        if (relativePath === undefined) {
          let entity = entities[node];
          relativePath = "";
          while (entity.parent) {
            relativePath = relativePath === "" ? entity.name : `${entity.name}/${relativePath}`;
            entity = entity.parent;
          }
          paths[node] = relativePath = sceneRoots.indexOf(entity) === -1 ? null : relativePath;
        }
        if (relativePath === null) continue;

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
        }

        const curve = this._addCurve(target.path, sampleDataCollection[glTFChannel.sampler]);

        if (target.path === AnimationChannelTargetPath.WEIGHTS) {
          const mesh = glTF.nodes![node].mesh;
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
              const accessorIndex = indices![i];
              const { byteOffset = 0, componentType, count, type } = accessors![accessorIndex];
              const ArrayType = GLTFUtils.getComponentType(componentType);
              data.set(
                accessorIndex,
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
    const { input, output, interpolation } = sampleData;
    const hasTangents = interpolation === InterpolationType.CubicSpine;
    let curve: AnimationVector3Curve | AnimationQuaternionCurve | AnimationFloatArrayCurve;

    switch (animationChannelTargetPath) {
      case AnimationChannelTargetPath.TRANSLATION:
      case AnimationChannelTargetPath.SCALE:
        curve = new AnimationVector3Curve();
        break;
      case AnimationChannelTargetPath.ROTATION:
        curve = new AnimationQuaternionCurve();
        break;
      case AnimationChannelTargetPath.WEIGHTS:
        curve = new AnimationFloatArrayCurve();
        break;
    }

    curve.interpolation = interpolation;
    curve.setKeys(input, output, hasTangents);
    return curve;
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
}
