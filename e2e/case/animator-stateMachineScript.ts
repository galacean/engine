/**
 * @title AnimatorStateScript
 * @category Animation
 */
import { OrbitControl } from "@galacean/engine-toolkit";
import {
  Animator,
  AnimatorState,
  Camera,
  Color,
  DirectLight,
  Font,
  GLTFResource,
  Logger,
  StateMachineScript,
  TextRenderer,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
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
  textRenderer.font = Font.createFromOS(engine, "AlibabaSans");
  textRenderer.text = "";

  engine.resourceManager
    .load<GLTFResource>("https://gw.alipayobjects.com/os/bmw-prod/5e3c1e4e-496e-45f8-8e05-f89f2bd5e4a4.glb")
    .then((gltfResource) => {
      const { animations = [], defaultSceneRoot } = gltfResource;
      rootEntity.addChild(defaultSceneRoot);

      const animator = defaultSceneRoot.getComponent(Animator);
      const state = animator.findAnimatorState("walk");

      state.addStateMachineScript(
        class extends StateMachineScript {
          onStateEnter(animator: Animator, animatorState: AnimatorState, layerIndex: number): void {
            textRenderer.text = "0";
            console.log("onStateEnter: ", animatorState);
          }

          onStateUpdate(animator: Animator, animatorState: AnimatorState, layerIndex: number): void {
            console.log("onStateUpdate: ", animatorState);
          }

          onStateExit(animator: Animator, animatorState: AnimatorState, layerIndex: number): void {
            textRenderer.text = "1";
            console.log("onStateExit: ", animatorState);
          }
        }
      );

      animator.play("walk");

      updateForE2E(engine, 30);
      animator.crossFade("run", 0.5, 0, 0);
      updateForE2E(engine, 100);

      initScreenshot(engine, camera);
    });
});
