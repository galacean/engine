import { vec4 } from '@alipay/o3-math';
import { Engine } from '@alipay/o3-core';
import { ADefaultCamera } from '@alipay/o3-default-camera';
import { AGeometryRenderer } from '@alipay/o3-geometry';
import { PlaneGeometry } from '@alipay/o3-geometry-shape';
import { ResourceLoader, Resource } from '@alipay/o3-loader';
import { AAmbientLight } from '@alipay/o3-lighting';
import { ConstantMaterial, TextureMaterial } from '@alipay/o3-mobile-material';
import '@alipay/o3-compressed-texture';

import '@alipay/o3-engine-stats';


import { Logger } from '@alipay/o3-base';

Logger.enable();

//-- create engine object
let engine = new Engine();
const originUrl = "https://gw.alipayobjects.com/mdn/rms_45d093/afts/img/A*6Pe0TK41flYAAAAAAAAAAABkARQnAQ";
const originTexture = new Resource("origin", {
  type: "texture",
  url: originUrl
});

const dxt1MipmapUrl = "https://gw.alipayobjects.com/os/bmw-prod/b38cb09e-154c-430e-98c8-81dc19d4fb8e.ktx";
const dxt1MipmapTexture = new Resource("dxt1", {
  type: "ktx",
  url: dxt1MipmapUrl
});

const dxt1Url = "https://gw.alipayobjects.com/os/bmw-prod/62146f21-576f-4586-9ba1-85145d2fd4bc.ktx";
const dxt1Texture = new Resource("dxt1", {
  type: "ktx",
  url: dxt1Url
});
const resourceLoader = new ResourceLoader(engine);
let scene = engine.currentScene;
let rootNode = scene.root;

//-- create light
let light = rootNode.createChild("light1");
light.createAbility(AAmbientLight);

const w = 1;

resourceLoader.load(originTexture, (err, res) => {
  const texture = res.asset;
  let mtl = new TextureMaterial('origin');
  mtl.texture = texture;

  let obj1 = rootNode.createChild("obj1");
  obj1.position = [-1, 1, 0];
  let cubeRenderer1 = obj1.createAbility(AGeometryRenderer);
  cubeRenderer1.geometry = new PlaneGeometry(w, w);
  cubeRenderer1.setMaterial(mtl);
});

resourceLoader.load(dxt1MipmapTexture, (err, res) => {
  const texture = res.asset;

  console.log("dxt1mipmap", res);
  let mtl = new TextureMaterial('dxt1mipmap');
  mtl.texture = texture;

  let obj = rootNode.createChild("obj2");
  obj.position = [-1, 0, 0];
  let cubeRenderer2 = obj.createAbility(AGeometryRenderer);
  cubeRenderer2.geometry = new PlaneGeometry(w, w);
  cubeRenderer2.setMaterial(mtl);
})

resourceLoader.load(dxt1Texture, (err, res) => {
  const texture = res.asset;

  console.log("dxt1", res);
  let mtl = new TextureMaterial('dxt1');
  mtl.texture = texture;

  let obj = rootNode.createChild("obj2-1");
  obj.position = [0, 0, 0];
  let cubeRenderer2 = obj.createAbility(AGeometryRenderer);
  cubeRenderer2.geometry = new PlaneGeometry(w, w);
  cubeRenderer2.setMaterial(mtl);
});


//-- create camera
let cameraNode = rootNode.createChild('camera_node');
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'o3-demo', position: [0, 0, 5], near: 0.1, far: 100
});

//-- run
engine.run();

