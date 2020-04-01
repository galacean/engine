import { Logger } from "@alipay/o3-base";
import { Engine } from "@alipay/o3-core";
import { ADefaultCamera } from "@alipay/o3-default-camera";
import { AGeometryRenderer } from "@alipay/o3-geometry";
import { CuboidGeometry } from "@alipay/o3-geometry-shape";
import "@alipay/o3-engine-stats";
import { ResourceLoader, Resource } from "@alipay/o3-loader";
import { AOrbitControls } from "@alipay/o3-orbit-controls";
import { TextureCubeMap } from "@alipay/o3-material";

import "@alipay/o3-compressed-texture";

import createCubeMaterial from "../TextureCubeMap/geometryMaterial";

Logger.enable();

//-- create engine object
let engine = new Engine();
const resourceLoader = new ResourceLoader(engine);
let scene = engine.currentScene;
let rootNode = scene.root;

function createCuboidGeometry(name, position, rotation, w, h, d, mtl) {
  let obj = rootNode.createChild(name);
  obj.position = position;
  obj.setRotationAngles(rotation[0], rotation[0], rotation[0]);
  let cubeRenderer = obj.createAbility(AGeometryRenderer);
  cubeRenderer.geometry = new CuboidGeometry(w, h, d);
  cubeRenderer.setMaterial(mtl);
}

let cubeMapRes = new Resource("env", {
  type: "ktx",
  urls: [
    "https://gw.alipayobjects.com/os/bmw-prod/e2d5234c-71d9-48a0-9407-d9f483b67554.ktx",
    "https://gw.alipayobjects.com/os/bmw-prod/ff782886-e2aa-47f9-9f45-aabaa1415124.ktx",
    "https://gw.alipayobjects.com/os/bmw-prod/f2892ba6-a107-460b-8cfc-767aee18707f.ktx",
    "https://gw.alipayobjects.com/os/bmw-prod/7c318958-3c6b-4be3-8457-553e02954c19.ktx",
    "https://gw.alipayobjects.com/os/bmw-prod/f3762e5d-50f0-414e-bf4c-1a4293020478.ktx",
    "https://gw.alipayobjects.com/os/bmw-prod/65618efc-de76-48fd-b898-2c0382af913a.ktx"
  ]
});

let cubeMapRes2 = new Resource("env", {
  type: "ktx",
  urls: [
    "https://gw.alipayobjects.com/os/bmw-prod/60a492d3-f22e-4b74-ae89-f9f022889846.ktx",
    "https://gw.alipayobjects.com/os/bmw-prod/6ec5a407-2ef8-42ea-b0c0-33cd1b58df46.ktx",
    "https://gw.alipayobjects.com/os/bmw-prod/7ea007d3-65b1-4555-90d7-088a35476def.ktx",
    "https://gw.alipayobjects.com/os/bmw-prod/1f678f0d-db1c-436e-8087-2206ea56c4c4.ktx",
    "https://gw.alipayobjects.com/os/bmw-prod/36ca08f6-0dc0-44dd-82fd-92a705b78e45.ktx",
    "https://gw.alipayobjects.com/os/bmw-prod/fbd31bc7-d04d-460b-9620-39bd1648a79f.ktx"
  ]
});
resourceLoader.batchLoad([cubeMapRes, cubeMapRes2], (err, res) => {
  if (err) {
    console.log("error", err)
  } else {
    let cubeMaps = res.map(r => r.assets[0]);
    let mipmapsFacesArray = [cubeMaps[0].mipmapsFaces, cubeMaps[1].mipmapsFaces];
    let mtl = createCubeMaterial(resourceLoader);
    mtl.setValue("u_cube", cubeMaps[0]);
    const w = 1;
    createCuboidGeometry("obj1", [0, 0, 0], [0, 0, 0], w, w, w, mtl);

    let pointer = 1;
    setInterval(() => {
      cubeMaps[0].mipmapsFaces = mipmapsFacesArray[pointer++ % 2];
    }, 2000);
  }
});

let cameraNode = rootNode.createChild("camera_node");
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: "o3-demo",
  position: [0, 0, 3]
});
let controler = cameraNode.createAbility(AOrbitControls, { mainElement: document.getElementById("o3-demo") });

engine.run();
