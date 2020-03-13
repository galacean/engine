import { Engine } from "@alipay/o3-core";
import { Logger } from "@alipay/o3-base";
import { ResourceLoader, Resource } from "@alipay/o3-loader";
import { ADefaultCamera } from "@alipay/o3-default-camera";
import { AOrbitControls } from "@alipay/o3-orbit-controls";
import { PBRMaterial } from "@alipay/o3-pbr";
import { ADirectLight, AEnvironmentMapLight } from "@alipay/o3-lighting";
import * as dat from "dat.gui";
import "@alipay/o3-engine-stats";
import { RegistExtension } from "@alipay/o3-loader-gltf";
import { PlaneProbe } from "@alipay/o3-env-probe";

const gui = new dat.GUI();
RegistExtension({ PBRMaterial });
Logger.enable();
let engine = new Engine();
let scene = engine.currentScene;
const resourceLoader = new ResourceLoader(engine);
let materials = [];
/**node*/
let rootNode = scene.root;
let directLightNode = rootNode.createChild("dir_light");
let directLightNode2 = rootNode.createChild("dir_light");
let envLightNode = rootNode.createChild("env_light");
let cameraNode = rootNode.createChild("camera_node");
let modelNode = null;

/**ability*/
// light
let directLight = directLightNode.createAbility(ADirectLight, {
  color: [1, 1, 1],
  intensity: 0.5
});
let directLight2 = directLightNode2.createAbility(ADirectLight, {
  color: [1, 1, 1],
  intensity: 0.5
});
directLightNode.setRotationAngles(180, 0, 0);
directLightNode2.setRotationAngles(45, 0, 0);
let envLight = envLightNode.createAbility(AEnvironmentMapLight, {});

let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: "o3-demo",
  position: [0, 0.2, 0.5],
  clearParam: [0.9, 0.9, 0.9, 1]
});
let controler = cameraNode.createAbility(AOrbitControls, { mainElement: document.getElementById("r3-demo") });
controler.target = [0, 0.1, 0];

/**resources*/
const cubeTextureRes = new Resource(name, {
  type: "cubemap",
  urls: [
    `/static/skybox/minisampler/px.jpg`,
    `/static/skybox/minisampler/nx.jpg`,
    `/static/skybox/minisampler/py.jpg`,
    `/static/skybox/minisampler/ny.jpg`,
    `/static/skybox/minisampler/pz.jpg`,
    `/static/skybox/minisampler/nz.jpg`
  ]
});

resourceLoader.load(cubeTextureRes, (err, res) => {
  envLight.specularMap = res.asset;
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
    // modelNode.position[0] += 0.1;
    asset.rootScene.nodes.forEach(n => modelNode.addChild(n));
    asset.meshes.forEach(mesh => {
      mesh.primitives.forEach(p => materials.push(p.material));
    });
    onLoad && onLoad(res);
  });
}

//-- run
engine.run();

debugModel("/static/model/perturbation-test/scene.gltf", res => {
  let pingshen = materials[0];
  let logo = materials[1];
  let water = materials[2];
  let cap = materials[3];
  pingshen.srgb = true;
  pingshen.gamma = true;
  logo.srgb = true;
  logo.gamma = true;
  water.srgb = true;
  water.gamma = true;
  cap.srgb = true;
  cap.gamma = true;
  const probe = rootNode.createAbility(PlaneProbe, {
    width: 2048,
    height: 2048,
    renderList: [pingshen, cap, logo]
  });
  water.refractionTexture = probe.texture;
  water.refractionDepth = 0.025; // 瓶身的厚度
  // probe.onTextureChange = texture => {
  //   water.perturbationTexture = texture;
  // };
  gui.add(water, "refractionRatio", 0, 1, 0.01).name("折射率");
});
