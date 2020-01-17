import { vec3, mat4 } from '@alipay/o3-math';
import { Logger, TextureFilter } from '@alipay/o3-base';
import { Engine, SceneVisitor } from '@alipay/o3-core';
import { ResourceLoader, Resource } from '@alipay/o3-loader';
import { RegistExtension } from '@alipay/o3-loader-gltf';
import { ADefaultCamera } from '@alipay/o3-default-camera';
import { AOrbitControls } from '@alipay/o3-orbit-controls';
import { AEnvironmentMapLight, PBRMaterial } from '@alipay/o3-pbr';
import { ASkyBox } from '@alipay/o3-skybox';
import { ADirectLight } from '@alipay/o3-lighting';
import '@alipay/o3-engine-stats';
import '@alipay/o3-shadow';

import { PostProcessFeature, addDepthPass, DepthOfFieldEffect } from '@alipay/o3-post-processing';
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
  canvas: 'o3-demo', position: [280, 100, 280], near: 1, far: 1000,
  clearParam: [0, 0, 0, 0]
};
let camera = cameraNode.createAbility(ADefaultCamera, cameraProps);
let controler = cameraNode.createAbility(AOrbitControls, { mainElement: document.getElementById('o3-demo') });

//-- create light
let light = rootNode.createChild("light");
light.position = [-300, 600, 300];
light.lookAt([0, 0, 0], [0, 1, 0]);
let directLight = light.createAbility(ADirectLight, {
  color: vec3.fromValues(0, 0, 0),
  intensity: 0.0
});
directLight.enableShadow = true;
directLight.shadow.setMapSize(2048, 2048);
directLight.shadow.intensity = 0.618;
directLight.shadow.bias = 0.000001;
mat4.ortho(directLight.shadow.projectionMatrix, -300, 300, -300, 300, 1, 1000);


//--
const resourceLoader = new ResourceLoader(engine);
resourceLoader.batchLoad(ResourceList, (err, res) => {

  let node = rootNode.createChild('gltf_node');
  //node.scale = vec3.fromValues(0.08,0.08,0.08);
  //node.scale = vec3.fromValues(1.0,1.0,1.0);

  const glb = res[6];
  const nodes = glb.asset.rootScene.nodes;
  nodes.forEach(n => {
    node.addChild(n);
  });
  enableChessShadow(scene);

  // enviroment light
  const lut = res[1].asset;
  let envLightNode = rootNode.createChild('env_light');
  let envLight = envLightNode.createAbility(AEnvironmentMapLight);
  envLight.brdfMap = lut;
  envLight.diffuseMap = res[2].asset;
  envLight.specularMap = res[3].asset;
  envLightNode.createAbility(ASkyBox, { skyBoxMap: res[4].asset });

  //-- post processing
  const postProcess = scene.findFeature(PostProcessFeature);
  postProcess.initRT();

  const sceneDepthRT = addDepthPass(camera, 0, 1024);

  const dof = new DepthOfFieldEffect(postProcess);
  dof.depthTexture = sceneDepthRT.texture;
  postProcess.addEffect(dof);

  createControllerUI('Depth of Field', {
    focusDepth:[0,1000],
    focusLength:[20,200],
    focusStop:[0,8],
    maxBlur:[0,10],
    showFocus:[-1.0,1.0],
  }, dof);

});

//-- run
engine.run();

//--
function enableChessShadow(scene) {

  //-- enable shadow
  class SceneShadowEnable extends SceneVisitor {
    acceptAbility(nodeAbility) {
      let node = nodeAbility.node;
      let p = node.name.indexOf('chess');
      if (p != -1) {

        if (node.name === 'chess_1_34' || node.name === 'chess_1_1') {
          nodeAbility.recieveShadow = true;
        } else {
          nodeAbility.castShadow = true;
          console.log('shadow: p',node);
        }
      }
    }
  };

  scene.visitSceneGraph(new SceneShadowEnable());

}
