import {
  AnimationClip,
  AnimationFloatArrayCurve,
  AnimationQuaternionCurve,
  AnimationVector3Curve,
  AssetPromise,
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
  IAnimation
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
    const { channels, samplers } = animationInfo;
    const { accessors, nodes, meshes } = context.glTF;
    const entities = context.get<Entity>(GLTFParserType.Entity);
    const bindings = context.get<Entity>(GLTFParserType.Scene).then(() => {
      // Cache paths after scene extensions finish and scope them to this clip
      const paths: (string | null | undefined)[] = [];
      const sceneRoots = context.glTFResource.sceneRoots;
      const samples = new Map<number, TypedArray>();
      let normalizedOutputs: Map<number, TypedArray> | undefined;
      for (let j = 0, m = channels.length; j < m; j++) {
        const {
          sampler,
          target: { node }
        } = channels[j];
        if (paths[node] === undefined) {
          let entity = entities[node];
          let path = "";
          while (entity.parent) {
            path = path === "" ? entity.name : `${entity.name}/${path}`;
            entity = entity.parent;
          }
          paths[node] = sceneRoots.indexOf(entity) === -1 ? null : path;
        }

        if (paths[node] === null) continue;
        const { input, output } = samplers[sampler];
        samples.set(input, null!);
        const outputs = accessors![output].normalized ? (normalizedOutputs ||= new Map()) : samples;
        outputs.set(output, null!);
      }
      return { paths, samples, normalizedOutputs };
    });

    return this._loadSamplerAccessors(context, animationInfo, bindings).then(
      ({ paths, samples, normalizedOutputs }) => {
        for (let j = 0, m = channels.length; j < m; j++) {
          const { sampler: samplerIndex, target } = channels[j];
          const relativePath = paths[target.node];
          if (relativePath === null) continue;

          let curve: AnimationVector3Curve | AnimationQuaternionCurve | AnimationFloatArrayCurve;
          let propertyName: string;
          switch (target.path) {
            case AnimationChannelTargetPath.TRANSLATION:
              curve = new AnimationVector3Curve();
              propertyName = "position";
              break;
            case AnimationChannelTargetPath.ROTATION:
              curve = new AnimationQuaternionCurve();
              propertyName = "rotationQuaternion";
              break;
            case AnimationChannelTargetPath.SCALE:
              curve = new AnimationVector3Curve();
              propertyName = "scale";
              break;
            case AnimationChannelTargetPath.WEIGHTS:
              curve = new AnimationFloatArrayCurve();
              propertyName = "blendShapeWeights";
              break;
          }

          const { input, output, interpolation } = samplers[samplerIndex];
          switch (interpolation) {
            case AnimationSamplerInterpolation.CubicSpine:
              curve.interpolation = InterpolationType.CubicSpine;
              break;
            case AnimationSamplerInterpolation.Step:
              curve.interpolation = InterpolationType.Step;
              break;
          }
          curve._setKeyBuffers(
            samples.get(input)!,
            normalizedOutputs?.get(output) ?? samples.get(output)!,
            curve.interpolation === InterpolationType.CubicSpine
          );

          if (target.path === AnimationChannelTargetPath.WEIGHTS) {
            const mesh = nodes![target.node].mesh;
            for (let i = 0, n = meshes![mesh!].primitives.length; i < n; i++) {
              animationClip.addCurveBinding(relativePath!, SkinnedMeshRenderer, i, propertyName, curve);
            }
          } else {
            animationClip.addCurveBinding(relativePath!, Transform, propertyName, curve);
          }
        }
        return animationClip;
      }
    );
  }

  private static _loadSamplerAccessors(
    context: GLTFParserContext,
    { channels, samplers }: IAnimation,
    bindings: AssetPromise<ClipBindings>
  ): AssetPromise<ClipBindings> {
    const { accessors, bufferViews } = context.glTF;
    const requested = new Set<number>();
    const unpacked = new Map<number, TypedArray>();
    const byView = new Map<number, { indices: number[]; data?: Uint8Array }>();
    const pending: AssetPromise<void>[] = [];

    function request(index: number): void {
      if (requested.has(index)) return;
      requested.add(index);
      const accessor = accessors![index];
      const { bufferView: viewIndex, sparse, type, componentType, normalized } = accessor;
      const byteStride = viewIndex === undefined ? undefined : bufferViews![viewIndex].byteStride;
      if (
        normalized ||
        componentType !== AccessorComponentType.FLOAT ||
        viewIndex === undefined ||
        sparse ||
        (byteStride && byteStride !== GLTFUtils.getAccessorTypeSize(type) * Float32Array.BYTES_PER_ELEMENT)
      ) {
        pending.push(
          GLTFUtils.getAccessorBuffer(context, bufferViews, accessor).then(({ data }) => {
            unpacked.set(index, data);
          })
        );
        return;
      }

      const group = byView.get(viewIndex);
      if (group) {
        group.indices.push(index);
      } else {
        byView.set(viewIndex, { indices: [index] });
      }
    }

    for (let i = 0, n = channels.length; i < n; i++) {
      const { input, output } = samplers[channels[i].sampler];
      request(input);
      request(output);
    }

    for (const [viewIndex, group] of byView) {
      pending.push(
        context.get<Uint8Array>(GLTFParserType.BufferView, viewIndex).then((view) => {
          group.data = view;
        })
      );
    }

    return AssetPromise.all([bindings, AssetPromise.all(pending)]).then(([result]) => {
      const { samples, normalizedOutputs } = result;
      for (const [index, data] of unpacked) {
        if (samples.has(index)) {
          samples.set(index, data.byteLength === data.buffer.byteLength ? data : data.slice());
        }
        if (normalizedOutputs?.has(index)) {
          const scale = GLTFUtils.getNormalizedComponentScale(accessors![index].componentType);
          const values = new Float32Array(data.length);
          for (let i = 0, n = data.length; i < n; i++) {
            // Signed normalized minimum values must clamp to -1
            values[i] = Math.max(-1, data[i] * scale);
          }
          normalizedOutputs.set(index, values);
        }
      }

      for (const { data, indices } of byView.values()) {
        const { buffer, byteOffset: viewOffset, byteLength: viewLength } = data!;
        let start = viewLength;
        let end = 0;
        let accessorBytes = 0;
        let active = 0;
        for (let i = 0, n = indices.length; i < n; i++) {
          const index = indices[i];
          if (!samples.has(index)) continue;
          indices[active++] = index;
          const { byteOffset = 0, count, type } = accessors![index];
          const byteLength = count * GLTFUtils.getAccessorTypeSize(type) * Float32Array.BYTES_PER_ELEMENT;
          start = Math.min(start, byteOffset);
          end = Math.max(end, byteOffset + byteLength);
          accessorBytes += byteLength;
        }
        if (!active) continue;

        const byteLength = end - start;
        // Retain the clip's shared range when it fits in the size of the individual copies
        const shareRange = byteLength <= accessorBytes;
        const retained =
          shareRange && byteLength !== buffer.byteLength ? buffer.slice(viewOffset + start, viewOffset + end) : buffer;
        const baseOffset = retained === buffer ? viewOffset : -start;
        for (let i = 0; i < active; i++) {
          const index = indices[i];
          const { byteOffset = 0, count, type } = accessors![index];
          const values = new Float32Array(
            retained,
            baseOffset + byteOffset,
            count * GLTFUtils.getAccessorTypeSize(type)
          );
          samples.set(index, shareRange ? values : values.slice());
        }
      }
      return result;
    });
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

interface ClipBindings {
  paths: (string | null | undefined)[];
  samples: Map<number, TypedArray>;
  normalizedOutputs?: Map<number, TypedArray>;
}
