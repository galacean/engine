/**
 * @title AnimatorStateMachine
 * @category Animation
 */
import {
  Animator,
  AnimatorConditionMode,
  AnimatorStateTransition,
  Camera,
  Color,
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
  lightNode.addComponent(DirectLight).color = new Color(
    0.31854677812509186,
    0.31854677812509186,
    0.31854677812509186,
    1
  );
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
      let idleToWalkTime = 0;
      let walkToRunTime = 0;
      let runToWalkTime = 0;
      let walkToIdleTime = 0;

      // handle idle state
      const toWalkTransition = new AnimatorStateTransition();
      toWalkTransition.destinationState = walkState;
      toWalkTransition.duration = 0.2;
      toWalkTransition.addCondition("playerSpeed", AnimatorConditionMode.Greater, 0);
      idleState.addTransition(toWalkTransition);
      idleToWalkTime =
        //@ts-ignore
        toWalkTransition.exitTime * idleState._getDuration() + toWalkTransition.duration * walkState._getDuration();

      const exitTransition = idleState.addExitTransition();
      exitTransition.addCondition("playerSpeed", AnimatorConditionMode.Equals, 0);
      // to walk state
      const toRunTransition = new AnimatorStateTransition();
      toRunTransition.destinationState = runState;
      toRunTransition.duration = 0.3;
      toRunTransition.addCondition("playerSpeed", AnimatorConditionMode.Greater, 0.5);
      walkState.addTransition(toRunTransition);
      walkToRunTime =
        //@ts-ignore
        (toRunTransition.exitTime - toWalkTransition.duration) * walkState._getDuration() +
        //@ts-ignore
        toRunTransition.duration * runState._getDuration();
      const toIdleTransition = new AnimatorStateTransition();
      toIdleTransition.destinationState = idleState;
      toIdleTransition.duration = 0.3;
      toIdleTransition.addCondition("playerSpeed", AnimatorConditionMode.Equals, 0);
      walkState.addTransition(toIdleTransition);
      walkToIdleTime =
        //@ts-ignore
        (toIdleTransition.exitTime - toRunTransition.duration) * walkState._getDuration() +
        //@ts-ignore
        toIdleTransition.duration * idleState._getDuration();

      // to run state
      const RunToWalkTransition = new AnimatorStateTransition();
      RunToWalkTransition.destinationState = walkState;
      RunToWalkTransition.duration = 0.3;
      RunToWalkTransition.addCondition("playerSpeed", AnimatorConditionMode.Less, 0.5);
      runState.addTransition(RunToWalkTransition);
      runToWalkTime =
        //@ts-ignore
        (RunToWalkTransition.exitTime - toRunTransition.duration) * runState._getDuration() +
        //@ts-ignore
        RunToWalkTransition.duration * walkState._getDuration();

      stateMachine.addEntryStateTransition(idleState);

      const anyTransition = stateMachine.addAnyStateTransition(idleState);
      anyTransition.addCondition("playerSpeed", AnimatorConditionMode.Equals, 0);
      anyTransition.duration = 0.3;
      let anyToIdleTime =
        // @ts-ignore
        (anyTransition.exitTime - toIdleTransition.duration) * walkState._getDuration() +
        // @ts-ignore
        anyTransition.duration * idleState._getDuration();

      engine.time.maximumDeltaTime = 10000;
      updateForE2E(engine, (idleToWalkTime + walkToRunTime) * 1000, 1);
      initScreenshot(engine, camera);
    });
});
