/**
 * @title Bloom + LDR + Neutral Tonemapping
 * @category PostProcess
 */
import { BloomEffect, Camera, PostProcess, TonemappingEffect, TonemappingMode } from "@galacean/engine";
import { initPostProcessEnv } from "./.initPostProcessEnv";

initPostProcessEnv((camera: Camera, resArray) => {
  const [_, __, dirtTexture] = resArray;
  const scene = camera.scene;

  camera.enablePostProcess = true;
  camera.enableHDR = false;

  const globalPostProcessEntity = scene.createRootEntity();
  const postProcess = globalPostProcessEntity.addComponent(PostProcess);
  const bloomEffect = postProcess.addEffect(BloomEffect);
  const tonemappingEffect = postProcess.addEffect(TonemappingEffect);
  tonemappingEffect.mode = TonemappingMode.ACES;

  bloomEffect.threshold = 0.5;
  bloomEffect.intensity = 1;
  bloomEffect.dirtTexture = dirtTexture;
  tonemappingEffect.mode = TonemappingMode.Neutral;
});
