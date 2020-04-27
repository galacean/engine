import { Logger } from "@alipay/o3-base";
import { Engine } from "@alipay/o3-core";
import { ADefaultCamera } from "@alipay/o3-default-camera";
import { ResourceLoader, Resource } from "@alipay/o3-loader";
import { AOrbitControls } from "@alipay/o3-orbit-controls";
import { AEnvironmentMapLight, ADirectLight } from "@alipay/o3-lighting";
// import "@alipay/o3-engine-stats";
import { RegistExtension } from "@alipay/o3-loader-gltf";
import { PBRMaterial } from "@alipay/o3-pbr";
import { AAnimation, AnimationEvent, WrapMode } from "@alipay/o3-animation";

Logger.enable();

RegistExtension({ PBRMaterial });
const engine = new Engine();
const scene = engine.currentScene;
const rootNode = scene.root;
const lightNode = rootNode.createChild("light_node");
let cameraNode = rootNode.createChild("camera_node");
cameraNode.createAbility(ADefaultCamera, {
  canvas: "o3-demo",
  // near: 1,
  // far: 100,
  // position: [0, 1, 100]
  position: [0, 1, 5]
});
const control = cameraNode.createAbility(AOrbitControls, { mainElement: document.getElementById("r3-demo") });
// control.target = [0, 20, 0];
control.target = [0, 1, 0];
rootNode.createAbility(AEnvironmentMapLight, {});
lightNode.createAbility(ADirectLight, { intensity: 0.6 });
lightNode.setRotationAngles(0, 90, 0);
let gltfRes = new Resource("skin_gltf", {
  type: "gltf",
  url: "https://gw.alipayobjects.com/os/basement_prod/aa318303-d7c9-4cb8-8c5a-9cf3855fd1e6.gltf"
  // url: "/static/model/mayi.gltf"
});
let resourceLoader = new ResourceLoader(engine);

resourceLoader.load(gltfRes, (err, gltf) => {
  console.log(err, gltf);
  if (err) return;

  const fairyPrefab = gltf.asset.rootScene.nodes[1];
  const fairy1 = fairyPrefab;
  rootNode.addChild(fairy1);
  const animator = fairy1.createAbility(AAnimation);

  const animations = gltf.asset.animations;
  animations.forEach(clip => {
    animator.addAnimationClip(clip, clip.name);
  });

  animator.playAnimationClip(animations[0].name);
  // animator.playAnimationClip("Fast Run");
});

engine.run();
