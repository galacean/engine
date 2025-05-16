/**
 * @title Bloom + HDR + ACES Tonemapping
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

  bloomEffect.threshold.value = 2.6461778006805154;
  bloomEffect.intensity.value = 10;
  bloomEffect.dirtTexture.value = dirtTexture;
  bloomEffect.dirtIntensity.value = 5;
  tonemappingEffect.mode.value = TonemappingMode.ACES;
});
