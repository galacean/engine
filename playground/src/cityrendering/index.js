//-- naive version with earcut
//top side face sepration 
import { vec3,vec4} from '@alipay/o3-math';
import { Logger ,RenderState,MaterialType,BlendFunc} from '@alipay/o3-base';
import { Engine, SceneFeature } from '@alipay/o3-core';

import { ADefaultCamera } from '@alipay/o3-default-camera';
import { AGeometryRenderer } from '@alipay/o3-geometry';
import { CuboidGeometry } from '@alipay/o3-geometry-shape';
import '@alipay/o3-engine-stats';
import { ResourceLoader,Resource } from '@alipay/o3-loader';
import {createBuildingMaterialWireFrame, BuildingMaterial4Fun} from './buildingMaterial';

import {createSideGeometry,createTopGeometry} from './buildingGeometryNaive'

import { ADirectLight } from '@alipay/o3-lighting';
import {CENTER,SCALE} from './constant';
import cityMap from './hangzhou-geo-very-small.json';
import dataProcessing from './dataProcessing.js'
import { AOrbitControls } from '@alipay/o3-orbit-controls'
import {BlinnPhongMaterial} from '@alipay/o3-mobile-material';
import {PostProcessFeature, BloomEffect} from '@alipay/o3-post-processing';

Logger.enable();

//-- 0:BlinnPhongMaterial,1: wireframe,2:transparency
let MaterialChooser = 0;
//-- 0:building only,1: plane only,2 : building and plane
let GeometryChooser = 2;

//-- create engine object
let engine = new Engine();
const resourceLoader = new ResourceLoader(engine);
let scene = engine.currentScene;
let rootNode = scene.root;

//-- create  material
let topMtl = new BlinnPhongMaterial('top_mtl', false);
topMtl.ambient = vec4.fromValues(0.0,0.0,0.0,1);
topMtl.diffuse = vec4.fromValues(0.0,0.0,0.0,1);
topMtl.shininess = 5;

let sideMtl = new BuildingMaterial4Fun('side_mtl', false);
sideMtl.ambient = vec4.fromValues(0.35, 0.05, 0.05, 1);
sideMtl.shininess = 10;

let sideMtl2 = new BuildingMaterial4Fun('side_mtl2', false);
sideMtl.ambient = vec4.fromValues(0.35, 0.05, 0.05, 1);
sideMtl.shininess = 10;

let sideMtl3 = new BuildingMaterial4Fun('side_mtl3', false);
sideMtl.ambient = vec4.fromValues(0.35, 0.05, 0.05, 1);
sideMtl.shininess = 10;

let planeMtl = new BlinnPhongMaterial('plane_mtl', false);
planeMtl.ambient = vec4.fromValues(0.0, 0.0, 0.0, 1);
planeMtl.shininess = 10;

const sideMapRes = new Resource('sideMap', {
  type: 'texture',
  url: './texture/diffuse-9x9.png',
});
const sideMapRes2 = new Resource('sideMap2', {
  type: 'texture',
  url: './texture/diffuse-6x21.png',
})
const sideMapRes3 = new Resource('sideMap3', {
  type: 'texture',
  url: './texture/diffuse-15x12.png',
})

const topMapRes = new Resource('topMap', {
  type: 'texture',
  url: './texture/top_map.png'
});


resourceLoader.batchLoad([sideMapRes, sideMapRes2, sideMapRes3, topMapRes], (err, res) => {
  const postProcess = scene.findFeature(PostProcessFeature);
  postProcess.initRT();
  const bloom = new BloomEffect(postProcess);
  bloom.brightThreshold = 0.2;
  bloom.smoothWidth = 0.8;
  postProcess.addEffect(bloom);

  //-- assign the texture to mtl
  sideMtl.diffuseMap = res[0].assets[0];
  sideMtl2.diffuseMap = res[1].assets[0];
  sideMtl3.diffuseMap = res[2].assets[0];
  //topMtl.emission = res[3].assets[0];
  topMtl.renderStates = {
    disable: [RenderState.CULL_FACE]
  }

  let sideMatArr = [sideMtl, sideMtl2, sideMtl3];

  if (GeometryChooser == 0 || GeometryChooser == 2) {
    //-- setup the geometry
    for (let i = 0; i < buildingNumber; ++i) {
      let sideName = 'building_side_' + i.toString();
      let sideObj = rootNode.createChild(sideName);
      let sideRender = sideObj.createAbility(AGeometryRenderer);
      sideRender.geometry = createSideGeometry(cityMapAfter.features[i]);

      let topName = 'building_top_' + i.toString();
      let topObj = rootNode.createChild(topName);
      let topRender = topObj.createAbility(AGeometryRenderer);
      topRender.geometry = createTopGeometry(cityMapAfter.features[i]);

      //-- setup the side material
      if (MaterialChooser == 0 || MaterialChooser == 2) {

        let RENDER_STATES = {
          disable: [
            RenderState.CULL_FACE
          ]
        };

        if (MaterialChooser == 2) {
          sideMtl.renderType = MaterialType.TRANSPARENT;
          RENDER_STATES = {
            enable: [RenderState.BLEND],
            functions: {
              blendFunc: [BlendFunc.SRC_ALPHA, BlendFunc.ONE],
              depthMask: [true]
            },
            disable: [
              RenderState.CULL_FACE
            ]
          };
        }
        
        sideRender.setMaterial(sideMatArr[i%3]);
        topRender.setMaterial(topMtl);
      } else if (MaterialChooser == 1) {
        sideRender.setMaterial(createBuildingMaterialWireFrame(resourceLoader));
        topRender.setMaterial(createBuildingMaterialWireFrame(resourceLoader));
      }
    }
  }
});
//-- main process

//-- create a light
let light = rootNode.createChild("light");
light.createAbility(ADirectLight, {
  color: vec3.fromValues(0.0, 0.0, 0.0),
  intensity: 0.8
});
light.position = [0, 1, 1];
light.lookAt([0,0,0], [0,1,0]);
console.log(light.getModelMatrix());

//-- data process
let cityMapAfter = dataProcessing(cityMap,CENTER,SCALE);
let buildingNumber = cityMapAfter.features.length;

// add the bottom plane
if(true || GeometryChooser == 1 || GeometryChooser == 2){
    let obj2 = rootNode.createChild('bottom_plane');
    obj2.position = [0,0,-2];
    obj2.setRotationAngles(0, 0, 0);
    let planeRender = obj2.createAbility(AGeometryRenderer);
    planeRender.geometry = new CuboidGeometry(2000,1,2000);
    planeRender.setMaterial(planeMtl);
}

//-- create camera
let cameraNode = rootNode.createChild('camera_node');
var camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'o3-demo', position: [0, 20, 50]
});
cameraNode.lookAt(vec3.fromValues(0,0,0), vec3.fromValues(0, 1, 0));
let controler = cameraNode.createAbility(AOrbitControls, { canvas: document.getElementById('o3-demo') });
controler.autoRotate = false;
controler.autoRotateSpeed = 3.0;

engine.run();
