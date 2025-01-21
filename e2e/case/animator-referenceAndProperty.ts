/**
 * @title Animation Reference And Property
 * @category Animation
 */

import {
  AnimationClip,
  AnimationColorCurve,
  AnimationFloatCurve,
  AnimationRefCurve,
  Animator,
  AnimatorController,
  AnimatorControllerLayer,
  BlinnPhongMaterial,
  Camera,
  Color,
  DirectLight,
  Keyframe,
  Logger,
  Material,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  RenderFace,
  Transform,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { OrbitControl } from "@galacean/engine-toolkit";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

Logger.enable();
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize(2);
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // camera
  const cameraEntity = rootEntity.createChild("camera_node");
  cameraEntity.transform.position = new Vector3(0, 1, 5);
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.addComponent(OrbitControl).target = new Vector3(0, 1, 0);

  const lightNode = rootEntity.createChild("light_node");
  lightNode.addComponent(DirectLight).intensity = 0.6;
  lightNode.transform.lookAt(new Vector3(0, 0, 1));
  lightNode.transform.rotate(new Vector3(0, 90, 0));

  const material = new BlinnPhongMaterial(engine);
  material.renderFace = RenderFace.Double;
  material.baseColor = new Color(1, 0, 0, 1);

  const material2 = new PBRMaterial(engine);
  material2.renderFace = RenderFace.Double;
  material2.baseColor = new Color(0, 1, 0, 1);

  const entity = rootEntity.createChild("mesh");
  const { transform } = entity;
  transform.setPosition(0, 1, 0);
  transform.setRotation(0, 0, 0);
  const meshRenderer = entity.addComponent(MeshRenderer);
  meshRenderer.mesh = PrimitiveMesh.createCuboid(engine);
  meshRenderer.setMaterial(material);

  const animator = entity.addComponent(Animator);
  const controller = new AnimatorController(engine);
  const layer = new AnimatorControllerLayer("base");
  controller.addLayer(layer);
  const stateMachine = layer.stateMachine;
  const cubeState = stateMachine.addState("material");
  const cubeClip = (cubeState.clip = new AnimationClip("material"));

  const materialCurve = new AnimationRefCurve();
  const key1 = new Keyframe<Material>();
  key1.time = 0;
  key1.value = material;
  const key2 = new Keyframe<Material>();
  key2.time = 1;
  key2.value = material2;
  const key3 = new Keyframe<Material>();
  key3.time = 2;
  key3.value = material;
  materialCurve.addKey(key1);
  materialCurve.addKey(key2);
  materialCurve.addKey(key3);

  const colorCurve = new AnimationColorCurve();
  const key6 = new Keyframe<Color>();
  key6.time = 0;
  key6.value = new Color(1, 0, 0, 1);
  const key7 = new Keyframe<Color>();
  key7.time = 1;
  key7.value = new Color(0.5, 0.5, 0.5, 1);
  const key8 = new Keyframe<Color>();
  key8.time = 2;
  key8.value = new Color(1, 0, 0, 1);
  colorCurve.addKey(key6);
  colorCurve.addKey(key7);
  colorCurve.addKey(key8);

  const rotateCurve = new AnimationFloatCurve();
  const key9 = new Keyframe<number>();
  key9.time = 0;
  key9.value = 0;
  const key10 = new Keyframe<number>();
  key10.time = 2;
  key10.value = 360;
  rotateCurve.addKey(key9);
  rotateCurve.addKey(key10);

  cubeClip.addCurveBinding("", MeshRenderer, "getMaterial().baseColor", colorCurve);
  cubeClip.addCurveBinding("", MeshRenderer, "setMaterial($value)", "getMaterial()", materialCurve);
  cubeClip.addCurveBinding("", Transform, "rotation.y", rotateCurve);
  animator.animatorController = controller;
  animator.play("material");
  animator.speed = 0.5;

  updateForE2E(engine, 130);

  initScreenshot(engine, camera);
});
