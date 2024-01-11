/**
 * @title Animation Reuse
 * @category Animation
 */
import {
  Animator,
  AssetPromise,
  Camera,
  DirectLight,
  GLTFResource,
  Logger,
  SystemInfo,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { OrbitControl } from "@galacean/engine-toolkit";
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

    const danceState = animator.animatorController.layers[0].stateMachine.addState("dance");
    danceState.clip = animations[0];

    animator.play("dance");

    const animationNames = originAnimations.map((clip) => clip.name);
    animationNames.push("dance");
    updateForE2E(engine);
    const category = "Animator";
    const name = "animator-reuse";
    initScreenshot(category, name, engine, camera);
  });
});
