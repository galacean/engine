import { Engine } from "@alipay/o3-core";
import { vec3 } from "@alipay/o3-math";
import { ADefaultCamera } from "@alipay/o3-default-camera";
import { ResourceLoader, Resource } from "@alipay/o3-loader";
import "@alipay/o3-loader-gltf";
import { TextureFilter, TextureWrapMode } from "@alipay/o3-core";
import { AAnimation, AnimationEvent, WrapMode } from "@alipay/o3-animation";
import "@alipay/o3-hud";
import { AAmbientLight } from '@alipay/o3-lighting';
import {RegistExtension} from '@alipay/o3-loader-gltf';
import {PBRMaterial} from '@alipay/o3-pbr';

import { AHUDLabel } from "../common/AHUDLabel";

RegistExtension({PBRMaterial});

//-- create engine object
let engine = new Engine();

let scene = engine.currentScene;
let rootNode = scene.root;

// 在节点树上创建一个灯光节点
var props = {
  color: [1.0, 1.0, 1.0],
  intensity: 3,
}; 

var ambientLight = rootNode.createChild("ambient"); 
ambientLight.createAbility(AAmbientLight, props);

//-- create camera
let cameraNode = rootNode.createChild("camera_node");
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: "o3-demo",
  position: [0, 1.35, 5.5],
  target: [0, 1.1, 0]
});

// load resource config
const animationRes = new Resource("huabei", {
  type: "gltf",
  url: "https://gw.alipayobjects.com/os/loanprod/bf055064-3eec-4d40-bce0-ddf11dfbb88a/5d78db60f211d21a43834e23/4f5e6bb277dd2fab8e2097d7a418c5bc.gltf"
});

const textureRes = new Resource('baseColor', {
  type: 'texture',
  url: 'https://gw-office.alipayobjects.com/basement_prod/3c140e43-e7d8-4c51-999e-1f68218afc54.jpg'
});

const resourceLoader = new ResourceLoader(engine);
// resourceLoader.loadConfig
resourceLoader.batchLoad([animationRes, textureRes], (err, [gltf, texture]) => {
  const prefab = gltf.asset.rootScene.nodes[0];
  const animations = gltf.asset.animations;

  const huabei = prefab.clone();

  // 加上纹理
  gltf.asset.meshes.forEach((mesh, i) => {
    const {material} = mesh.primitives[0];
    material.baseColorTexture = texture.asset;
  })

  huabei.rotateByAngles(0, -90, 0);

  let node = rootNode.createChild("gltf_node");
  node.scale = [0.5, 0.5, 0.5]
  node.addChild(huabei);

  const animator = huabei.createAbility(AAnimation);

  animations.forEach(clip => {
    animator.addAnimationClip(clip, clip.name);
  });

  animator.playAnimationClip("A");
});

//-- run
engine.run();
