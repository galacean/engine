import { AnimationClip, InterpolationType } from "@oasis-engine/core";
import { GLTFResource } from "../GLTFResource";
import { GLTFUtil } from "../GLTFUtil";
import { AnimationChannelTargetPath, AnimationSamplerInterpolation } from "../Schema";
import { EntityParser } from "./EntityParser";
import { AnimationClipParser } from "./AnimationClipParser";
import { Parser } from "./Parser";

export class AnimationParser extends Parser {
  parse(context: GLTFResource): void {
    const { gltf, buffers, entities } = context;
    const { animations, accessors, nodes } = gltf;
    if (!animations) return;

    const animationClips: AnimationClip[] = [];

    for (let i = 0; i < animations.length; i++) {
      const gltfAnimation = animations[i];
      const { channels, samplers, name = `AnimationClip${i}` } = gltfAnimation;

      const animationClipParser = new AnimationClipParser();

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

        let samplerInterpolation;
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
        animationClipParser.addSampler(
          input as Float32Array,
          output as Float32Array,
          outputAccessorSize,
          samplerInterpolation
        );
      }

      for (let i = 0; i < channels.length; i++) {
        const { target, sampler } = channels[i];
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
        let path = channelTargetEntity.name;
        let parent = channelTargetEntity.parent;
        while (parent) {
          path = `${parent.name}/${path};`;
          parent = parent.parent;
        }
        animationClipParser.addChannel(sampler, path, targetPath);
      }
      const curveDatas = animationClipParser.getCurveDatas();
      const animationClip = new AnimationClip(name);
      curveDatas.forEach((curveData) => {
        animationClip.setCurve(curveData.relativePath, curveData.type, curveData.propertyName, curveData.curve);
      });
      animationClips[i] = animationClip;
    }
    context.animations = animationClips;
  }
}
