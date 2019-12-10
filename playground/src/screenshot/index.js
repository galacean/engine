import { Logger } from "@alipay/o3-base";
import { Engine } from "@alipay/o3-core";
import { ResourceLoader, Resource } from "@alipay/o3-loader";
import { RegistExtension } from "@alipay/o3-loader-gltf";
import { AAnimation } from "@alipay/o3-animation";
import { ADefaultCamera } from "@alipay/o3-default-camera";
import { AOrbitControls } from "@alipay/o3-orbit-controls";
import { AEnvironmentMapLight, PBRMaterial } from "@alipay/o3-pbr";
import { ASkyBox } from "@alipay/o3-skybox";
import { Screenshot } from "@alipay/o3-screenshot";

import "@alipay/o3-engine-stats";
import * as dat from "dat.gui";

Logger.enable();
RegistExtension({ PBRMaterial });

//-- create engine object
let engine = new Engine();

let scene = engine.currentScene;
let rootNode = scene.root;

const gui = new dat.GUI();
let state = {
  /** 截图的宽 */
  width: 1024,
  /** 截图的高 */
  height: 1024,
  /** 格式是否 png，默认 true */
  isPng: true,
  /** 是否下载，默认 true */
  download: true,
  /** 如果下载截屏，可以设置文件名字 */
  downloadName: "",
  do: () => {
    new Screenshot(camera, {
      width: state.width,
      height: state.height,
      isPng: state.isPng,
      download: state.download,
      downloadName: state.downloadName,
      onSuccess: base64 => {
        console.log(base64);
      }
    });
  }
};

gui.add(state, "width", 0, 4096).name("截图宽");
gui.add(state, "height", 0, 4096).name("截图高");
gui.add(state, "isPng").name("是否导出透明");
gui.add(state, "download").name("是否下载截屏");
gui.add(state, "downloadName").name("截屏下载文件名");
gui.add(state, "do").name("点我截屏！");

let envLightNode = rootNode.createChild("env_light");
let envLight = envLightNode.createAbility(AEnvironmentMapLight);

const resourceLoader = new ResourceLoader(engine);

//-- create camera
let cameraNode = rootNode.createChild("camera_node");

let diffuseMapRes = new Resource("dif", {
  type: "cubemap",
  urls: [
    "/static/env/papermill/diffuse/diffuse_right_0.jpg",
    "/static/env/papermill/diffuse/diffuse_left_0.jpg",
    "/static/env/papermill/diffuse/diffuse_top_0.jpg",
    "/static/env/papermill/diffuse/diffuse_bottom_0.jpg",
    "/static/env/papermill/diffuse/diffuse_front_0.jpg",
    "/static/env/papermill/diffuse/diffuse_back_0.jpg"
  ]
});

let environmentMapRes = new Resource("environment", {
  type: "cubemap",
  urls: [
    "/static/env/papermill/environment/environment_right_0.jpg",
    "/static/env/papermill/environment/environment_left_0.jpg",
    "/static/env/papermill/environment/environment_top_0.jpg",
    "/static/env/papermill/environment/environment_bottom_0.jpg",
    "/static/env/papermill/environment/environment_front_0.jpg",
    "/static/env/papermill/environment/environment_back_0.jpg"
  ]
});

let specularMapRes = new Resource("env", {
  type: "cubemap",
  urls: [
    [
      "/static/env/papermill/specular/specular_right_0.jpg",
      "/static/env/papermill/specular/specular_left_0.jpg",
      "/static/env/papermill/specular/specular_top_0.jpg",
      "/static/env/papermill/specular/specular_bottom_0.jpg",
      "/static/env/papermill/specular/specular_front_0.jpg",
      "/static/env/papermill/specular/specular_back_0.jpg"
    ],
    [
      "/static/env/papermill/specular/specular_right_1.jpg",
      "/static/env/papermill/specular/specular_left_1.jpg",
      "/static/env/papermill/specular/specular_top_1.jpg",
      "/static/env/papermill/specular/specular_bottom_1.jpg",
      "/static/env/papermill/specular/specular_front_1.jpg",
      "/static/env/papermill/specular/specular_back_1.jpg"
    ],
    [
      "/static/env/papermill/specular/specular_right_2.jpg",
      "/static/env/papermill/specular/specular_left_2.jpg",
      "/static/env/papermill/specular/specular_top_2.jpg",
      "/static/env/papermill/specular/specular_bottom_2.jpg",
      "/static/env/papermill/specular/specular_front_2.jpg",
      "/static/env/papermill/specular/specular_back_2.jpg"
    ],
    [
      "/static/env/papermill/specular/specular_right_3.jpg",
      "/static/env/papermill/specular/specular_left_3.jpg",
      "/static/env/papermill/specular/specular_top_3.jpg",
      "/static/env/papermill/specular/specular_bottom_3.jpg",
      "/static/env/papermill/specular/specular_front_3.jpg",
      "/static/env/papermill/specular/specular_back_3.jpg"
    ],
    [
      "/static/env/papermill/specular/specular_right_4.jpg",
      "/static/env/papermill/specular/specular_left_4.jpg",
      "/static/env/papermill/specular/specular_top_4.jpg",
      "/static/env/papermill/specular/specular_bottom_4.jpg",
      "/static/env/papermill/specular/specular_front_4.jpg",
      "/static/env/papermill/specular/specular_back_4.jpg"
    ],
    [
      "/static/env/papermill/specular/specular_right_5.jpg",
      "/static/env/papermill/specular/specular_left_5.jpg",
      "/static/env/papermill/specular/specular_top_5.jpg",
      "/static/env/papermill/specular/specular_bottom_5.jpg",
      "/static/env/papermill/specular/specular_front_5.jpg",
      "/static/env/papermill/specular/specular_back_5.jpg"
    ],
    [
      "/static/env/papermill/specular/specular_right_6.jpg",
      "/static/env/papermill/specular/specular_left_6.jpg",
      "/static/env/papermill/specular/specular_top_6.jpg",
      "/static/env/papermill/specular/specular_bottom_6.jpg",
      "/static/env/papermill/specular/specular_front_6.jpg",
      "/static/env/papermill/specular/specular_back_6.jpg"
    ],
    [
      "/static/env/papermill/specular/specular_right_7.jpg",
      "/static/env/papermill/specular/specular_left_7.jpg",
      "/static/env/papermill/specular/specular_top_7.jpg",
      "/static/env/papermill/specular/specular_bottom_7.jpg",
      "/static/env/papermill/specular/specular_front_7.jpg",
      "/static/env/papermill/specular/specular_back_7.jpg"
    ],
    [
      "/static/env/papermill/specular/specular_right_8.jpg",
      "/static/env/papermill/specular/specular_left_8.jpg",
      "/static/env/papermill/specular/specular_top_8.jpg",
      "/static/env/papermill/specular/specular_bottom_8.jpg",
      "/static/env/papermill/specular/specular_front_8.jpg",
      "/static/env/papermill/specular/specular_back_8.jpg"
    ],
    [
      "/static/env/papermill/specular/specular_right_9.jpg",
      "/static/env/papermill/specular/specular_left_9.jpg",
      "/static/env/papermill/specular/specular_top_9.jpg",
      "/static/env/papermill/specular/specular_bottom_9.jpg",
      "/static/env/papermill/specular/specular_front_9.jpg",
      "/static/env/papermill/specular/specular_back_9.jpg"
    ]
  ]
});

const gltfRes = new Resource("campaign_gltf", {
  type: "gltf",
  url: "/static/model/DamangedHelmet/DamagedHelmet.gltf"
});

let cameraProps = {
  canvas: "o3-demo",
  position: [0, 0, 5],
  near: 0.01,
  attributes: {
    preserveDrawingBuffer: true
  }
};
let camera = cameraNode.createAbility(ADefaultCamera, cameraProps);
let controler = cameraNode.createAbility(AOrbitControls, { canvas: document.getElementById("o3-demo") });

let node = rootNode.createChild("gltf_node");

resourceLoader.batchLoad([gltfRes, diffuseMapRes, specularMapRes, environmentMapRes], (err, res) => {
  const glb = res[0];
  const nodes = glb.asset.rootScene.nodes;
  nodes.forEach(n => {
    node.addChild(n);
  });

  envLight.diffuseMap = res[1].asset;
  envLight.specularMap = res[2].asset;
  node.createAbility(ASkyBox, { skyBoxMap: res[3].asset });

  const animations = glb.asset.animations;
  const animator = node.createAbility(AAnimation);

  animations.forEach(clip => {
    animator.addAnimationClip(clip, clip.name);
  });

  // animator.playAnimationClip('BusterDrone');
});

//-- run
engine.run();
