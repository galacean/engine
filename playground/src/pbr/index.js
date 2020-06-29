import { Logger } from "@alipay/o3-base";
import { Engine } from "@alipay/o3-core";
import { ResourceLoader, Resource } from "@alipay/o3-loader";
import { RegistExtension } from "@alipay/o3-loader-gltf";
import { AAnimation } from "@alipay/o3-animation";
import { Camera } from "@alipay/o3-default-camera";
import { AOrbitControls } from "@alipay/o3-orbit-controls";
import { PBRMaterial } from "@alipay/o3-pbr";
import { ASkyBox } from "@alipay/o3-skybox";
import { AAmbientLight, ADirectLight, APointLight, ASpotLight, AEnvironmentMapLight } from "@alipay/o3-lighting";

import "@alipay/o3-engine-stats";
import * as dat from "dat.gui";

Logger.enable();
RegistExtension({ PBRMaterial });

//-- create engine object
let engine = new Engine();

let scene = engine.currentScene;
let rootNode = scene.root;

const color2glColor = color => [color[0] / 255, color[1] / 255, color[2] / 255];
const glColor2Color = color => [color[0] * 255, color[1] * 255, color[2] * 255];
const gui = new dat.GUI();
gui.domElement.style = "position:absolute;top:0px;left:50vw";

let envLightNode = rootNode.createChild("env_light");
let envLight = envLightNode.createAbility(AEnvironmentMapLight);
// envLight.enabled = false;
let envFolder = gui.addFolder("EnvironmentMapLight");
envFolder.add(envLight, "enabled");
envFolder.add(envLight, "specularIntensity", 0, 1);
envFolder.add(envLight, "diffuseIntensity", 0, 1);

let ambientLightColor = { color: [Math.random() * 255, Math.random() * 255, Math.random() * 255] };
let ambientLightNode = rootNode.createChild("ambient_light");
let ambientLight = ambientLightNode.createAbility(AAmbientLight, {
  color: color2glColor(ambientLightColor.color),
  intensity: 0.2
});
ambientLight.enabled = false;
let ambFolder = gui.addFolder("AmbientLight");
ambFolder.add(ambientLight, "enabled");
ambFolder.addColor(ambientLightColor, "color").onChange(v => (ambientLight.color = color2glColor(v)));
ambFolder.add(ambientLight, "intensity", 0, 1);

let directLightColor = { color: [Math.random() * 255, Math.random() * 255, Math.random() * 255] };
let directLightNode = rootNode.createChild("dir_light");
let directLight = directLightNode.createAbility(ADirectLight, {
  color: color2glColor(directLightColor.color),
  intensity: 0.5
});
directLight.enabled = false;
let dirFolder = gui.addFolder("DirectionalLight1");
dirFolder.add(directLight, "enabled");
dirFolder.addColor(directLightColor, "color").onChange(v => (directLight.color = color2glColor(v)));
dirFolder.add(directLight, "intensity", 0, 1);

let directLightColor2 = { color: [Math.random() * 255, Math.random() * 255, Math.random() * 255] };
let directLightNode2 = rootNode.createChild("dir_light2");
let directLight2 = directLightNode2.createAbility(ADirectLight, {
  color: color2glColor(directLightColor2.color),
  intensity: 0.5
});
directLightNode2.rotateByAngles(125, 0, 0);
directLight2.enabled = false;
let dirFolder2 = gui.addFolder("DirectionalLight2");
dirFolder2.add(directLight2, "enabled");
dirFolder2.addColor(directLightColor2, "color").onChange(v => (directLight2.color = color2glColor(v)));
dirFolder2.add(directLight2, "intensity", 0, 1);

let pointLightColor = { color: [Math.random() * 255, Math.random() * 255, Math.random() * 255] };
let pointLightNode = rootNode.createChild("poi_light");
pointLightNode.position = [0, 0, 7];
let pointLight = pointLightNode.createAbility(APointLight, {
  color: color2glColor(pointLightColor.color),
  distance: 10,
  decay: 0.5
});
pointLight.enabled = false;
let poiFolder = gui.addFolder("PointLight1");
poiFolder.add(pointLight, "enabled");
poiFolder.addColor(pointLightColor, "color").onChange(v => (pointLight.color = color2glColor(v)));
poiFolder.add(pointLight, "intensity", 0, 1);
poiFolder.add(pointLight, "distance", 0, 20);
poiFolder.add(pointLight, "decay", 0, 2);
window.poi = pointLight;

let pointLightColor2 = { color: [Math.random() * 255, Math.random() * 255, Math.random() * 255] };
let pointLightNode2 = rootNode.createChild("poi2_light");
pointLightNode2.position = [0, 5, 5];
let pointLight2 = pointLightNode2.createAbility(APointLight, {
  distance: 10,
  decay: 0.5,
  color: color2glColor(pointLightColor2.color)
});
pointLight2.enabled = false;
let poiFolder2 = gui.addFolder("PointLight2");
poiFolder2.add(pointLight2, "enabled");
poiFolder2.addColor(pointLightColor2, "color").onChange(v => (pointLight2.color = color2glColor(v)));
poiFolder2.add(pointLight2, "intensity", 0, 1);
poiFolder2.add(pointLight2, "distance", 0, 20);
poiFolder2.add(pointLight2, "decay", 0, 2);

let spotLightColor = { color: [Math.random() * 255, Math.random() * 255, Math.random() * 255] };
let spotLightNode = rootNode.createChild("spo_light");
spotLightNode.position = [3, 0, 0];
spotLightNode.rotateByAngles(180, 90, 0);
let spotLight = spotLightNode.createAbility(ASpotLight, {
  color: color2glColor(spotLightColor.color),
  angle: Math.PI / 20,
  distance: 3,
  decay: 0.5,
  penumbra: 0.5
});
spotLight.enabled = false;
let spotFolder = gui.addFolder("SpotLight1");
spotFolder.add(spotLight, "enabled");
spotFolder.addColor(spotLightColor, "color").onChange(v => (spotLight.color = color2glColor(v)));
spotFolder.add(spotLight, "intensity", 0, 1);
spotFolder.add(spotLight, "distance", 0, 20);
spotFolder.add(spotLight, "decay", 0, 2);
spotFolder.add(spotLight, "angle", 0, Math.PI / 3);
spotFolder.add(spotLight, "penumbra", 0, 1);

let spotLightColor2 = { color: [Math.random() * 255, Math.random() * 255, Math.random() * 255] };
let spotLightNode2 = rootNode.createChild("spot2_light");
spotLightNode2.position = [3, 0, 0];
spotLightNode2.rotateByAngles(180, 90, 0);
let spotLight2 = spotLightNode2.createAbility(ASpotLight, {
  color: color2glColor(spotLightColor2.color),
  angle: Math.PI / 6,
  distance: 4,
  decay: 0.4,
  penumbra: 0.8
});
spotLight2.enabled = false;
let spotFolder2 = gui.addFolder("SpotLight2");
spotFolder2.add(spotLight2, "enabled");
spotFolder2.addColor(spotLightColor2, "color").onChange(v => (spotLight2.color = color2glColor(v)));
spotFolder2.add(spotLight2, "intensity", 0, 1);
spotFolder2.add(spotLight2, "distance", 0, 20);
spotFolder2.add(spotLight2, "decay", 0, 2);
spotFolder2.add(spotLight2, "angle", 0, Math.PI / 3);
spotFolder2.add(spotLight2, "penumbra", 0, 1);

//-- create camera
let cameraNode = rootNode.createChild("camera_node");

let diffuseMapRes = new Resource("dif", {
  type: "cubemapNew",
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
  type: "cubemapNew",
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
  type: "cubemapNew",
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
  // type: 'glb',
  url: "/static/model/DamangedHelmet/DamagedHelmet.gltf"
  // url: '/static/model/binTest/yuanqisenlin_ranchachunxiangwutangwulongchayinliao_500ml.obj.gltf',
  // url: '/static/model/bufferTest/yuanqisenlin_ranchachunxiangwutangwulongchayinliao_500ml.obj.gltf',
  // url: '/static/model/glbTest/Ant_Pose1.glb',
});

let cameraProps = {
  canvas: "o3-demo",
  position: [0, 0, 5],
  near: 0.01
};
let camera = cameraNode.createAbility(Camera, cameraProps);
let controler = cameraNode.createAbility(AOrbitControls, { mainElement: document.getElementById("o3-demo") });

let node = rootNode.createChild("gltf_node");

const rhi = engine.getRHI("o3-demo");
const resourceLoader = new ResourceLoader(engine, null, rhi);

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
