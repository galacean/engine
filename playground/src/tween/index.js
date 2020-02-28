import { Logger } from "@alipay/o3-base";
import { ClearMode, DataType } from "@alipay/o3-base";
import { Engine, EngineFeature } from "@alipay/o3-core";
import { vec3 } from "@alipay/o3-math";
import { GLRenderHardware } from "@alipay/o3-rhi-webgl";
import { SceneRenderer } from "@alipay/o3-renderer-cull";
import { ResourceLoader, Resource } from "@alipay/o3-loader";
import "@alipay/o3-loader-gltf";
import { TextureFilter, TextureWrapMode } from "@alipay/o3-core";
import { AAnimation } from "@alipay/o3-animation";
import { Tween, Tweener, LOOP_TYPE, Easing, doTransform, doMaterial } from "@alipay/o3-tween";
import { ADefaultCamera } from "@alipay/o3-default-camera";

import "@alipay/o3-engine-stats";

//-- create engine object
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

  const animator = pig.createAbility(AAnimation);

  animations.forEach(clip => {
    animator.addAnimationClip(clip, clip.name);
  });

  animator.playAnimationClip("walk");

  //-- show the use of general interpolation interface
  doTransform
    .DataType(
      vec3.fromValues(0.0, 0.0, 0.0),
      value => {
        console.log(value);
      },
      vec3.fromValues(1.0, 1.0, 1.0),
      2000,
      { dataType: DataType.FLOAT_VEC3 }
    )
    .start(tween);

  doTransform
    .Translate(pig, [1, 1, 1], 2000, {
      easing: Easing.easeOutBounce,
      onComplete: () => {
        doTransform.Scale(pig, [2, 2, 2], 2000).start(tween);
        doTransform
          .Translate(pig, [0, 0, 0], 2000, {
            onComplete: () => {
              doTransform
                .Scale(pig, [1, 1, 1], 1000, {
                  easing: Easing.easeInOutBounce
                })
                .start(tween);
            }
          })
          .start(tween);
      }
    })
    .start(tween);
});

//-- run
engine.run();
