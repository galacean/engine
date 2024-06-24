/**
 * @title Animation Reuse
 * @category Animation
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*mnVSQJk8jXgAAAAAAAAAAAAADiR2AQ/original
 */
import * as dat from "dat.gui";
import {
  Animator,
  AssetPromise,
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

  const promises: AssetPromise<GLTFResource>[] = [];
  // origin model
  promises.push(
    engine.resourceManager.load<GLTFResource>(
      "https://gw.alipayobjects.com/os/OasisHub/6f5b1918-1380-4641-a57a-7507503a524c/data.gltf"
    )
  );
  // animation
  promises.push(
    engine.resourceManager.load<GLTFResource>(
      "https://gw.alipayobjects.com/os/OasisHub/9ef53086-67d4-4be6-bff8-449a8074a5bd/data.gltf"
    )
  );

  Promise.all(promises).then((resArr) => {
    const modelGLTF = resArr[0];
    const animationGLTF = resArr[1];
    const { animations: originAnimations = [] } = modelGLTF;
    const { animations = [] } = animationGLTF;
    const { defaultSceneRoot } = modelGLTF;
    rootEntity.addChild(defaultSceneRoot);
    const animator = defaultSceneRoot.getComponent(Animator);

    const danceState =
      animator.animatorController.layers[0].stateMachine.addState("dance");
    danceState.clip = animations[0];

    animator.play("dance");

    const animationNames = originAnimations.map((clip) => clip.name);
    animationNames.push("dance");
    initDatGUI(animator, animationNames);
  });

  engine.run();

  const initDatGUI = (animator, animationNames) => {
    const debugInfo = {
      animation: animationNames[1],
      speed: 1,
    };

    gui.add(debugInfo, "animation", animationNames).onChange((v) => {
      animator.play(v);
    });

    gui.add(debugInfo, "speed", -1, 1).onChange((v) => {
      animator.speed = v;
    });
  };
});
