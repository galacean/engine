import { AnimationClip, InterpolationType } from "@oasis-engine/core";
import { GLTFResource } from "../GLTFResource";
import { GLTFUtil } from "../GLTFUtil";
import { AnimationChannelTargetPath, AnimationSamplerInterpolation } from "../Schema";
import { EntityParser } from "./EntityParser";
import { Parser } from "./Parser";

export class AnimationParser extends Parser {
  parse(context: GLTFResource): void {
    const { gltf, buffers } = context;
    const { animations, accessors, nodes } = gltf;
    if (!animations) return;

    const animationClips: AnimationClip[] = [];

    for (let i = 0; i < animations.length; i++) {
      const gltfAnimation = animations[i];
      const { channels, samplers, name = `Animation${i}` } = gltfAnimation;

      const animationClip = new AnimationClip(name);

      let duration = -1;
      let durationIndex = -1;

      // parse samplers
      for (let i = 0; i < samplers.length; i++) {
        const gltfSampler = samplers[i];
        // input
        const inputAccessor = accessors[gltfSampler.input];
        const outputAccessor = accessors[gltfSampler.output];
        const input = GLTFUtil.getAccessorData(gltf, inputAccessor, buffers);
        const output = GLTFUtil.getAccessorData(gltf, outputAccessor, buffers);
        let outputAccessorSize = GLTFUtil.getAccessorTypeSize(outputAccessor.type);
        if (outputAccessorSize * input.length !== output.length) outputAccessorSize = output.length / input.length;

        let samplerInterpolation = InterpolationType.LINEAR;
        switch (gltfSampler.interpolation) {
          case AnimationSamplerInterpolation.CUBICSPLINE:
            samplerInterpolation = InterpolationType.CUBICSPLINE;
            break;
          case AnimationSamplerInterpolation.STEP:
            samplerInterpolation = InterpolationType.STEP;
            break;
        }
        const maxTime = input[input.length - 1];
        if (maxTime > duration) {
          duration = maxTime;
          durationIndex = i;
        }
        animationClip.addSampler(
          input as Float32Array,
          output as Float32Array,
          outputAccessorSize,
          samplerInterpolation
        );
      }

      animationClip.durationIndex = durationIndex;
      animationClip.duration = duration;

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

        animationClip.addChannel(
          sampler,
          nodes[target.node].name || `${EntityParser._defaultName}${target.node}`,
          targetPath
        );
      }

      animationClips[i] = animationClip;
    }

    context.animations = animationClips;
  }
}
