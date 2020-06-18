import "./transform-runtime";
import { Engine } from "@alipay/o3-core";
import { originLottie, ALottieRenderer } from "@alipay/o3-lottie";
import { OrthographicCamera } from "@alipay/o3-default-camera";
import animationData from "./multi2";
//用于对比测试效果
const wrapper = document.createElement("div");
wrapper.style.position = "absolute";
wrapper.style.top = "100px";
wrapper.style.left = "100px";
document.body.appendChild(wrapper);
const test2 = originLottie.loadAnimation({
  container: wrapper, // the dom element that will contain the animation
  renderer: "canvas",
  loop: true,
  autoplay: false,
  animationData
});

test2.play();
let engine = new Engine();
let scene = engine.currentScene;
let rootNode = scene.root;

let cameraNode = rootNode.createChild("camera_node");
let lottieNode = rootNode.createChild("lottie_node");
let orthographicCamera = cameraNode.createAbility(OrthographicCamera);
orthographicCamera.attachToScene("o3-demo");
cameraNode.position = [0, 0, 1];
orthographicCamera.node.lookAt([0, 0, 0], [0, 1, 0]);
orthographicCamera.size = animationData.w;
const test = lottieNode.createAbility(ALottieRenderer, {
  animationData,
  loop: true,
  autoplay: false
});
test.play();
engine.run();
