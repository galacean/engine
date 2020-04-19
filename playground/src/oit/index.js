import { Engine } from "@alipay/o3-core";
import { Logger } from "@alipay/o3-base";
import { ResourceLoader, Resource } from "@alipay/o3-loader";
import { ADefaultCamera } from "@alipay/o3-default-camera";
import { AOrbitControls } from "@alipay/o3-orbit-controls";
import { PBRMaterial } from "@alipay/o3-pbr";
import { ASkyBox } from "@alipay/o3-skybox";
import { ADirectLight, AEnvironmentMapLight } from "@alipay/o3-lighting";
import "@alipay/o3-engine-stats";
import { RegistExtension } from "@alipay/o3-loader-gltf";
import { OITSceneRenderer } from "@alipay/o3-renderer-oit";

import { addSceneGUI, addMobileGUI, addPBRGUI, addOITDebug } from "./debug";
import { cubeTextureList, textureList, cubeTextureRes, textureRes, cubeTextures, textures } from "./asset";

RegistExtension({ PBRMaterial });
Logger.enable();
let engine = new Engine();
let scene = engine.currentScene;
const resourceLoader = new ResourceLoader(engine);

/**node*/
let rootNode = scene.root;
let directLightNode = rootNode.createChild("dir_light");
let directLightNode2 = rootNode.createChild("dir_light");
let envLightNode = rootNode.createChild("env_light");
let cameraNode = rootNode.createChild("camera_node");
let modelNode = null;

/**ability*/
let skybox = null;
let directLight = directLightNode.createAbility(ADirectLight, {
  color: [1, 1, 1],
  intensity: 0.3
});
let directLight2 = directLightNode2.createAbility(ADirectLight, {
  color: [1, 1, 1],
  intensity: 0.3
});
directLightNode.setRotationAngles(180, 0, 0);
directLightNode2.setRotationAngles(45, 0, 0);
const envLight = envLightNode.createAbility(AEnvironmentMapLight, {});

const cameraConfig = {
  canvas: "o3-demo",
  clearParam: [1, 1, 1, 1],
  position: [0, 10, 20],
  attributes: {
    alpha: false
  }
};

/**  OIT here */

const camera = cameraNode.createAbility(ADefaultCamera, cameraConfig);
const oitSceneRender = new OITSceneRenderer(camera);
addOITDebug(camera, oitSceneRender);

let controler = cameraNode.createAbility(AOrbitControls, { mainElement: document.getElementById("r3-demo") });
controler.target = [0, 5, 0];

let meshes = [];
let materials = [];

resourceLoader.batchLoad(cubeTextureRes, (err, reses) => {
  cubeTextureList.forEach((name, index) => {
    cubeTextures[name] = reses[index].asset;
  });
  skybox = rootNode.createAbility(ASkyBox, { skyBoxMap: cubeTextures.sky });
  skybox.enabled = false;

  envLight.specularMap = cubeTextures.minisampler;
});

resourceLoader.batchLoad(textureRes, (err, reses) => {
  textureList.forEach((name, index) => {
    textures[name] = reses[index].asset;
  });
  debugModel("/static/model/MeetMat/MeetMat.gltf");
  // debugModel("/static/model/dragon/dragon.gltf");
});

/** 调试模型或者shape*/
function updateModelNode() {
  modelNode && modelNode.destroy();
  modelNode = rootNode.createChild("modelNode");
  return modelNode;
}

function debugModel(modelUrl, onLoad) {
  const gltfRes = new Resource("gltf", {
    type: "gltf",
    url: modelUrl
  });
  resourceLoader.load(gltfRes, (err, res) => {
    if (err) return;
    let asset = res.asset;
    updateModelNode();

    asset.rootScene.nodes.forEach(n => {
      modelNode.addChild(n);
    });

    meshes = asset.meshes;
    meshes.forEach(mesh => {
      const material = mesh.primitives[0].material;
      material.doubleSided = true;
      material.metallicFactor = 0;
      material.roughnessFactor = 0;

      if (material.name === "foot") {
        material.baseColorFactor = [1, 0, 0, 1];
      } else {
        if (material.name === "body") {
          material.baseColorFactor = [0, 0, 1, 1];
        } else {
          material.baseColorFactor = [0, 1, 0, 1];
        }
        material.opacity = 0.8;
        material.alphaMode = "BLEND";
      }

      materials.push(material);
    });

    addSceneGUI({ envLight, lights: [directLight, directLight2], skybox, meshes, materials });
    // addMobileGUI(materials);
    addPBRGUI(materials);
    onLoad && onLoad(res);
  });
}

//-- run
engine.run();
