/**
 * @title Bloom + LDR + Neutral Tonemapping
 * @category PostProcess
 */
import { Camera, TonemappingMode } from "@galacean/engine";
import { initPostProcessEnv } from "./.initPostProcessEnv";

initPostProcessEnv((camera: Camera, resArray) => {
  const [_, __, dirtTexture] = resArray;
  const scene = camera.scene;

  camera.enablePostProcess = true;
  camera.enableHDR = false;
  // @ts-ignore
  const bloomEffect = scene._postProcessManager._bloomEffect;
  // @ts-ignore
  const tonemappingEffect = scene._postProcessManager._tonemappingEffect;

  bloomEffect.enabled = true;
  tonemappingEffect.enabled = true;

  bloomEffect.threshold = 0.5;
  bloomEffect.dirtTexture = dirtTexture;
  tonemappingEffect.mode = TonemappingMode.Neutral;
});
