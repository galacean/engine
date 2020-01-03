import { Engine } from "@alipay/o3-core";
import { LambertMaterial } from "@alipay/o3-mobile-material";
import { ResourceLoader, Resource } from "@alipay/o3-loader";
import { AGeometryRenderer } from "@alipay/o3-geometry";
import { ADefaultCamera } from "@alipay/o3-default-camera";
import { AOrbitControls } from "@alipay/o3-orbit-controls";
import { AEnvironmentMapLight, PBRMaterial } from "@alipay/o3-pbr";
import { SphereGeometry } from "@alipay/o3-geometry-shape";
import { ASkyBox } from "@alipay/o3-skybox";
import { AAmbientLight, ADirectLight, APointLight, ASpotLight } from "@alipay/o3-lighting";
import * as dat from "dat.gui";
import "@alipay/o3-engine-stats";
import { Mesh, AMeshRenderer } from "@alipay/o3-mesh";
import { RegistExtension } from "@alipay/o3-loader-gltf";
import { ReflectionProbe } from "@alipay/o3-env-probe";
import { MoveAbility } from "./MoveAbility";

RegistExtension({ PBRMaterial });
const gui = new dat.GUI();
const engine = new Engine();
const scene = engine.currentScene;
const resourceLoader = new ResourceLoader(engine);

/**node*/
const rootNode = scene.root;
const directLightNode = rootNode.createChild("dir_light");
const directLightNode2 = rootNode.createChild("dir_light");
const envLightNode = rootNode.createChild("env_light");
const cameraNode = rootNode.createChild("camera_node");

/**ability*/
// light
directLightNode.createAbility(ADirectLight, {
  color: [1, 1, 1],
  intensity: 1
});
directLightNode2.createAbility(ADirectLight, {
  color: [1, 1, 1],
  intensity: 1
});
directLightNode.setRotationAngles(180, 0, 0);
directLightNode2.setRotationAngles(45, 0, 0);
const envLight = envLightNode.createAbility(AEnvironmentMapLight, {
  specularIntensity: 1.5
});

const camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: "o3-demo",
  position: [0, 0, 5],
  clearParam: [0.9, 0.9, 0.9, 1]
});

const controler = cameraNode.createAbility(AOrbitControls);
controler.maxDistance = 30;
controler.minDistance = 0;

/**resources*/
const cubeTextureRes = new Resource(name, {
  type: "cubemap",
  urls: [
    `/static/skybox/house/px.jpg`,
    `/static/skybox/house/nx.jpg`,
    `/static/skybox/house/py.jpg`,
    `/static/skybox/house/ny.jpg`,
    `/static/skybox/house/pz.jpg`,
    `/static/skybox/house/nz.jpg`
  ]
});

let skybox = null;

function load(modelUrl, onLoad) {
  const gltfRes = new Resource("gltf", {
    type: "gltf",
    url: modelUrl
  });
  resourceLoader.batchLoad([gltfRes, cubeTextureRes], (err, reses) => {
    if (err) return;
    skybox = rootNode.createAbility(ASkyBox, { skyBoxMap: reses[1].asset });
    const gltf = reses[0].asset;
    const modelNode = rootNode.createChild("modelNode");
    gltf.rootScene.nodes.forEach(n => modelNode.addChild(n));
    onLoad && onLoad(reses);
  });
}

//-- run
engine.run();

function createSphere(material) {
  const sphereNode = rootNode.createChild("sphere");
  const geometry = new SphereGeometry(1, 64, 64);
  sphereNode.createAbility(AGeometryRenderer, {
    geometry,
    material
  });
  return sphereNode;
}

function reflectionDemo() {
  const sphere1Mat = new LambertMaterial("sphere1Mat");
  sphere1Mat.diffuse = [1, 0, 0, 1];
  const sphere2Mat = new LambertMaterial("sphere2Mat");
  sphere2Mat.diffuse = [0, 1, 0, 1];
  const sphere3Mat = new LambertMaterial("sphere3Mat");
  sphere3Mat.diffuse = [0, 0, 1, 1];

  const sphere1 = createSphere(sphere1Mat);
  const sphere2 = createSphere(sphere2Mat);
  const sphere3 = createSphere(sphere3Mat);
  const aMove1 = sphere1.createAbility(MoveAbility, {
    radius: 4,
    onX: () => 0
  });
  const aMove2 = sphere2.createAbility(MoveAbility, {
    radius: 3,
    onY: () => 0
  });
  const aMove3 = sphere3.createAbility(MoveAbility, {
    onZ: () => 0,
    onX: time => Math.sin(time + 2) * 5,
    onY: time => Math.cos(time + 2) * 5
  });

  const probe1 = rootNode.createAbility(ReflectionProbe, {
    // renderAll: true
    renderList: [sphere1Mat, sphere2Mat, sphere3Mat, skybox.material]
  });
  probe1.onTextureChange = cubeTexture => {
    envLight.specularMap = cubeTexture;
  };

  // debug
  const state = {
    enableAnimate: true,
    enableProbe: true,
    size: 1024
  };
  gui
    .add(state, "enableAnimate")
    .onChange(v => {
      aMove1.enabled = v;
      aMove2.enabled = v;
      aMove3.enabled = v;
    })
    .name("动画开关");
  gui
    .add(state, "enableProbe")
    .onChange(v => {
      probe1.enabled = v;
    })
    .name("动态反射开关");
  gui
    .add(state, "size", 1, 4096)
    .onChange(size => {
      probe1.size = size;
    })
    .name("分辨率");
}

load("/static/model/DamangedHelmet/DamagedHelmet.gltf", reflectionDemo);
