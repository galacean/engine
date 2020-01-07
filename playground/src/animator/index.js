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
import { AAnimation, AAnimator, AnimationClip, AnimationClipType } from "@alipay/o3-animator";
import { Tween, Tweener, LOOP_TYPE, Easing, doTransform, doMaterial } from "@alipay/o3-tween";
import { ADefaultCamera } from "@alipay/o3-default-camera";
import { registerAnimationClip, parseAnimationData } from "@alipay/o3-loader-animation";
import "@alipay/o3-engine-stats";
import hatlightRenderer from "./hatlight";
import animationData from "./animation";
import { PBRMaterial } from "@alipay/o3-pbr";
import { TextureMaterial, TransparentMaterial } from "@alipay/o3-mobile-material";
import { RegistExtension } from "@alipay/o3-loader-gltf";
import { ADirectLight } from "@alipay/o3-lighting";

RegistExtension({ PBRMaterial, TextureMaterial, TransparentMaterial });
const { Interpolation, Skelton, AnimationComponent } = AnimationClipType;
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
let light = rootNode.createChild("light");
light.createAbility(ADirectLight, {
  color: vec3.fromValues(0.4, 0.6, 0.75),
  intensity: 0.8
});
light.position = [0, 0, 1];
light.lookAt([0, 0, 0], [0, 1, 0]);
const resourceLoader = new ResourceLoader(engine);

//-- create camera
let cameraNode = rootNode.createChild("camera_node");

const animationRes = new Resource("pig_glb", {
  type: "gltf",
  url:
    "https://gw.alipayobjects.com/os/loanprod/fda2ae85-62aa-4e3a-8374-bd35d9d1aec7/5dedb526824f83c7bb20f100/7c13bc70ad85c8c84079a2f3c3df295e.gltf"
});

let cameraProps = {
  RHI: GLRenderHardware,
  SceneRenderer: SceneRenderer,
  canvas: "o3-demo",
  attributes: { antialias: true, depth: true }
};
let camera = cameraNode.createAbility(ADefaultCamera, cameraProps);

cameraNode.position = [0, 1.35, 10];
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
  pig.rotateByAngles(0, -90, 0);

  node.addChild(pig);

  // let test = pig.createAbility(ASkeltonAnimation);
  // console.log(pig.rotation);
  // animations.forEach(clip => {
  //   test.addAnimationClip(clip, clip.name);
  // });
  // test.playAnimationClip("B");
  //new Animation Test start
  const pigAnimation = pig.createAbility(AAnimation);
  const actionMap = {};
  animations.forEach(clip => {
    actionMap[clip.name] = clip;
  });
  console.log(actionMap);
  const options = {
    keyFrames: {
      "0": [
        {
          value: 0,
          property: "position",
          subProperty: "x",
          interpolation: "linear"
        }
      ],
      "2600": [
        {
          value: 0.2,
          property: "position",
          subProperty: "x",
          interpolation: "linear"
        },
        {
          value: 0.5,
          property: "position",
          subProperty: "y",
          interpolation: "linear"
        }
      ],
      "7760": [
        {
          value: 0.3,
          property: "position",
          subProperty: "x",
          interpolation: "linear"
        },
        {
          value: 0.3,
          property: "position",
          subProperty: "z",
          interpolation: "linear"
        }
      ]
    }
  };
  const ac1 = new AnimationClip("translate1", Interpolation, options);
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
  const ac5 = new AnimationClip("B", Skelton, actionMap["B"]);
  // const ac6 = new AnimationClip('dance', Skelton, actionMap['dance'])
  // animation.addAnimationClips({
  //   2000: [ac1],
  //   4000: [ac2, ac3],
  //   5000: [ac4]
  // })
  pigAnimation.addAnimationClip(0, ac1);
  pigAnimation.addAnimationClip(200, ac5);
  pigAnimation.addAnimationClip(300, ac5);
  // pigAnimation.addAnimationClip(2000, ac3)
  // pigAnimation.addAnimationClip(4000, ac4)
  // pigAnimation.addAnimationClip(1000, ac5)
  // pigAnimation.addAnimationClip(3000, ac6)
  pigAnimation.play();
  // let hatlightNode = rootNode.createChild("hatlight");
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
  // registerAnimationClip(animationData, "hatlight", hatlightRenderer);
  // animations.forEach(clip => {
  //   registerAnimationClip(animationData, clip.name, clip);
  // });

  // const animator = parseAnimationData(scene, animationData);
  // console.log(animator);
  // animator.play();
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
