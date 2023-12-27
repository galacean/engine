/**
 * @title Animation CustomBlendShape
 * @category Animation
 */
import { OrbitControl } from "@galacean/engine-toolkit";
import {
  AnimationClip,
  AnimationFloatArrayCurve,
  Animator,
  AnimatorController,
  AnimatorControllerLayer,
  AnimatorStateMachine,
  BlendShape,
  Camera,
  Keyframe,
  Logger,
  ModelMesh,
  SkinnedMeshRenderer,
  SystemInfo,
  UnlitMaterial,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { e2eReady, updateForE2E } from "./.mockForE2E";

Logger.enable();
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize(2);
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // camera
  const cameraEntity = rootEntity.createChild("cameraNode");
  cameraEntity.transform.position = new Vector3(0, 0, 5);
  cameraEntity.addComponent(Camera);
  cameraEntity.addComponent(OrbitControl);

  const meshEntity = rootEntity.createChild("meshEntity");
  const skinnedMeshRenderer = meshEntity.addComponent(SkinnedMeshRenderer);
  const modelMesh = new ModelMesh(engine);

  // Set vertices data.
  const positions = [
    new Vector3(-1.0, -1.0, 1.0),
    new Vector3(1.0, -1.0, 1.0),
    new Vector3(1.0, 1.0, 1.0),
    new Vector3(1.0, 1.0, 1.0),
    new Vector3(-1.0, 1.0, 1.0),
    new Vector3(-1.0, -1.0, 1.0)
  ];
  modelMesh.setPositions(positions);

  // Add SubMesh.
  modelMesh.addSubMesh(0, 6);

  // Add BlendShape.
  const deltaPositions = [
    new Vector3(0.0, 0.0, 0.0),
    new Vector3(0.0, 0.0, 0.0),
    new Vector3(-1.0, 0.0, 0.0),
    new Vector3(-1.0, 0.0, 0.0),
    new Vector3(1.0, 0.0, 0.0),
    new Vector3(0.0, 0.0, 0.0)
  ];
  const blendShape = new BlendShape("BlendShapeA");
  blendShape.addFrame(1.0, deltaPositions);
  modelMesh.addBlendShape(blendShape);

  skinnedMeshRenderer.mesh = modelMesh;
  skinnedMeshRenderer.setMaterial(new UnlitMaterial(engine));

  // Upload data.
  modelMesh.uploadData(false);

  const animator = meshEntity.addComponent(Animator);
  animator.animatorController = new AnimatorController();
  const layer = new AnimatorControllerLayer("base");
  animator.animatorController.addLayer(layer);
  const stateMachine = (layer.stateMachine = new AnimatorStateMachine());
  const state = stateMachine.addState("blendShape");
  const clip = (state.clip = new AnimationClip("blendShape"));

  //custom blendShape curve
  const blendShapeCurve = new AnimationFloatArrayCurve();
  const key1 = new Keyframe<Float32Array>();
  key1.time = 0;
  key1.value = new Float32Array([0]);
  const key2 = new Keyframe<Float32Array>();
  key2.time = 5;
  key2.value = new Float32Array([1]);
  blendShapeCurve.addKey(key1);
  blendShapeCurve.addKey(key2);

  clip.addCurveBinding("", SkinnedMeshRenderer, "blendShapeWeights", blendShapeCurve);
  animator.play("blendShape");
  updateForE2E(engine, 1000);
  e2eReady();
});
