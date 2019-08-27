import { ClearMode } from "@alipay/o3-base";
import { Engine, NodeAbility } from "@alipay/o3-core";
import { vec3 } from "@alipay/o3-math";
import { GLRenderHardware } from "@alipay/o3-rhi-webgl";
import { SceneRenderer } from "@alipay/o3-renderer-cull";
import { ResourceLoader, Resource } from "@alipay/o3-loader";
import "@alipay/o3-loader-gltf";
import { TextureFilter, TextureWrapMode } from "@alipay/o3-core";
import { AAnimation, AnimationEvent } from "@alipay/o3-animation";
import { AMachine } from "@alipay/o3-fsm";
import { ADefaultCamera } from "@alipay/o3-default-camera";

import "@alipay/o3-engine-stats";

//-- create engine object
let engine = new Engine();

let scene = engine.currentScene;
let rootNode = scene.root;

const resourceLoader = new ResourceLoader(engine);

//-- create camera
let cameraNode = rootNode.createChild("camera_node");

const animationRes = new Resource("pig_gltf", {
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

  const machineAbility = node.createAbility(AMachine, { name: "pig" });
  const machine = machineAbility.machine;

  const pig = pigPrefab.clone();

  pig.rotateByAngles(0, 180, 0);

  node.addChild(pig);

  let book = pig.findChildByName("book_one");
  book.isActive = false;

  const animator = pig.createAbility(AAnimation);

  animations.forEach(clip => {
    animator.addAnimationClip(clip, clip.name);
    console.log(clip.name);
  });

  // longidle03_over jump
  machine.addState({
    name: "moving",
    onEnter: (deltaTime) => {
      animator.playAnimationClip("walk");
    }
  });

  machine.addState({
    name: "idle",
    onEnter: () => {
      animator.playAnimationClip("idle01");
    }
  });

  machine.addState({
    name: "jumping",
    onEnter: (name) => {
      animator.playAnimationClip("longidle03_over", {
        events: [{
          type: AnimationEvent.LOOP_END, callback: () => {
            if (name === "moving") {
              machine.dispatch("MOVE");
            } else if (name === "idle") {
              machine.dispatch("IDLE");
            }
          }
        }]
      });
    }
  });

  machine.addState({
    name: "dancing",
    onEnter: (name) => {
      animator.playAnimationClip("dance");
    }
  });

  machine.addTransitions([
    { from: ["init", "idle", "jumping"], to: "moving", trigger: "MOVE" },
    { from: ["idle", "moving"], to: "jumping", trigger: "JUMP" },
    { from: ["jumping"], to: "dancing", trigger: "DANCE" },
    { from: ["init", "moving", "jumping", "dancing"], to: "idle", trigger: "IDLE" }
  ]);

  machine.dispatch("IDLE");

  btn2.addEventListener("click", (e) => {
    machine.dispatch("JUMP");
  });

  btn3.addEventListener("click", (e) => {
    machine.dispatch("DANCE");
  });

  btn4.addEventListener("click", (e) => {
    machine.dispatch("IDLE");
  });

  btn1.addEventListener("click", (e) => {
    machine.dispatch("MOVE");
    console.log('move')
  });

  //-- run
  engine.run();
});
let btn1 = document.createElement("button");
btn1.innerHTML = "开始走路";
let btn2 = document.createElement("button");
btn2.innerHTML = "跳跃";
let btn3 = document.createElement("button");
btn3.innerHTML = "跳跃时开始跳舞";
let btn4 = document.createElement("button");
btn4.innerHTML = "回到默认状态";
let container = document.createElement("div");
container.setAttribute("style", "position:absolute;right:0;bottom:0");
container.appendChild(btn1);
container.appendChild(btn2);
container.appendChild(btn3);
container.appendChild(btn4);
document.body.appendChild(container);
