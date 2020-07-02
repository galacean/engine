import { AAnimation, AAnimator, AnimationClip, AnimationClipType } from "@alipay/o3-animator";
import { ClearMode } from "@alipay/o3-base";
import { Engine, EngineFeature } from "@alipay/o3-core";
import { ADefaultCamera } from "@alipay/o3-default-camera";
import "@alipay/o3-engine-stats";
import { AGeometryRenderer } from "@alipay/o3-geometry";
import { CuboidGeometry } from "@alipay/o3-geometry-shape";
import { ADirectLight } from "@alipay/o3-lighting";
import { Resource, ResourceLoader } from "@alipay/o3-loader";
import "@alipay/o3-loader-gltf";
import { RegistExtension } from "@alipay/o3-loader-gltf";
import { vec3 } from "@alipay/o3-math";
import { LambertMaterial, TextureMaterial, TransparentMaterial } from "@alipay/o3-mobile-material";
import { PBRMaterial } from "@alipay/o3-pbr";
import { SceneRenderer } from "@alipay/o3-renderer-cull";
import { GLRenderHardware } from "@alipay/o3-rhi-webgl";
import { Tween } from "@alipay/o3-tween";
RegistExtension({ PBRMaterial, TextureMaterial, TransparentMaterial });
const { Interpolation, Skeleton, AnimationComponent } = AnimationClipType;
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

const animationRes = new Resource("model_glb", {
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
  const modelPrefab = gltf.asset.rootScene.nodes[0];
  const animations = gltf.asset.animations;

  const model = modelPrefab.clone();
  model.rotateByAngles(0, -90, 0);

  node.addChild(model);
  let cubeNode = rootNode.createChild("cube_node");
  let cube = cubeNode.createAbility(AGeometryRenderer, {
    geometry: new CuboidGeometry(),
    material: new LambertMaterial("")
  });
  cubeNode.position = [-2, 0, 0];
  const modelAnimation = model.createAbility(AAnimation, {
    duration: 4000
  });
  const cubeAnimation = cubeNode.createAbility(AAnimation, {
    duration: 1000
  });
  const actionMap = {};
  animations.forEach((clip) => {
    actionMap[clip.name] = clip;
  });
  const options = {
    keyframes: {
      "0": [
        {
          value: 0,
          property: "position",
          subProperty: "y",
          interpolation: "0,0,1,1"
        }
      ],
      "1000": [
        {
          value: 1,
          property: "position",
          subProperty: "y",
          interpolation: "0,0,1,1"
        }
      ],
      "2000": [
        {
          value: 0,
          property: "position",
          subProperty: "y",
          interpolation: "0,0,1,1"
        }
      ],
      "3000": [
        {
          value: -1,
          property: "position",
          subProperty: "y",
          interpolation: "0,0,1,1"
        }
      ],
      "4000": [
        {
          value: 0,
          property: "position",
          subProperty: "y",
          interpolation: "0,0,1,1"
        }
      ]
    }
  };
  const options2 = {
    keyframes: {
      "0": [
        {
          value: 0,
          property: "rotation",
          subProperty: "y",
          interpolation: "0,0,1,1"
        }
      ],
      "4000": [
        {
          value: 360,
          property: "rotation",
          subProperty: "y",
          interpolation: "0,0,1,1"
        }
      ]
    }
  };
  // const options2 = {
  //   keyframes: {
  //     "0": [
  //       {
  //         value: 0,
  //         property: "position",
  //         subProperty: "y",
  //         interpolation: "0,0,1,1"
  //       }
  //     ],
  //     "1000": [
  //       {
  //         value: 1,
  //         property: "position",
  //         subProperty: "y",
  //         interpolation: "0,0,1,1"
  //       }
  //     ],
  //     "2000": [
  //       {
  //         value: 0,
  //         property: "position",
  //         subProperty: "y",
  //         interpolation: "0,0,1,1"
  //       }
  //     ],
  //     "3000": [
  //       {
  //         value: -1,
  //         property: "position",
  //         subProperty: "y",
  //         interpolation: "0,0,1,1"
  //       }
  //     ],
  //     "4000": [
  //       {
  //         value: -2,
  //         property: "position",
  //         subProperty: "y",
  //         interpolation: "0,0,1,1"
  //       }
  //     ]
  //   }
  // };
  const ac1 = new AnimationClip("translate1", Interpolation, options);
  const ac2 = new AnimationClip("translate2", Interpolation, options2);
  const ac5 = new AnimationClip("B", Skeleton, actionMap["B"]);
  modelAnimation.addAnimationClip(0, ac1);
  modelAnimation.addAnimationClip(0, ac2);
  modelAnimation.addAnimationClip(200, ac5);
  modelAnimation.addAnimationClip(3000, ac5);
  cubeAnimation.addAnimationClip(0, ac1);
  cubeAnimation.addAnimationClip(0, ac2);
  cubeNode.addEventListener("animationFinished", (e) => {
    console.log("cubeNode", e.data);
  });
  model.addEventListener("animationFinished", (e) => {
    console.log("model", e.data);
  });
  engine.addEventListener("animatorFinished", (e) => {
    console.log("animatorFinished", e.data);
  });
  const animator = rootNode.createAbility(AAnimator, {
    duration: 4000
  });
  animator.addAnimationByStartTime(0, modelAnimation);
  animator.addAnimationByStartTime(0, cubeAnimation);
  animator.play();
});

//-- run
engine.run();
