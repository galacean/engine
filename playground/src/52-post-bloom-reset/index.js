import { Logger } from '@alipay/r3-base';
import { Engine } from '@alipay/r3-core';
import { ResourceLoader } from '@alipay/r3-loader';
import { RegistExtension } from '@alipay/r3-loader-gltf';
import { ADefaultCamera } from '@alipay/r3-default-camera';
import { AOrbitControls } from '@alipay/r3-orbit-controls';
import { AEnvironmentMapLight, PBRMaterial } from '@alipay/r3-pbr';
import { ASkyBox } from '@alipay/r3-skybox';
import '@alipay/r3-engine-stats';

import { PostProcessFeature, BloomResetEffect, SMAAEffect } from '@alipay/r3-post-processing';

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
  canvas: 'r3-demo', position: [2, 0, 2], near: 0.1, far: 100,
  clearParam: [0, 0, 0, 1]
};
let camera = cameraNode.createAbility(ADefaultCamera, cameraProps);
let controler = cameraNode.createAbility(AOrbitControls, { canvas: document.getElementById('r3-demo') });

//--
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
  // node.createAbility(ASkyBox, { skyBoxMap: res[4].asset });

  //-- post processing
  const postProcess = scene.findFeature(PostProcessFeature);
  postProcess.initRT(camera.canvas.width,camera.canvas.height);

  const smaa = new SMAAEffect(postProcess);
  postProcess.addEffect(smaa);
  const smaa1 = new SMAAEffect(postProcess);
  postProcess.addEffect(smaa1);

  const bloom = new BloomResetEffect(postProcess);
  postProcess.addEffect(bloom);


  //-- dat gui
  const gui = createControllerUI('bloom', {
    exposure: [0, 2],
    threshold: [0, 2],
    kernel: [0, 500],
    weight: [0, 2],
    horizontalBlur: [0, 5],
    verticalBlur: [0, 5]
  }, bloom);

  const tintColor = { tintColor: bloom.tintColor.map( v => v * 255 ) }
  gui.addColor( tintColor, 'tintColor' ).onChange( v => bloom.tintColor = v.map( va => va / 255 ) );

});


//-- run
engine.run();
