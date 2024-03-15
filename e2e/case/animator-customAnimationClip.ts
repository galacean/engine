/**
 * @title Animation CustomAnimationClip
 * @category Animation
 */
import {
  AnimationClip,
  AnimationColorCurve,
  AnimationFloatCurve,
  AnimationVector3Curve,
  Animator,
  AnimatorController,
  AnimatorControllerLayer,
  AnimatorStateMachine,
  Camera,
  Color,
  DirectLight,
  GLTFResource,
  Keyframe,
  Logger,
  SpotLight,
  Transform,
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
  const cameraWrap = rootEntity.createChild("camera_wrap");
  const cameraEntity = cameraWrap.createChild("camera");
  cameraEntity.transform.position = new Vector3(0, 3, 8);
  cameraEntity.transform.rotation = new Vector3(-2, 0, 0);
  const camera = cameraEntity.addComponent(Camera);

  const lightWrap = rootEntity.createChild("light_wrap");

  const directLightEntity = lightWrap.createChild("light_node");
  const directLight = directLightEntity.addComponent(DirectLight);
  directLight.intensity = 0.6;
  directLightEntity.transform.lookAt(new Vector3(0, 0, 1));
  directLightEntity.transform.rotate(new Vector3(0, 90, 0));

  const spotLightEntity = lightWrap.createChild("spotLight1");
  const spotLightEntity2 = spotLightEntity.clone();
  spotLightEntity2.name = "spotLight2";
  spotLightEntity2.transform.setRotation(-120, 0, 0);
  lightWrap.addChild(spotLightEntity2);

  const spotLight = spotLightEntity.addComponent(SpotLight);
  spotLight.angle = Math.PI / 60;
  spotLightEntity.transform.setPosition(0, 8, 0);
  spotLightEntity.transform.setRotation(-60, 0, 0);
  const spotLight2 = spotLightEntity2.addComponent(SpotLight);
  spotLight2.angle = Math.PI / 60;
  spotLightEntity2.transform.setPosition(0, 8, 0);
  spotLightEntity2.transform.setRotation(-60, 0, 0);

  engine.resourceManager
    .load<GLTFResource>("https://gw.alipayobjects.com/os/OasisHub/244228a7-361c-4c63-a790-dd9e19d12e78/data.gltf")
    .then((gltfResource) => {
      const { defaultSceneRoot, animations = [] } = gltfResource;
      rootEntity.addChild(defaultSceneRoot);
      const animator = defaultSceneRoot.getComponent(Animator);

      const sceneAnimator = rootEntity.addComponent(Animator);
      sceneAnimator.animatorController = new AnimatorController();
      const layer = new AnimatorControllerLayer("base");
      sceneAnimator.animatorController.addLayer(layer);
      const stateMachine = (layer.stateMachine = new AnimatorStateMachine());
      const sceneState = stateMachine.addState("sceneAnim");
      const sceneClip = (sceneState.clip = new AnimationClip("sceneAnim"));

      //custom rotate curve
      const rotateCurve = new AnimationVector3Curve();
      const key1 = new Keyframe<Vector3>();
      key1.time = 0;
      key1.value = new Vector3(0, 0, 0);
      const key2 = new Keyframe<Vector3>();
      key2.time = 15;
      key2.value = new Vector3(0, 360, 0);
      rotateCurve.addKey(key1);
      rotateCurve.addKey(key2);

      //custom color curve
      const colorCurve = new AnimationColorCurve();
      const key3 = new Keyframe<Color>();
      key3.time = 0;
      key3.value = new Color(1, 0, 0, 1);
      const key4 = new Keyframe<Color>();
      key4.time = 5;
      key4.value = new Color(0, 1, 0, 1);
      const key5 = new Keyframe<Color>();
      key5.time = 10;
      key5.value = new Color(0, 0, 1, 1);
      const key6 = new Keyframe<Color>();
      key6.time = 15;
      key6.value = new Color(1, 0, 0, 1);
      colorCurve.addKey(key3);
      colorCurve.addKey(key4);
      colorCurve.addKey(key5);
      colorCurve.addKey(key6);

      const color2Curve = new AnimationColorCurve();
      const key16 = new Keyframe<Color>();
      key16.time = 0;
      key16.value = new Color(0, 0, 1, 1);
      const key17 = new Keyframe<Color>();
      key17.time = 5;
      key17.value = new Color(0, 1, 0, 1);
      const key18 = new Keyframe<Color>();
      key18.time = 10;
      key18.value = new Color(1, 0, 0, 1);
      const key19 = new Keyframe<Color>();
      key19.time = 15;
      key19.value = new Color(0, 0, 1, 1);
      color2Curve.addKey(key16);
      color2Curve.addKey(key17);
      color2Curve.addKey(key18);
      color2Curve.addKey(key19);

      //custom fov curve
      const fovCurve = new AnimationFloatCurve();
      const key7 = new Keyframe<number>();
      key7.time = 0;
      key7.value = 45;
      const key8 = new Keyframe<number>();
      key8.time = 8;
      key8.value = 80;
      const key9 = new Keyframe<number>();
      key9.time = 15;
      key9.value = 45;

      fovCurve.addKey(key7);
      fovCurve.addKey(key8);
      fovCurve.addKey(key9);

      //custom spotLight1 rotate curve
      const spotLight1RotateCurve = new AnimationVector3Curve();
      const key10 = new Keyframe<Vector3>();
      key10.time = 0;
      key10.value = new Vector3(-60, 0, 0);
      const key11 = new Keyframe<Vector3>();
      key11.time = 10;
      key11.value = new Vector3(-120, 0, 0);
      const key12 = new Keyframe<Vector3>();
      key12.time = 15;
      key12.value = new Vector3(-60, 0, 0);
      spotLight1RotateCurve.addKey(key10);
      spotLight1RotateCurve.addKey(key11);
      spotLight1RotateCurve.addKey(key12);

      //custom spotLight2 rotate curve
      const spotLight2RotateCurve = new AnimationVector3Curve();
      const key13 = new Keyframe<Vector3>();
      key13.time = 0;
      key13.value = new Vector3(-120, 0, 0);
      const key14 = new Keyframe<Vector3>();
      key14.time = 10;
      key14.value = new Vector3(-60, 0, 0);
      const key15 = new Keyframe<Vector3>();
      key15.time = 15;
      key15.value = new Vector3(-120, 0, 0);
      spotLight2RotateCurve.addKey(key13);
      spotLight2RotateCurve.addKey(key14);
      spotLight2RotateCurve.addKey(key15);

      sceneClip.addCurveBinding("/light_wrap/spotLight1", SpotLight, "color", colorCurve);
      sceneClip.addCurveBinding("/light_wrap/spotLight1", Transform, "rotation", spotLight1RotateCurve);
      sceneClip.addCurveBinding("/light_wrap/spotLight2", Transform, "rotation", spotLight2RotateCurve);
      sceneClip.addCurveBinding("/light_wrap/spotLight2", SpotLight, "color", color2Curve);
      sceneClip.addCurveBinding("/light_wrap", Transform, "rotation", rotateCurve);
      // curve can be reused
      sceneClip.addCurveBinding("/camera_wrap", Transform, "rotation", rotateCurve);
      sceneClip.addCurveBinding("/camera_wrap/camera", Camera, "fieldOfView", fovCurve);

      sceneAnimator.play("sceneAnim", 0);
      animator.play(animations[0].name, 0);

      updateForE2E(engine, 500);

      initScreenshot(engine, camera);
    });
});
