/**
 * @title Animation Event
 * @category Animation
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*yQzHTaTZMs0AAAAAAAAAAAAADiR2AQ/original
 */
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import * as dat from "dat.gui";
import {
  AnimationEvent,
  Animator,
  Camera,
  DirectLight,
  GLTFResource,
  Script,
  SystemInfo,
  TextRenderer,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";
const gui = new dat.GUI();

async function main() {
  const engine = await WebGLEngine.create({ canvas: "canvas" });
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

  // initText
  const textEntity = rootEntity.createChild("text");
  const textRenderer = textEntity.addComponent(TextRenderer);
  textEntity.transform.setPosition(0, 2, 0);
  textRenderer.fontSize = 12;
  textRenderer.text = "";

  engine.resourceManager
    .load<GLTFResource>(
      "https://gw.alipayobjects.com/os/bmw-prod/5e3c1e4e-496e-45f8-8e05-f89f2bd5e4a4.glb"
    )
    .then((gltfResource) => {
      const { defaultSceneRoot, animations } = gltfResource;
      rootEntity.addChild(defaultSceneRoot);
      const animator = defaultSceneRoot.getComponent(Animator);

      const state = animator.findAnimatorState("walk");
      const clip = state.clip;

      const event0 = new AnimationEvent();
      event0.functionName = "event0";
      event0.time = 0.5;
      clip.addEvent(event0);

      const event1 = new AnimationEvent();
      event1.functionName = "event1";
      event1.time = clip.length;
      clip.addEvent(event1);

      defaultSceneRoot.addComponent(
        class extends Script {
          event0(): void {
            textRenderer.text = "event0 called";
          }

          event1(): void {
            textRenderer.text = "event1 called";
          }
        }
      );

      animator.play("walk", 0);

      initDatGUI(animator, animations);
    });

  engine.run();

  const initDatGUI = (animator, animations) => {
    const animationNames = animations
      .filter((clip) => !clip.name.includes("pose"))
      .map((clip) => clip.name);
    const debugInfo = {
      animation: animationNames[4],
      speed: 1,
    };

    gui.add(debugInfo, "animation", animationNames).onChange((v) => {
      textRenderer.text = "";
      animator.play(v);
    });

    gui.add(debugInfo, "speed", -1, 1).onChange((v) => {
      animator.speed = v;
    });
  };
}
main();
