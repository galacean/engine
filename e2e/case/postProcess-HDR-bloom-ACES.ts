/**
 * @title Bloom + HDR + ACES Tonemapping
 * @category PostProcess
 */
import {
  BlinnPhongMaterial,
  BloomEffect,
  Camera,
  Color,
  MeshRenderer,
  PostProcess,
  PrimitiveMesh,
  RenderFace,
  TonemappingEffect,
  TonemappingMode
} from "@galacean/engine";
import { initPostProcessEnv } from "./.initPostProcessEnv";

initPostProcessEnv((camera: Camera, resArray) => {
  const [_, __, dirtTexture] = resArray;
  const scene = camera.scene;

  const material = new BlinnPhongMaterial(scene.engine);
  material.renderFace = RenderFace.Double;
  material.emissiveColor = new Color(1, 1, 1, 1);

  const entity = scene.createRootEntity().createChild("mesh");
  const { transform } = entity;
  transform.setPosition(0, 1, 0);
  transform.setRotation(45, 45, 0);
  const meshRenderer = entity.addComponent(MeshRenderer);
  meshRenderer.mesh = PrimitiveMesh.createCone(scene.engine);
  meshRenderer.setMaterial(material);

  camera.enablePostProcess = true;
  // camera.enableHDR = true;

  const globalPostProcessEntity = scene.createRootEntity();
  const postProcess = globalPostProcessEntity.addComponent(PostProcess);
  const bloomEffect = postProcess.addEffect(BloomEffect);
  const tonemappingEffect = postProcess.addEffect(TonemappingEffect);
  tonemappingEffect.mode.value = TonemappingMode.ACES;

  bloomEffect.threshold.value = 0.1;
  bloomEffect.intensity.value = 5;
  bloomEffect.tint.value = new Color(1.0, 0.0, 0.0, 1);
  // bloomEffect.dirtTexture.value = dirtTexture;
  // bloomEffect.dirtIntensity.value = 5;
  tonemappingEffect.mode.value = TonemappingMode.ACES;
});
