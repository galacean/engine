import { Logger } from '@alipay/r3-base';
import { Engine } from '@alipay/r3-core';
import { ResourceLoader } from '@alipay/r3-loader';
import { RegistExtension } from '@alipay/r3-loader-gltf';
import { ADefaultCamera } from '@alipay/r3-default-camera';
import { AOrbitControls } from '@alipay/r3-orbit-controls';
import { AEnvironmentMapLight, PBRMaterial } from '@alipay/r3-pbr';
import { ASkyBox } from '@alipay/r3-skybox';
import '@alipay/r3-engine-stats';

import { PostProcessFeature, ColorCorrectionEffect, AutoExposureEffect, VignetteEffect } from '@alipay/r3-post-processing';

import { ResourceList } from '../common/PBRResourceList';
import { createControllerUI } from '../common/ControllerUI';



//-------------------------------------------------------------------------------
Logger.enable();
RegistExtension({ PBRMaterial });

//-- create engine object
let engine = new Engine();
let scene = engine.currentScene;
let rootNode = scene.root;


//-- create camera
let cameraNode = rootNode.createChild('camera_node');

let cameraProps = {
  canvas: 'r3-demo', position: [0, 0, 3], near: 0.1, far: 100,
  clearParam: [0, 0, 0, 0]
};
let camera = cameraNode.createAbility(ADefaultCamera, cameraProps);
let controler = cameraNode.createAbility(AOrbitControls, { canvas: document.getElementById('r3-demo') });

const resourceLoader = new ResourceLoader(engine);
resourceLoader.batchLoad(ResourceList, (err, res) => {
  const glb = res[0];
  const nodes = glb.asset.rootScene.nodes;
  let node = rootNode.createChild('gltf_node');
  nodes.forEach(n => {
    node.addChild(n);
  });

  //-- enviroment light
  const lut = res[1].asset;
  let envLightNode = rootNode.createChild('env_light');
  let envLight = envLightNode.createAbility(AEnvironmentMapLight);
  envLight.brdfMap = lut;
  envLight.diffuseMap = res[2].asset;
  envLight.specularMap = res[3].asset;
  node.createAbility(ASkyBox, { skyBoxMap: res[4].asset });

  //-- post processing
  const postProcess = scene.findFeature(PostProcessFeature);
  postProcess.initRT();


  const colorX = new ColorCorrectionEffect(postProcess);
  colorX.rampTexture = res[5].asset;
  postProcess.addEffect(colorX);

  const autoExposure = new AutoExposureEffect(postProcess);
  //colorX.rampTexture = res[5].asset;
  postProcess.addEffect(autoExposure);

  createControllerUI('auto exposure', {
    LAvg:[0,1],
    KeyValue:[0,1],
  }, autoExposure);


  const vignette = new VignetteEffect(postProcess);
  postProcess.addEffect(vignette);

  createControllerUI('vignette', {
    colorR:[0,1],
    colorG:[0,1],
    colorB:[0,1],
    smoothingX:[-2,1],
    smoothingY:[0,4],
  }, vignette);



});


//-- run
engine.run();
