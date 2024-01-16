/**
 * @title Animation Event
 * @category Animation
 */
import { OrbitControl } from "@galacean/engine-toolkit";
import * as dat from "dat.gui";
import {
  AnimationEvent,
  Animator,
  Camera,
  DirectLight,
  Font,
  GLTFResource,
  Script,
  TextRenderer,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";
import { E2E_CONFIG } from "../config";

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
            textRenderer.text = "0";
          }

          event1(): void {
            textRenderer.text = "1";
          }
        }
      );

      animator.play("walk", 0);

      updateForE2E(engine, 500);

      const { category, caseFileName } = E2E_CONFIG["animator-event"];
      initScreenshot(category, caseFileName, engine, camera);
    });
});
