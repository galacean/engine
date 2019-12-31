import { Logger } from "@alipay/o3-base";
import { ClearMode, DataType } from "@alipay/o3-base";
import { Engine, EngineFeature } from "@alipay/o3-core";
import { vec3 } from "@alipay/o3-math";
import { GLRenderHardware } from "@alipay/o3-rhi-webgl";
import { SceneRenderer } from "@alipay/o3-renderer-cull";
import { ResourceLoader, Resource } from "@alipay/o3-loader";
import "@alipay/o3-loader-gltf";
import { TextureFilter, TextureWrapMode } from "@alipay/o3-core";
import { AAnimation as ASkeltonAnimation } from "@alipay/o3-animation";
import { AAnimation, AAnimator, AnimationClip, AnimationType } from "@alipay/o3-animator";
import { Tween, Tweener, LOOP_TYPE, Easing, doTransform, doMaterial } from "@alipay/o3-tween";
import { ADefaultCamera } from "@alipay/o3-default-camera";
import { registerAnimationClip, parseAnimationData } from "@alipay/o3-loader-animation";
import "@alipay/o3-engine-stats";
import hatlightRenderer from "./hatlight";
import animationData from "./animation";
const { Interpolation, Skelton, AnimationComponent } = AnimationType;
//-- create engine object
console.log(animationData);
let engine = new Engine();

const tween = new Tween();

class TweenFeature extends EngineFeature {
  preTick(engine, currentScene) {
    tween.update(engine._time._deltaTime);
  }
}

Engine.registerFeature(TweenFeature);

let scene = engine.currentScene;
let rootNode = scene.root;

const resourceLoader = new ResourceLoader(engine);

//-- create camera
let cameraNode = rootNode.createChild("camera_node");

const animationRes = new Resource("pig_glb", {
  type: "gltf",
  url: "https://gw.alipayobjects.com/os/r3/43bf0cbe-17c8-4835-88ff-f28636dd2b14/pig.gltf"
});

let cameraProps = {
  RHI: GLRenderHardware,
  SceneRenderer: SceneRenderer,
  canvas: "o3-demo",
  attributes: { antialias: true, depth: true }
};
let camera = cameraNode.createAbility(ADefaultCamera, cameraProps);

cameraNode.position = [0, 1.35, 5.5];
cameraNode.lookAt(vec3.fromValues(0, 1.1, 0), vec3.fromValues(0, 1, 0));
camera.setPerspective(43.5, 480, 640, 0.1, 500);
camera.setClearMode(ClearMode.SOLID_COLOR, [0.25, 0.25, 0.25, 1.0]);

let node = rootNode.createChild("gltf_node");

// load resource config
// resourceLoader.loadConfig
resourceLoader.load(animationRes, (err, gltf) => {
  const pigPrefab = gltf.asset.rootScene.nodes[0];
  const animations = gltf.asset.animations;

  const pig = pigPrefab.clone();
  pig.rotateByAngles(0, 160, 0);

  node.addChild(pig);
  let book = pig.findChildByName("book_one");
  book.isActive = false;

  pig.createAbility(ASkeltonAnimation);

  //new Animation Test start
  const pigAnimation = pig.createAbility(AAnimation, {
    name: "pigAnimation"
  });
  // const actionMap = {}
  // animations.forEach(clip => {
  //   actionMap[clip.name] = clip
  // })
  // const ac1 = new AnimationClip('translate1', Interpolation, {
  //   value: [1, 1, 1],
  //   property: 'position',
  //   "interpolation": Easing.easeOutBounce,
  //   duration: 2000
  // })
  // const ac2 = new AnimationClip('scale2', Interpolation, {
  //   value: [2, 2, 2],
  //   property: 'scale',
  //   "interpolation": Easing.linear,
  //   duration: 2000
  // })
  // const ac3 = new AnimationClip('translate2', Interpolation, {
  //   value: [0, 0, 0],
  //   property: 'position',
  //   "interpolation": Easing.linear,
  //   duration: 2000
  // })
  // const ac4 = new AnimationClip('scale3', Interpolation, {
  //   value: [1, 1, 1],
  //   property: 'scale',
  //   "interpolation": Easing.easeInOutBounce,
  //   duration: 1000
  // })
  // const ac5 = new AnimationClip('walk', Skelton, actionMap['walk'])
  // const ac6 = new AnimationClip('dance', Skelton, actionMap['dance'])
  // animation.addAnimationClips({
  //   2000: [ac1],
  //   4000: [ac2, ac3],
  //   5000: [ac4]
  // })
  // pigAnimation.addAnimationClip(0, ac1)
  // pigAnimation.addAnimationClip(2000, ac2)
  // pigAnimation.addAnimationClip(2000, ac3)
  // pigAnimation.addAnimationClip(4000, ac4)
  // pigAnimation.addAnimationClip(1000, ac5)
  // pigAnimation.addAnimationClip(3000, ac6)

  let hatlightNode = rootNode.createChild("hatlight");
  // const hatlightRotate = hatlightNode.createAbility(hatlightRenderer, {
  //   animType: 'rotate'
  // })
  // const hatlightScale = hatlightNode.createAbility(hatlightRenderer, {
  //   animType: 'scale'
  // })
  // const ac7 = new AnimationClip('hatlightRotate', AnimationComponent, hatlightRotate)
  // const ac8 = new AnimationClip('hatlightScale', AnimationComponent, hatlightScale)

  // const hatlightAnimation = hatlightNode.createAbility(AAnimation, {
  //   name: 'hatlightAnimation'
  // });
  // hatlightAnimation.addAnimationClip(0, ac1)
  // hatlightAnimation.addAnimationClip(2000, ac2)
  // hatlightAnimation.addAnimationClip(2000, ac3)
  // hatlightAnimation.addAnimationClip(4000, ac4)
  // hatlightAnimation.addAnimationClip(0, ac7)
  // hatlightAnimation.addAnimationClip(1000, ac8)
  // const animator = rootNode.createAbility(AAnimator)
  // animator.addAnimationByStartTime(0, pigAnimation)
  // animator.addAnimationByStartTime(1000, hatlightAnimation)
  // animator.play()
  registerAnimationClip(animationData, "hatlight", hatlightRenderer);
  animations.forEach(clip => {
    registerAnimationClip(animationData, clip.name, clip);
  });

  const animator = parseAnimationData(scene, animationData);
  console.log(animator);
  animator.play();
  //new Animation Test end

  //-- show the use of general interpolation interface
  // doTransform.DataType(
  //   vec3.fromValues(0.0, 0.0, 0.0),
  //   (value) => { },
  //   vec3.fromValues(1.0, 1.0, 1.0),
  //   2000,
  //   { dataType: DataType.FLOAT_VEC3 }
  // ).start(tween);

  // doTransform.Translate(pig, [1, 1, 1], 2000, {
  //   easing: Easing.easeOutBounce,
  //   onComplete: () => {
  //     doTransform.Scale(pig, [2, 2, 2], 2000).start(tween);
  //     doTransform.Translate(pig, [0, 0, 0], 2000, {
  //       onComplete: () => {
  //         doTransform.Scale(pig, [1, 1, 1], 1000, {
  //           easing: Easing.easeInOutBounce,
  //         }).start(tween);
  //       }
  //     }).start(tween);
  //   }
  // }).start(tween);
});

// const hatlight = hatlightNode.createAbility(AGeometryRenderer, {
//   geometry: new CuboidGeometry(),
//   material: new LambertMaterial(),
// });

//-- run
engine.run();
