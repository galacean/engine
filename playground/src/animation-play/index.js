import { Animation } from "@alipay/o3-animation";
import { Engine,Camera } from "@alipay/o3-core";
import "@alipay/o3-engine-stats";
import "@alipay/o3-hud";
import { AAmbientLight } from "@alipay/o3-lighting";
import { Resource, ResourceLoader } from "@alipay/o3-loader";
import "@alipay/o3-loader-gltf";
import { RegistExtension } from "@alipay/o3-loader-gltf";
import { PBRMaterial } from "@alipay/o3-pbr";
import {GLRenderHardware} from "@alipay/o3-rhi-webgl"
import { BasicSceneRenderer } from "@alipay/o3-renderer-basic"


RegistExtension({ PBRMaterial });

//-- create engine object
let engine = new Engine();

let scene = engine.currentScene;
let rootNode = scene.root;

// 在节点树上创建一个灯光节点
var props = {
  color: [1.0, 1.0, 1.0],
  intensity: 3
};

var ambientLight = rootNode.createChild("ambient");
ambientLight.addComponent(AAmbientLight, props);

//-- create camera
let cameraNode = rootNode.createChild("camera_node");
let camera = cameraNode.addComponent(Camera, {
  canvas: "o3-demo",
  position: [0, 1.35, 5.5],
  target: [0, 1.1, 0],
  RHI: GLRenderHardware,
  SceneRenderer: BasicSceneRenderer
});

// load resource config
const animationRes = new Resource("huabei", {
  type: "gltf",
  url:
    "https://gw.alipayobjects.com/os/loanprod/bf055064-3eec-4d40-bce0-ddf11dfbb88a/5d78db60f211d21a43834e23/4f5e6bb277dd2fab8e2097d7a418c5bc.gltf"
});

const textureRes = new Resource("baseColor", {
  type: "texture",
  url: "https://gw-office.alipayobjects.com/basement_prod/3c140e43-e7d8-4c51-999e-1f68218afc54.jpg"
});

const animationRes2 = new Resource("mayi", {
  type: "gltf",
  url:
    "https://gw.alipayobjects.com/os/loanprod/238fd5a7-6018-40f3-8049-1e773049a322/5e06ed963a414a17a737e070/1a69181086191d564de6f8a891a610f8.gltf"
});

const resourceLoader = new ResourceLoader(engine);
// resourceLoader.loadConfig
resourceLoader.batchLoad([animationRes, textureRes, animationRes2], (err, [gltf, texture, gltf2]) => {
  const prefab = gltf.asset.rootScene.nodes[0];
  const animations = gltf.asset.animations;

  const huabei = prefab.clone();

  // 加上纹理
  gltf.asset.meshes.forEach((mesh, i) => {
    const { material } = mesh.primitives[0];
    material.baseColorTexture = texture.asset;
  });

  huabei.transform.rotate([0, -90, 0]);

  let node = rootNode.createChild("gltf_node");
  node.scale = [0.5, 0.5, 0.5];
  node.position = [-1, 0, 0];
  node.addChild(huabei);

  const animator = huabei.addComponent(Animation);

  animations.forEach((clip) => {
    animator.addAnimationClip(clip, clip.name);
  });

  animator.playAnimationClip("A");

  //......
  setTimeout(() => {
    const prefab2 = gltf2.asset.rootScene.nodes[0];
    const animations2 = gltf2.asset.animations;

    const mayi = prefab2.clone();

    mayi.transform.rotate([0, -180, 0]);

    let node2 = rootNode.createChild("gltf_node2");
    node2.scale = [0.05, 0.05, 0.05];
    node2.position = [1, 0, 0];
    node2.addChild(mayi);

    const animator2 = mayi.addComponent(Animation);

    animations2.forEach((clip) => {
      animator2.addAnimationClip(clip, clip.name);
    });

    animator2.playAnimationClip("Fast Run");

    // 极端情况测试
    setTimeout(() => {
      node.isActive = false;
      setTimeout(() => {
        node.isActive = true;
      }, 1000);
    }, 1000);
  }, 1000);
});

//-- run
engine.run();
