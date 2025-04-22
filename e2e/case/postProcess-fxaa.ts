/**
 * @title FXAA  + Bloom + Tonemapping
 * @category PostProcess
 */

import {
  Camera,
  PostProcess,
  AntiAliasing,
  BloomEffect,
  Logger,
  TonemappingEffect,
  TonemappingMode
} from "@galacean/engine";
import { initPostProcessEnv } from "./.initPostProcessEnv";

initPostProcessEnv((camera: Camera) => {
  const scene = camera.scene;

  camera.enableHDR = true;
  camera.enablePostProcess = true;
  camera.antiAliasing = AntiAliasing.FXAA;

  const globalPostProcessEntity = scene.createRootEntity("FXAA_PostProcess");
  const postProcess = globalPostProcessEntity.addComponent(PostProcess);

  const bloomEffect = postProcess.addEffect(BloomEffect);
  bloomEffect.threshold.value = 0.9;
  bloomEffect.intensity.value = 1;

  const tonemappingEffect = postProcess.addEffect(TonemappingEffect);
  tonemappingEffect.mode.value = TonemappingMode.Neutral;
});
