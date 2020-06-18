import { Logger, TextureFilter } from "@alipay/o3-base";
import { Engine } from "@alipay/o3-core";
import { ADefaultCamera } from "@alipay/o3-default-camera";
import "@alipay/o3-engine-stats";
import { ResourceLoader, Resource } from "@alipay/o3-loader";
import { AOrbitControls } from "@alipay/o3-orbit-controls";
import { TextureCubeMap } from "@alipay/o3-material";
import { ASkyBox } from "@alipay/o3-skybox";

//-- create engine object
let engine = new Engine();
const resourceLoader = new ResourceLoader(engine);
let scene = engine.currentScene;
let rootNode = scene.root;

let cubeMapRes = new Resource("env", {
  type: "cubemap",
  urls: [
    "/static/env/environment/px.jpg",
    "/static/env/environment/nx.jpg",
    "/static/env/environment/py.jpg",
    "/static/env/environment/ny.jpg",
    "/static/env/environment/pz.jpg",
    "/static/env/environment/nz.jpg"
  ]
});

let cubeMapRes2 = new Resource("env", {
  type: "cubemap",
  urls: [
    "/static/env/papermill/environment/environment_right_0.jpg",
    "/static/env/papermill/environment/environment_left_0.jpg",
    "/static/env/papermill/environment/environment_top_0.jpg",
    "/static/env/papermill/environment/environment_bottom_0.jpg",
    "/static/env/papermill/environment/environment_back_0.jpg",
    "/static/env/papermill/environment/environment_front_0.jpg"
  ]
});

resourceLoader.batchLoad([cubeMapRes, cubeMapRes2], (err, res) => {
  let cubeMaps = res.map(r => r.assets[0]);
  const skyboxNode = rootNode.createChild("skyboxNode");
  let skybox = skyboxNode.createAbility(ASkyBox);
  skybox.skyBoxMap = cubeMaps[0];
  const debugInfo = {
    x: 0,
    y: 0,
    z: 0,
    reset: function() {
      debugInfo.x = debugInfo.y = debugInfo.z = 0;

      skyboxNode.setRotationAngles(0, 0, 0);
    }
  };
});

let cameraNode = rootNode.createChild("camera_node");
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: "o3-demo",
  position: [0, 0, 3]
});
let controler = cameraNode.createAbility(AOrbitControls, { mainElement: document.getElementById("o3-demo") });

engine.run();
