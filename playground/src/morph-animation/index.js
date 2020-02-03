import { Engine } from "@alipay/o3-core";
import { ADefaultCamera } from "@alipay/o3-default-camera";
import { ResourceLoader, Resource } from "@alipay/o3-loader";
import { ADirectLight, AAmbientLight } from "@alipay/o3-lighting";
import { vec3 } from "@alipay/o3-math";
import "@alipay/o3-loader-gltf";
import { AAnimation } from "@alipay/o3-animation";
import { AEnvironmentMapLight, PBRMaterial } from "@alipay/o3-pbr";
import { RegistExtension } from "@alipay/o3-loader-gltf";
import { AOrbitControls } from "@alipay/o3-orbit-controls";
RegistExtension({ PBRMaterial });

//-- create engine object
let engine = new Engine();

let scene = engine.currentScene;
let rootNode = scene.root;

//-- create camera
let cameraNode = rootNode.createChild("camera_node");
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: "o3-demo",
  position: [0, 300, 0],
  target: [0, 150, 0],
  fov: 50
});

cameraNode.createAbility(AOrbitControls)

// load resource config
const animationRes = new Resource("pig_glb", {
  type: "glb",
  url: "https://gw.alipayobjects.com/os/basement_prod/16a92fc0-17c5-4fd6-bfa7-c8c5bdcd78b5.glb"
});

const light1 = rootNode.createChild("light1");
light1.createAbility(ADirectLight, {
  color: vec3.normalize([], [239, 239, 255]),
  intensity: 1.5
});

const light2 = rootNode.createChild("light1");
light2.createAbility(ADirectLight, {
  color: vec3.normalize([], [255, 239, 239]),
  intensity: 1.5
});

rootNode.createAbility(AAmbientLight);

const resourceLoader = new ResourceLoader(engine);
// resourceLoader.loadConfig
resourceLoader.load(animationRes, (err, gltf) => {
  const horsePrefab = gltf.asset.rootScene.nodes[0];
  const animations = gltf.asset.animations;

  const horse = horsePrefab.clone();
  // pig.rotateByAngles(0, 180, 0);

  rootNode.addChild(horse);

  // let book = pig.findChildByName('book_one');
  // book.isActive = false;

  const animator = horse.createAbility(AAnimation);
  // console.log(animations);
  animations.forEach(clip => {
    animator.addAnimationClip(clip, clip.name);
  });
  animator.playAnimationClip("horse_A_");
  window['animator'] = animator;
  console.log(animator.isPlaying())
  // animator.
  // animator.mix('wave', 'Bone07'); // 左胳膊骨骼
  // animator.mix('wave', 'Bone11'); // 右胳膊骨骼
});

//-- run
engine.run();
