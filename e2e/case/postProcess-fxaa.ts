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

initPostProcessEnv((camera: Camera, resArray) => {
  const [_, __, dirtTexture] = resArray;
  const scene = camera.scene;

  Logger.enable();

  camera.enableHDR = false;
  camera.enablePostProcess = true;
  camera.antiAliasing = AntiAliasing.FastApproximateAntiAliasing;

  const globalPostProcessEntity = scene.createRootEntity("FXAA_PostProcess");
  const postProcess = globalPostProcessEntity.addComponent(PostProcess);

  const bloomEffect = postProcess.addEffect(BloomEffect);
  bloomEffect.threshold.value = 0.9;
  bloomEffect.intensity.value = 1;

  const tonemappingEffect = postProcess.addEffect(TonemappingEffect);
  tonemappingEffect.mode.value = TonemappingMode.Neutral;
});
