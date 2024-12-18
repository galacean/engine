/**
 * @title Bloom + HDR + Neutral Tonemapping
 * @category PostProcess
 */
import { BloomEffect, Camera, PostProcess, TonemappingEffect, TonemappingMode } from "@galacean/engine";
import { initPostProcessEnv } from "./.initPostProcessEnv";

initPostProcessEnv((camera: Camera, resArray) => {
  const [_, __, dirtTexture] = resArray;
  const scene = camera.scene;

  camera.enablePostProcess = true;
  camera.enableHDR = true;

  const globalPostProcessEntity = scene.createRootEntity();
  const postProcess = globalPostProcessEntity.addComponent(PostProcess);
  const bloomEffect = postProcess.addEffect(BloomEffect);
  const tonemappingEffect = postProcess.addEffect(TonemappingEffect);
  tonemappingEffect.mode.value = TonemappingMode.ACES;

  bloomEffect.threshold.value = 0.5;
  bloomEffect.intensity.value = 1;
  bloomEffect.dirtTexture.value = dirtTexture;
  tonemappingEffect.mode.value = TonemappingMode.Neutral;
});
