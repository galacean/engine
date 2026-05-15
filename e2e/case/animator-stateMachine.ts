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
      // State-machine assembly works on the shared AnimatorStateDef assets via the controller path.
      const idleDef = stateMachine.findStateByName("idle");
      const walkDef = stateMachine.findStateByName("walk");
      const runDef = stateMachine.findStateByName("run");
      if (!idleDef || !walkDef || !runDef) {
        throw new Error("Required animator states not found: idle/walk/run");
      }
      let idleToWalkTime = 0;
      let walkToRunTime = 0;
      let runToWalkTime = 0;
      let walkToIdleTime = 0;

      // handle idle state
      const toWalkTransition = new AnimatorStateTransition();
      toWalkTransition.destinationState = walkDef;
      toWalkTransition.duration = 0.2;
      toWalkTransition.addCondition("playerSpeed", AnimatorConditionMode.Greater, 0);
      idleDef.addTransition(toWalkTransition);
      idleToWalkTime =
        //@ts-ignore
        toWalkTransition.exitTime * idleDef._getDuration() +
        //@ts-ignore
        toWalkTransition.duration * walkDef._getDuration();

      const exitTransition = idleDef.addExitTransition();
      exitTransition.addCondition("playerSpeed", AnimatorConditionMode.Equals, 0);
      // to walk state
      const toRunTransition = new AnimatorStateTransition();
      toRunTransition.destinationState = runDef;
      toRunTransition.duration = 0.3;
      toRunTransition.addCondition("playerSpeed", AnimatorConditionMode.Greater, 0.5);
      walkDef.addTransition(toRunTransition);
      walkToRunTime =
        //@ts-ignore
        (toRunTransition.exitTime - toWalkTransition.duration) * walkDef._getDuration() +
        //@ts-ignore
        toRunTransition.duration * runDef._getDuration();
      const toIdleTransition = new AnimatorStateTransition();
      toIdleTransition.destinationState = idleDef;
      toIdleTransition.duration = 0.3;
      toIdleTransition.addCondition("playerSpeed", AnimatorConditionMode.Equals, 0);
      walkDef.addTransition(toIdleTransition);
      walkToIdleTime =
        //@ts-ignore
        (toIdleTransition.exitTime - toRunTransition.duration) * walkDef._getDuration() +
        //@ts-ignore
        toIdleTransition.duration * idleDef._getDuration();

      // to run state
      const runToWalkTransition = new AnimatorStateTransition();
      runToWalkTransition.destinationState = walkDef;
      runToWalkTransition.duration = 0.3;
      runToWalkTransition.addCondition("playerSpeed", AnimatorConditionMode.Less, 0.5);
      runDef.addTransition(runToWalkTransition);
      runToWalkTime =
        //@ts-ignore
        (runToWalkTransition.exitTime - toRunTransition.duration) * runDef._getDuration() +
        //@ts-ignore
        runToWalkTransition.duration * walkDef._getDuration();

      stateMachine.addEntryStateTransition(idleDef);

      const anyTransition = stateMachine.addAnyStateTransition(idleDef);
      anyTransition.addCondition("playerSpeed", AnimatorConditionMode.Equals, 0);
      anyTransition.duration = 0.3;
      let anyToIdleTime =
        // @ts-ignore
        (anyTransition.exitTime - toIdleTransition.duration) * walkDef._getDuration() +
        // @ts-ignore
        anyTransition.duration * idleDef._getDuration();

      engine.time.maximumDeltaTime = 10000;
      updateForE2E(engine, (idleToWalkTime + walkToRunTime) * 1000, 1);
      initScreenshot(engine, camera);
    });
});
