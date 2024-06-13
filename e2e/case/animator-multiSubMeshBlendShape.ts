/**
 * @title Animation MultiSubMeshBlendShape
 * @category Animation
 */
import {
  Animator,
  Camera,
  DirectLight,
  Logger,
  SkinnedMeshRenderer,
  SystemInfo,
  Vector3,
  WebGLEngine,
  GLTFResource,
  Keyframe,
  AnimatorController,
  AnimatorControllerLayer,
  AnimatorStateMachine,
  AnimationClip,
  AnimationFloatArrayCurve
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

Logger.enable();
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.width = window.innerWidth * SystemInfo.devicePixelRatio;
  engine.canvas.height = window.innerHeight * SystemInfo.devicePixelRatio;
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // camera
  const cameraEntity = rootEntity.createChild("camera_node");
  cameraEntity.transform.position = new Vector3(0, 1.5, 1);
  const camera = cameraEntity.addComponent(Camera);

  const lightNode = rootEntity.createChild("light_node");
  lightNode.addComponent(DirectLight).intensity = 1.0;
  lightNode.transform.lookAt(new Vector3(0, 0, 1));
  lightNode.transform.rotate(new Vector3(-45, -135, 0));

  engine.resourceManager
    .load<GLTFResource>(
      "https://mdn.alipayobjects.com/oasis_be/afts/file/A*M_orSIoXP-QAAAAAAAAAAAAADkp5AQ/258To52bs_01.glb"
    )
    .then((asset) => {
      const { defaultSceneRoot } = asset;
      rootEntity.addChild(defaultSceneRoot);
      const entity = defaultSceneRoot;
      defaultSceneRoot.transform.rotation = new Vector3(-90, -0, 0);
      const animator = entity.addComponent(Animator);

      animator.animatorController = new AnimatorController();
      const layer = new AnimatorControllerLayer("base");
      animator.animatorController.addLayer(layer);
      const stateMachine = (layer.stateMachine = new AnimatorStateMachine());
      const state = stateMachine.addState("blendShape");
      const clip = (state.clip = new AnimationClip("blendShape"));

      //custom blendShape curve
      const blendShapeCurve = new AnimationFloatArrayCurve();
      let key1 = new Keyframe<Float32Array>();
      key1.time = 0;
      let array1 = new Float32Array(52);
      for (let i = 0; i < array1.length; i++) {
        array1[i] = 0;
        if (i == 8) {
          array1[i] = 0;
        }
      }
      key1.value = array1;

      let key2 = new Keyframe<Float32Array>();
      key2.time = 0.5;
      let array2 = new Float32Array(52);
      for (let i = 0; i < array2.length; i++) {
        array2[i] = 0;
        if (i == 8) {
          array2[i] = 1;
        }
      }
      key2.value = array2;

      let key3 = new Keyframe<Float32Array>();
      key3.time = 1;
      let array3 = new Float32Array(52);
      for (let i = 0; i < array3.length; i++) {
        array3[i] = 0;
        if (i == 8) {
          array3[i] = 0;
        }
      }
      key3.value = array3;

      blendShapeCurve.addKey(key1);
      blendShapeCurve.addKey(key2);
      blendShapeCurve.addKey(key3);
      const skinMeshRenders = entity.getComponentsIncludeChildren<SkinnedMeshRenderer>(SkinnedMeshRenderer, []);

      for (let i = 0, n = skinMeshRenders.length; i < n; i++) {
        clip.addCurveBinding("", SkinnedMeshRenderer, i, "blendShapeWeights", blendShapeCurve);
      }
      animator.play("blendShape");

      updateForE2E(engine, 500);

      initScreenshot(engine, camera);
    });
});
