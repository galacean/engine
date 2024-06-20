/**
 * @title AnimatorStateMachine
 * @category Animation
 */
import {
  Animator,
  AnimatorConditionMode,
  AnimatorStateTransition,
  Camera,
  DirectLight,
  GLTFResource,
  SystemInfo,
  TextRenderer,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.width = window.innerWidth * SystemInfo.devicePixelRatio;
  engine.canvas.height = window.innerHeight * SystemInfo.devicePixelRatio;
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // camera
  const cameraEntity = rootEntity.createChild("camera_node");
  cameraEntity.transform.position = new Vector3(0, 1, 5);
  const camera = cameraEntity.addComponent(Camera);

  const lightNode = rootEntity.createChild("light_node");
  lightNode.addComponent(DirectLight).intensity = 0.6;
  lightNode.transform.lookAt(new Vector3(0, 0, 1));
  lightNode.transform.rotate(new Vector3(0, 90, 0));

  // initText
  const textEntity = rootEntity.createChild("text");
  const textRenderer = textEntity.addComponent(TextRenderer);
  textEntity.transform.setPosition(0, 2, 0);
  textRenderer.fontSize = 12;
  textRenderer.text = "";

  engine.resourceManager
    .load<GLTFResource>("https://gw.alipayobjects.com/os/bmw-prod/5e3c1e4e-496e-45f8-8e05-f89f2bd5e4a4.glb")
    .then((gltfResource) => {
      const { animations = [], defaultSceneRoot } = gltfResource;
      rootEntity.addChild(defaultSceneRoot);

      const animator = defaultSceneRoot.getComponent(Animator)!;
      animator.animatorController.addParameter("playerSpeed", 1);
      const stateMachine = animator.animatorController.layers[0].stateMachine;
      const idleState = animator.findAnimatorState("idle");
      const walkState = animator.findAnimatorState("walk");
      const runState = animator.findAnimatorState("run");
      {
        // handle idle state
        const toWalkTransition = new AnimatorStateTransition();
        toWalkTransition.destinationState = walkState;
        toWalkTransition.exitTime = 0.5;
        toWalkTransition.duration = 0.3;
        toWalkTransition.addCondition(AnimatorConditionMode.Greater, "playerSpeed", 0);
        idleState.addTransition(toWalkTransition);

        const exitTransition = new AnimatorStateTransition();
        exitTransition.isExit = true;
        exitTransition.addCondition(AnimatorConditionMode.Equals, "playerSpeed", 0);
        idleState.addTransition(exitTransition);
      }
      {
        // handle walk state
        const toRunTransition = new AnimatorStateTransition();
        toRunTransition.destinationState = runState;
        toRunTransition.duration = 0.3;
        toRunTransition.addCondition(AnimatorConditionMode.Greater, "playerSpeed", 0.5);
        walkState.addTransition(toRunTransition);

        const toIdleTransition = new AnimatorStateTransition();
        toIdleTransition.destinationState = idleState;
        toIdleTransition.duration = 0.3;
        toIdleTransition.addCondition(AnimatorConditionMode.Equals, "playerSpeed", 0);
        walkState.addTransition(toIdleTransition);
      }
      {
        // handle run state
        const toWalkTransition = new AnimatorStateTransition();
        toWalkTransition.destinationState = walkState;
        toWalkTransition.duration = 0.3;
        toWalkTransition.addCondition(AnimatorConditionMode.Less, "playerSpeed", 0.5);
        runState.addTransition(toWalkTransition);
      }

      stateMachine.addEntryStateTransition(idleState);

      const anyTransition = stateMachine.addAnyStateTransition(idleState);
      anyTransition.addCondition(AnimatorConditionMode.Equals, "playerSpeed", 0);
      anyTransition.duration = 0.3;

      updateForE2E(engine, 500);

      initScreenshot(engine, camera);
    });
});
