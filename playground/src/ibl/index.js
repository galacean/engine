import { Engine } from "@alipay/o3-core";
import { ResourceLoader, Resource } from "@alipay/o3-loader";
import { ADefaultCamera } from "@alipay/o3-default-camera";
import { AOrbitControls } from "@alipay/o3-orbit-controls";
import { PBRMaterial } from "@alipay/o3-pbr";
import { AEnvironmentMapLight } from "@alipay/o3-lighting";
import "@alipay/o3-engine-stats";
import { RegistExtension } from "@alipay/o3-loader-gltf";
import { SphereGeometry } from "@alipay/o3-geometry-shape";
import { Mesh, AMeshRenderer } from "@alipay/o3-mesh";

RegistExtension({ PBRMaterial });

let engine = new Engine();
let scene = engine.currentScene;
const resourceLoader = new ResourceLoader(engine);
/**node*/
let rootNode = scene.root;
let directLightNode = rootNode.createChild("dir_light");
let directLightNode2 = rootNode.createChild("dir_light");
let envLightNode = rootNode.createChild("env_light");
let cameraNode = rootNode.createChild("camera_node");

directLightNode.setRotationAngles(180, 0, 0);
directLightNode2.setRotationAngles(45, 0, 0);
let envLight = envLightNode.createAbility(AEnvironmentMapLight, {});

let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: "o3-demo",
  position: [0, 0.2, 30],
  clearParam: [0.9, 0.9, 0.9, 1]
});
let controler = cameraNode.createAbility(AOrbitControls, { mainElement: document.getElementById("r3-demo") });
controler.target = [0, 0.1, 0];

/**resources*/
const cubeTextureList = ["sky", "house", "sunnyDay", "minisampler"];
const textureList = ["luminance.jpg", "opacity_grid.png"];
const cubeTextureRes = cubeTextureList.map(
  name =>
    new Resource(name, {
      type: "cubemap",
      urls: [
        `/static/skybox/${name}/px.jpg`,
        `/static/skybox/${name}/nx.jpg`,
        `/static/skybox/${name}/py.jpg`,
        `/static/skybox/${name}/ny.jpg`,
        `/static/skybox/${name}/pz.jpg`,
        `/static/skybox/${name}/nz.jpg`
      ]
    })
);
const textureRes = textureList.map(
  name =>
    new Resource(name, {
      type: "texture",
      url: `/static/texture/${name}`
    })
);
const cubeTextures = {};
const textures = {};

resourceLoader.batchLoad(cubeTextureRes, (err, reses) => {
  cubeTextureList.forEach((name, index) => {
    cubeTextures[name] = reses[index].asset;
  });

  envLight.specularMap = cubeTextures.minisampler;
});

resourceLoader.batchLoad(textureRes, (err, reses) => {
  textureList.forEach((name, index) => {
    textures[name] = reses[index].asset;
  });
});

const geometry = new SphereGeometry(5, 64, 64);
const { primitive } = geometry;
const material = new PBRMaterial("pbr", {
  roughnessFactor: 0,
  metallicFactor: 1
});
const modelNode = rootNode.createChild("modelNode");
const mesh = new Mesh("defaultMesh");
primitive.material = material;
mesh.primitives.push(primitive);
modelNode.createAbility(AMeshRenderer, { mesh });

// meshes = [mesh];
// materials = [material];

//-- run
engine.run();
