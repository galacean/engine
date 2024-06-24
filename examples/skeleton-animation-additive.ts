/**
 * @title Animation Additive
 * @category Animation
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*2pFrR6RUdrYAAAAAAAAAAAAADiR2AQ/original
 */
import * as dat from "dat.gui";
import {
  Animator,
  AnimatorControllerLayer,
  AnimatorLayerBlendingMode,
  AnimatorStateMachine,
  Camera,
  DirectLight,
  GLTFResource,
  Logger,
  SystemInfo,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";
import { OrbitControl } from "@galacean/engine-toolkit-controls";

const gui = new dat.GUI();

Logger.enable();

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.width = window.innerWidth * SystemInfo.devicePixelRatio;
  engine.canvas.height = window.innerHeight * SystemInfo.devicePixelRatio;
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // camera
  const cameraEntity = rootEntity.createChild("camera_node");
  cameraEntity.transform.position = new Vector3(0, 1, 5);
  cameraEntity.addComponent(Camera);
  cameraEntity.addComponent(OrbitControl).target = new Vector3(0, 1, 0);

  const lightNode = rootEntity.createChild("light_node");
  lightNode.addComponent(DirectLight).intensity = 0.6;
  lightNode.transform.lookAt(new Vector3(0, 0, 1));
  lightNode.transform.rotate(new Vector3(0, 90, 0));

  engine.resourceManager
    .load<GLTFResource>(
      "https://gw.alipayobjects.com/os/bmw-prod/5e3c1e4e-496e-45f8-8e05-f89f2bd5e4a4.glb"
    )
    .then((gltfResource) => {
      const { animations = [], defaultSceneRoot } = gltfResource;
      const animator = defaultSceneRoot.getComponent(Animator);
      const { animatorController } = animator;

      const animatorStateMachine = new AnimatorStateMachine();
      const additiveLayer = new AnimatorControllerLayer("additiveLayer");
      additiveLayer.stateMachine = animatorStateMachine;
      additiveLayer.blendingMode = AnimatorLayerBlendingMode.Additive;
      animatorController.addLayer(additiveLayer);

      const additivePoseNames = animations
        .filter((clip) => clip.name.includes("pose"))
        .map((clip) => clip.name);

      additivePoseNames.forEach((name) => {
        const clip = animator.findAnimatorState(name).clip;
        const newState = animatorStateMachine.addState(name);
        newState.clipStartTime = 1;
        newState.clip = clip;
      });

      rootEntity.addChild(defaultSceneRoot);

      animator.play("walk", 0);
      animator.play("sad_pose", 1);

      initDatGUI(animator, animations, additiveLayer);
    });

  engine.run();

  const initDatGUI = (animator, animations, additiveLayer) => {
    const animationNames = animations
      .filter((clip) => !clip.name.includes("pose"))
      .map((clip) => clip.name);
    const additivePoseNames = animations
      .filter((clip) => clip.name.includes("pose"))
      .map((clip) => clip.name);

    const debugInfo = {
      animation: animationNames[4],
      additive_pose: additivePoseNames[0],
      additive_weight: 1,
      speed: 1,
    };

    gui.add(debugInfo, "animation", animationNames).onChange((v) => {
      animator.play(v, 0);
    });

    gui.add(debugInfo, "additive_pose", additivePoseNames).onChange((v) => {
      animator.play(v, 1);
    });

    gui.add(debugInfo, "additive_weight", 0, 1).onChange((v) => {
      additiveLayer.weight = v;
    });

    gui.add(debugInfo, "speed", -1, 1).onChange((v) => {
      animator.speed = v;
    });
  };
});
