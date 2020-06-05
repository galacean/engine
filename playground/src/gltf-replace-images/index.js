import { Engine } from "@alipay/o3-core";
import { ADefaultCamera } from "@alipay/o3-default-camera";
import { ResourceLoader, Resource } from "@alipay/o3-loader";
import { ADirectLight, AAmbientLight, AEnvironmentMapLight } from "@alipay/o3-lighting";
import { vec3 } from "@alipay/o3-math";
import "@alipay/o3-loader-gltf";
import { PBRMaterial } from "@alipay/o3-pbr";
import { RegistExtension } from "@alipay/o3-loader-gltf";
import { AOrbitControls } from "@alipay/o3-orbit-controls";
import { GLCapabilityType } from "@alipay/o3-base";

RegistExtension({ PBRMaterial });

//-- create engine object
let engine = new Engine();

let scene = engine.currentScene;
let rootNode = scene.root;

//-- create camera
let cameraNode = rootNode.createChild("camera_node");
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: "o3-demo",
  position: [50, 50, 50],
  target: [0, 0, 0],
  fov: 50
});

cameraNode.createAbility(AOrbitControls);
const rhi = engine.getRHI("o3-demo");
let replaceImages;

if (rhi.canIUse(GLCapabilityType.s3tc)) {
  replaceImages = [
    {
      url: "https://gw.alipayobjects.com/os/bmw-prod/f37edf96-88a5-402e-8c35-28820f2f3358.ktx",
      type: "ktx"
    }
  ];
} else if (rhi.canIUse(GLCapabilityType.astc)) {
  replaceImages = [
    {
      url:
        "https://gw.alipayobjects.com/os/OasisHub/46bf8263-af6c-446f-a603-4c856cb1e0f8/48000049/0.8797747653168839.ktx",
      type: "ktx"
    }
  ];
} else if (rhi.canIUse(GLCapabilityType.pvrtc)) {
  replaceImages = [
    {
      url:
        "https://gw.alipayobjects.com/os/OasisHub/ac97feec-a669-46ac-bd23-5b8ae2417ebe/48000049/0.5431618269006637.ktx",
      type: "ktx"
    }
  ];
} else {
  replaceImages = [
    {
      url: "https://gw.alipayobjects.com/mdn/rms_45d093/afts/img/A*u8GNQbr43LIAAAAAAAAAAABkARQnAQ",
      type: "image"
    }
  ];
}

// load resource config
const animationRes = new Resource("pig_glb", {
  type: "gltf",
  url: "https://gw.alipayobjects.com/os/OasisHub/bba48d24-6b9a-44b1-b865-8b2e87864f4c/48000049/0.9268095018831977.gltf",
  config: {
    images: replaceImages
  }
});

const light1 = rootNode.createChild("light1");
light1.createAbility(ADirectLight, {
  color: vec3.normalize([], [239, 239, 255]),
  intensity: 1.5
});

const light2 = rootNode.createChild("light1");
light2.createAbility(ADirectLight, {
  color: vec3.normalize([], [255, 239, 239]),
  intensity: 1.5
});

rootNode.createAbility(AAmbientLight);

const resourceLoader = new ResourceLoader(engine);
// resourceLoader.loadConfig
resourceLoader.load(animationRes, (err, gltf) => {
  const horsePrefab = gltf.asset.rootScene.nodes[0];

  const horse = horsePrefab.clone();

  rootNode.addChild(horse);
});

//-- run
engine.run();
