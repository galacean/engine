import { Logger } from "@alipay/o3-base";
import { Engine, NodeAbility } from "@alipay/o3-core";
import { ResourceLoader, Resource } from "@alipay/o3-loader";
import { RegistExtension } from "@alipay/o3-loader-gltf";
import { AAnimation } from "@alipay/o3-animation";
import { ADefaultCamera } from "@alipay/o3-default-camera";
import { AOrbitControls } from "@alipay/o3-orbit-controls";
import { PBRMaterial } from "@alipay/o3-pbr";
import { AAmbientLight, ADirectLight, AEnvironmentMapLight } from "@alipay/o3-lighting";

import "@alipay/o3-engine-stats";
import * as dat from "dat.gui";
import { ASkinnedMeshRenderer } from "@alipay/o3-mesh";

// Logger.enable();
RegistExtension({ PBRMaterial });

//-- create engine object
let engine = new Engine();

let scene = engine.currentScene;
let rootNode = scene.root;

const color2glColor = color => [color[0] / 255, color[1] / 255, color[2] / 255];
const gui = new dat.GUI();
gui.domElement.style = "position:absolute;top:0px;left:50vw";

// let envLightNode = rootNode.createChild("env_light");
// let envLight = envLightNode.createAbility(AEnvironmentMapLight);
// let envFolder = gui.addFolder("EnvironmentMapLight");
// envFolder.add(envLight, "enabled");
// envFolder.add(envLight, "specularIntensity", 0, 1);
// envFolder.add(envLight, "diffuseIntensity", 0, 1);

let ambientLightNode = rootNode.createChild("ambient_light");
let ambientLight = ambientLightNode.createAbility(AAmbientLight, {
  color: [1.0, 1.0, 1.0, 1.0],
  intensity: 1.0
});
ambientLight.enabled = true;

let directLightColor = { color: [255, 255, 255] };
let directLightNode = rootNode.createChild("dir_light");
directLightNode.setRotationAngles(30, 200, 0);
let directLight = directLightNode.createAbility(ADirectLight, {
  color: [1.0, 1.0, 1.0, 1.0],
  intensity: 0.6
});
directLight.enabled = true;

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
  // type: 'glb',
  url:
    "https://gw.alipayobjects.com/os/loanprod/c763bc03-2d3b-4c6a-bf3c-f6dce4571e3f/5e37c284932f32dd00533955/13261e302e3511d95065737482a53a29.gltf"
});

let cameraProps = {
  canvas: "o3-demo",
  position: [0, 0, 5],
  near: 0.01
};
cameraNode.createAbility(ADefaultCamera, cameraProps);
cameraNode.createAbility(AOrbitControls, { mainElement: document.getElementById("o3-demo") });

let node = rootNode.createChild("gltf_node");

class MorphAnimation extends NodeAbility {
  public renderer: any;
  public weights: any;
  public currentTime: any;

  onStart() {
    const renderer = this.node.findAbilityByType(ASkinnedMeshRenderer);
    this.renderer = renderer;
    this.weights = renderer._skin.joints.map(() => 0);
    this.currentTime = 0;
  }

  onUpdate(dt) {
    this.currentTime += dt;
    const weight = Math.abs(Math.sin((this.currentTime / 2000) * Math.PI));

    this.weights[2] = weight;
    this.renderer.setWeights(Array.from(this.weights));
  }
}

resourceLoader.batchLoad([gltfRes, diffuseMapRes, specularMapRes, environmentMapRes], (err, res) => {
  const glb = res[0];
  const nodes = glb.asset.rootScene.nodes;
  nodes.forEach(n => {
    node.addChild(n);
  });

  nodes[0].findChildByName("head").createAbility(MorphAnimation);

  const animations = glb.asset.animations;
  const animator = node.createAbility(AAnimation);

  animations.forEach(clip => {
    animator.addAnimationClip(clip, clip.name);
  });
});

//-- run
engine.run();
