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
  AccessorComponentType,
  AnimationChannelTargetPath,
  AnimationSamplerInterpolation,
  IAccessor,
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
      const rawSamples = new Map<number, TypedArray>();
      const normalizedSamples = new Map<number, TypedArray>();
      // Animation extensions can rename or reparent targets between clips.
      const paths: (string | null | undefined)[] = [];
      const sceneRoots = context.glTFResource.sceneRoots;
      for (let j = 0, m = channels.length; j < m; j++) {
        const glTFChannel = channels[j];
        const { target } = glTFChannel;
        const node = target.node;
        if (paths[node] === undefined) {
          let entity = entities[node];
          let relativePath = "";
          while (entity.parent) {
            relativePath = relativePath === "" ? entity.name : `${entity.name}/${relativePath}`;
            entity = entity.parent;
          }
          paths[node] = sceneRoots.indexOf(entity) === -1 ? null : relativePath;
        }
        if (paths[node] === null) continue;

        const { input, output } = samplers[glTFChannel.sampler];
        rawSamples.set(input, data.get(input)!);
        const outputSamples = accessors![output].normalized ? normalizedSamples : rawSamples;
        outputSamples.set(output, data.get(output)!);
      }

      this._packSamples(accessors!, rawSamples, normalizedSamples);

      for (let j = 0, m = channels.length; j < m; j++) {
        const glTFChannel = channels[j];
        const { target } = glTFChannel;
        const node = target.node;
        const relativePath = paths[node];
        if (relativePath === null) continue;

        let ComponentType: ComponentConstructor<Component>;
        let propertyName: string;
        let curve: AnimationVector3Curve | AnimationQuaternionCurve | AnimationFloatArrayCurve;
        switch (target.path) {
          case AnimationChannelTargetPath.TRANSLATION:
          case AnimationChannelTargetPath.SCALE:
            ComponentType = Transform;
            propertyName = target.path === AnimationChannelTargetPath.TRANSLATION ? "position" : "scale";
            curve = new AnimationVector3Curve();
            break;
          case AnimationChannelTargetPath.ROTATION:
            ComponentType = Transform;
            propertyName = "rotationQuaternion";
            curve = new AnimationQuaternionCurve();
            break;
          case AnimationChannelTargetPath.WEIGHTS:
            ComponentType = SkinnedMeshRenderer;
            propertyName = "blendShapeWeights";
            curve = new AnimationFloatArrayCurve();
            break;
        }

        const sampler = samplers[glTFChannel.sampler];
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
        curve.interpolation = samplerInterpolation;
        // glTF 2.0 §5.8.1 requires strictly increasing sampler input times. Packed views are detached from the asset buffer.
        curve.setKeys(
          rawSamples.get(sampler.input)!,
          (accessors![sampler.output].normalized ? normalizedSamples : rawSamples).get(sampler.output)!,
          samplerInterpolation === InterpolationType.CubicSpine
        );

        if (target.path === AnimationChannelTargetPath.WEIGHTS) {
          const mesh = glTF.nodes![node].mesh;
          for (let i = 0, n = glTF.meshes![mesh!].primitives.length; i < n; i++) {
            animationClip.addCurveBinding(relativePath!, ComponentType, i, propertyName, curve);
          }
        } else {
          animationClip.addCurveBinding(relativePath!, ComponentType, propertyName, curve);
        }
      }
      return animationClip;
    });
  }

  private static _packSamples(
    accessors: IAccessor[],
    rawSamples: Map<number, TypedArray>,
    normalizedSamples: Map<number, TypedArray>
  ): void {
    const align = (offset: number, size: number) => Math.ceil(offset / size) * size;
    const floatBytes = Float32Array.BYTES_PER_ELEMENT;

    let byteLength = 0;
    rawSamples.forEach((values) => {
      if (values.byteLength !== values.buffer.byteLength) {
        byteLength = align(byteLength, values.BYTES_PER_ELEMENT) + values.byteLength;
      }
    });
    const normalizedOffset = align(byteLength, floatBytes);
    normalizedSamples.forEach((values) => {
      byteLength = align(byteLength, floatBytes) + values.length * floatBytes;
    });
    if (byteLength === 0) return;

    // A curve retains its clip's sample buffer through its typed views, independent of the source asset.
    const buffer = new ArrayBuffer(byteLength);
    let offset = 0;
    rawSamples.forEach((values, index) => {
      if (values.byteLength === values.buffer.byteLength) return;
      offset = align(offset, values.BYTES_PER_ELEMENT);
      const ArrayType = GLTFUtils.getComponentType(accessors[index].componentType);
      const output = new ArrayType(buffer, offset, values.length);
      output.set(values);
      rawSamples.set(index, output);
      offset += values.byteLength;
    });
    offset = normalizedOffset;
    normalizedSamples.forEach((values, index) => {
      const { componentType } = accessors[index];
      const scale = GLTFUtils.getNormalizedComponentScale(componentType);
      const output = new Float32Array(buffer, offset, values.length);
      if (componentType === AccessorComponentType.BYTE || componentType === AccessorComponentType.SHORT) {
        // Signed normalized minimum integers divide to a value below -1.
        for (let i = 0, n = values.length; i < n; i++) {
          output[i] = Math.max(-1, values[i] * scale);
        }
      } else {
        for (let i = 0, n = values.length; i < n; i++) {
          output[i] = values[i] * scale;
        }
      }
      normalizedSamples.set(index, output);
      offset += output.byteLength;
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
