/**
 * @title AnimatorStateScript
 * @category Animation
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*XA6qQozlnUwAAAAAAAAAAAAADiR2AQ/original
 */
import {
  Animator,
  AnimatorState,
  Camera,
  Color,
  DirectLight,
  GLTFResource,
  Logger,
  StateMachineScript,
  SystemInfo,
  TextRenderer,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import * as dat from "dat.gui";
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

      const animator = defaultSceneRoot.getComponent(Animator);
      const state = animator.findAnimatorState("walk");

      state.addStateMachineScript(
        class extends StateMachineScript {
          onStateEnter(animator: Animator, animatorState: AnimatorState, layerIndex: number): void {
            textRenderer.text = "onStateEnter";
            console.log("onStateEnter: ", animatorState);
          }

          onStateUpdate(animator: Animator, animatorState: AnimatorState, layerIndex: number): void {
            console.log("onStateUpdate: ", animatorState);
          }

          onStateExit(animator: Animator, animatorState: AnimatorState, layerIndex: number): void {
            textRenderer.text = "onStateExit";
            console.log("onStateExit: ", animatorState);
          }
        }
      );

      animator.play("walk");

      initDatGUI(animator, animations);
    });

  engine.run();

  const initDatGUI = (animator: Animator, animations) => {
    const animationNames = animations.filter((clip) => !clip.name.includes("pose")).map((clip) => clip.name);
    const debugInfo = {
      animation: animationNames[4],
      speed: 1
    };

    gui.add(debugInfo, "animation", animationNames).onChange((v) => {
      animator.crossFade(v, 0.5);
    });

    gui.add(debugInfo, "speed", -1, 1).onChange((v) => {
      animator.speed = v;
    });
  };
});
