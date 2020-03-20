import { Engine, NodeAbility } from "@alipay/o3-core";
import { ResourceLoader, Resource } from "@alipay/o3-loader";
import { RegistExtension } from "@alipay/o3-loader-gltf";
import { AHUDLabel } from "../common/AHUDLabel";
import { ADefaultCamera } from "@alipay/o3-default-camera";
import { AOrbitControls } from "@alipay/o3-orbit-controls";
import { PBRMaterial } from "@alipay/o3-pbr";
import { AAmbientLight, ADirectLight } from "@alipay/o3-lighting";
import { Logger } from "@alipay/o3-base";
import { vec3 } from "@alipay/o3-math";
import "@alipay/o3-engine-stats";

RegistExtension({ PBRMaterial });

//-- create engine object
let engine = new Engine();

let scene = engine.currentScene;
let rootNode = scene.root;

const light1 = rootNode.createChild("light1");
light1.createAbility(ADirectLight, {
  color: vec3.normalize([], [239, 239, 255]),
  intensity: 0.5
});
light1.position = [0, 0, 1];
light1.lookAt([0, 0, 0], [0, 1, 0]);

let ambientLightNode = rootNode.createChild("ambient_light");
let ambientLight = ambientLightNode.createAbility(AAmbientLight, {
  color: [1.0, 1.0, 1.0],
  intensity: 0.3
});
ambientLight.enabled = true;

const resourceLoader = new ResourceLoader(engine);

//-- create camera
let cameraNode = rootNode.createChild("camera_node");
let cameraProps = {
  canvas: "o3-demo",
  position: [0, 0, 100],
  target: [0, 0, 0],
  fov: 50
};
cameraNode.createAbility(ADefaultCamera, cameraProps);
cameraNode.createAbility(AOrbitControls, { mainElement: document.getElementById("o3-demo") });

const labelNode = rootNode.createChild('labelNode');
labelNode.position = vec3.fromValues(0, 10, 0);
const label = labelNode.createAbility(AHUDLabel, {
  spriteID: "label1",
  textureSize: [500, 100],
  renderMode: "2D",
  screenSize: [500, 100]
});
label.text = "";

const labelNode2 = rootNode.createChild('labelNode2');
labelNode2.position = vec3.fromValues(0, -10, 0);
const label2 = labelNode2.createAbility(AHUDLabel, {
  spriteID: "label2",
  textureSize: [500, 100],
  renderMode: "2D",
  screenSize: [500, 100]
});
label2.text = "";

function loadGLTFS() {
  const gltfUrls = [
    "https://gw.alipayobjects.com/os/loanprod/3329a903-ebec-422f-a29c-b79b9a4a3241/5e6f3f5cb672a60f2ff1628a/3f9e590f602171c582ccf2ab2558d3f9.gltf",
    "https://gw.alipayobjects.com/os/loanprod/895eb32b-05ef-4a8c-a260-73b1baa9e3b5/5e6f3f5cb672a60f2ff1628a/8516695adf750756aff9f5606da993fd.gltf",
  ];
  for (let i = 0; i < 4; i++) {
    gltfUrls.push(gltfUrls[0]);
    gltfUrls.push(gltfUrls[1]);
  }
  return new Promise(resolve => {
    let size = 0;
    label.text = "render 10 normal glTFs...binary size:" + size;
    let count = 0;
    let start = Date.now();
    gltfUrls.forEach((url, index) => {
      const res = new Resource("gltf" + index, {
        type: "gltf",
        url: url + "?" + Math.random()
      });
      resourceLoader.load(res, (err, gltf) => {
        console.log("gltf", gltf);
        const prefab = gltf.asset.rootScene.nodes[0];
        const model = prefab.clone();
        model.position = [20 * ((index % 5) - 2), Math.floor(index / 5) * -10 + 40, 0];
        rootNode.addChild(model);
        count++;
        size += gltf.data.buffers[0].byteLength;
        label.text = "render 10 normal glTFs...binary size: " + (size / 1048576).toFixed(1) + "MB";
        if (count === gltfUrls.length) {
          label.text =
            "render normal glTFs complete, binary size: " +
            (size / 1048576).toFixed(1) +
            "MB, cost:" +
            (Date.now() - start) +
            "ms";
          resolve();
        }
      });
    });
  });
}

function loadDracos() {
  const dracoUrls = [
    "https://gw.alipayobjects.com/os/loanprod/d8f20ec8-2c86-4f40-b10a-ef02f33fdfdf/5e6f3f5cb672a60f2ff1628a/021f18a39a073fd57a2f7446342d358c.gltf",
    "https://gw.alipayobjects.com/os/loanprod/ecf7f520-d059-4ba3-a80c-3eae3292b04f/5e6f3f5cb672a60f2ff1628a/140d2d940e463da9a14e82e9d192239e.gltf"
  ];
  for (let i = 0; i < 4; i++) {
    dracoUrls.push(dracoUrls[0]);
    dracoUrls.push(dracoUrls[1]);
  }
  return new Promise(resolve => {
    let size = 0;
    label2.text = "render 10 draco glTFs...binary size:" + size;
    let count = 0;
    let start = Date.now();
    dracoUrls.forEach((url, index) => {
      const res = new Resource("draco" + index, {
        type: "gltf",
        url: url + "?" + Math.random()
      });
      resourceLoader.load(res, (err, gltf) => {
        console.log("draco", gltf);
        const prefab = gltf.asset.rootScene.nodes[0];
        const model = prefab.clone();
        model.position = [20 * ((index % 5) - 2), Math.floor(index / 5) * -10 - 30, 0];
        rootNode.addChild(model);
        count++;
        size += gltf.data.buffers[0].byteLength;
        label2.text = "render 10 draco glTFs...binary size: " + (size / 1048576).toFixed(1) + "MB";
        if (count === dracoUrls.length) {
          label2.text =
            "render draco glTFs complete, binary size: " +
            (size / 1048576).toFixed(1) +
            "MB, cost:" +
            (Date.now() - start) +
            "ms";
          resolve();
        }
      });
    });
  });
}

loadGLTFS().then(() => {
  loadDracos();
});

// let index = 0;
// function loadModel(res) {
//   return new Promise(resolve => {
//     resourceLoader.load(res, (err, gltf) => {
//       console.log("gltf", gltf)
//       const prefab = gltf.asset.rootScene.nodes[0];
//       const model = prefab.clone();
//       model.position = [20 * ((index % 5) - 2), Math.floor(index / 5) * -10 + 40, 0];
//       console.log(model)
//       rootNode.addChild(model);
//       index++;
//       resolve();
//     });
//   });
// }

// function loadModels(index) {
//   console.log("index", index)
//   if (index < gltfResArray.length) {
//     loadModel(gltfResArray[index]).then(() => {
//       loadModels(++index);
//     });
//   }
// }

// loadModels(0);




// const gltfRes = new Resource("campaign_gltf", {
//   type: "gltf",
//   url:
//     // normal
//     // "https://gw.alipayobjects.com/os/loanprod/d8b50faa-f820-41b4-afcc-3c3402bc339f/5e6f331c0ff63404d1dde240/76acefccc8dd22fd03f9a9390c2da9c8.gltf"
//     // draco
//     // 'https://gw.alipayobjects.com/os/loanprod/0696229b-19aa-4465-998b-edd5e269d6a2/5e68a8b0891f391edc234411/020029e68aabdf169438fa1000867341.gltf'
//     // morph
//     // "https://gw.alipayobjects.com/os/loanprod/145900af-fa11-4de6-b923-bc5eef913121/5e6f3f5cb672a60f2ff1628a/687d5a677da2a3f4557a24de8e00f6d0.gltf"
//     // morph draco
//     // "https://gw.alipayobjects.com/os/loanprod/d0718709-d679-49d4-a1ab-53f96c9ccc92/5e6f3f5cb672a60f2ff1628a/06d38e08f62a95250c8a1114ec84947a.gltf"
//     // morph glb
//     // "https://gw.alipayobjects.com/os/bmw-prod/0e977d77-f53d-452e-97c9-072e6bd37d01.glb"
//     // morph draco glb
//     // "https://gw.alipayobjects.com/os/bmw-prod/e981f64d-dd48-49d4-83f5-3da3704bc8a7.glb"
//     // su-25
//     // "https://gw.alipayobjects.com/os/loanprod/3329a903-ebec-422f-a29c-b79b9a4a3241/5e6f3f5cb672a60f2ff1628a/3f9e590f602171c582ccf2ab2558d3f9.gltf"
//     // su-25 draco
//     "https://gw.alipayobjects.com/os/loanprod/a7fe0742-9492-44ad-a4eb-a1f5188b6a39/5e6f3f5cb672a60f2ff1628a/d8b97eeee135e2fd32f8cea8e110f4e9.gltf"
// });

//-- run
engine.run();
