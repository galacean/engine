//-- naive version with earcut
//top side face sepration
import { vec3,vec4} from '@alipay/r3-math';
import { Logger ,RenderState,MaterialType,BlendFunc} from '@alipay/r3-base';
import { Engine, SceneFeature } from '@alipay/r3-core';

import { ADefaultCamera } from '@alipay/r3-default-camera';
import { AGeometryRenderer, GeometryMerger } from '@alipay/r3-geometry';
import { CuboidGeometry, SphereGeometry } from '@alipay/r3-geometry-shape';
import '@alipay/r3-engine-stats';
import { ResourceLoader,Resource } from '@alipay/r3-loader';
import {createBuildingMaterialWireFrame, BuildingMaterial4Fun, SkyMaterial, BillboardMaterial, RoadMaterial, TopMaterial} from './buildingMaterial';
import {generateOfficeBuildingSide, generateLiveBuildingSide} from './proceduralTexture';

import {createSideGeometry,createTopGeometry,createBillboardGeometry,createRoadGeometry} from './buildingGeometryNaive';

import { ADirectLight } from '@alipay/r3-lighting';
import {CENTER,SCALE} from './constant';
import cityMap from './medium-building.json';
// import roadVertices from './road-vertices.json';
import rawRoadData from './medium-road.json';
import { dataProcessing, processRoadData } from './dataProcessing.js';
import { AOrbitControls } from '@alipay/r3-orbit-controls';
import {BlinnPhongMaterial} from '@alipay/r3-mobile-material';
import {PostProcessFeature, BloomEffect} from '@alipay/r3-post-processing';
import { TextureFilter, TextureWrapMode } from '@alipay/r3-base';
import { RenderTarget } from '@alipay/r3-material';
import { RipplePass } from './ripplePass';

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
const rippleRT = new RenderTarget('ripple-texture', {
  width: 512, height: 512,
  enableDepthTexture: false
});

//-- create  material
let topMtl = new TopMaterial();
topMtl.highlightMap = rippleRT.texture;

const NUM_BUSSINESS_BUILDING_MAT = 3;
const NUM_LIVE_BUILDING_MAT = 4*2;

let bussinessBuildingMatArr = Array(NUM_BUSSINESS_BUILDING_MAT);
let liveBuildingMatArr = Array(NUM_LIVE_BUILDING_MAT);

for (let i=0;i<NUM_BUSSINESS_BUILDING_MAT;++i) {
  bussinessBuildingMatArr[i] =  new BuildingMaterial4Fun('business_side_mtl'+i);
}
for (let i=0;i<NUM_LIVE_BUILDING_MAT;++i) {
  liveBuildingMatArr[i] = new BuildingMaterial4Fun('live_side_mtl'+i);
}

const billboardMat = new BillboardMaterial('billboard_mtl');
const roadMat = new RoadMaterial('road_mtl');

const bussinessBuildingSideMapRes = [
  new Resource('bussinessBuildingSideMap', {
    type : 'canvastexture',
    config: {
      magFilter: TextureFilter.LINEAR,
      minFilter: TextureFilter.LINEAR_MIPMAP_LINEAR,
      width: 512, height: 512,
      numFloors: 25,
      floorMargin: 10,
      bottomHeight: 10,
      roomWidth: 20,
      lightness: 90,
      busyFloorPercent: 0.9,
      hue: 26,
      darkColor: 'rgb(20,30,40)',
      draw: generateOfficeBuildingSide
    }
  }),
  new Resource('bussinessBuildingSideMap2', {
    type : 'canvastexture',
    config: {
      magFilter: TextureFilter.LINEAR,
      minFilter: TextureFilter.LINEAR_MIPMAP_LINEAR,
      width: 512, height: 512,
      numFloors: 40,
      floorMargin: 3,
      bottomHeight: 30,
      roomWidth: 50,
      lightness: 80,
      busyFloorPercent: 0.8,
      hue: 22,
      darkColor: 'rgb(0,10,40)',
      draw: generateOfficeBuildingSide
    }
  }),
  new Resource('bussinessBuildingSideMap3', {
    type : 'canvastexture',
    config: {
      magFilter: TextureFilter.LINEAR,
      minFilter: TextureFilter.LINEAR_MIPMAP_LINEAR,
      width: 512, height: 512,
      numFloors: 50,
      floorMargin: 3,
      bottomHeight: 30,
      roomWidth: 40,
      lightness: 80,
      hue: 230,
      saturation: 15,
      darkColor: 'rgb(10,10,20)',
      draw: generateOfficeBuildingSide
    }
  })
];
console.assert(bussinessBuildingSideMapRes.length == NUM_BUSSINESS_BUILDING_MAT);

const liveBuildingSideMapRes = [
  new Resource('liveBuildingSideMap', {
    type : 'canvastexture',
    config: {
      magFilter: TextureFilter.LINEAR,
      minFilter: TextureFilter.LINEAR_MIPMAP_LINEAR,
      width: 512, height: 512,
      numFloors: 8,
      floorMargin: 18,
      bottomHeight: 20,
      roomWidth: 60,
      roomMargin: 8,
      lightness: 70,
      busyFloorPercent: 0.6,
      busyRoomPercent: 0.6,
      hue: 26,
      saturation: 20,
      darkColor: '#303330',
      draw: generateLiveBuildingSide
    }
  }),
  new Resource('liveBuildingSideMap2', {
    type : 'canvastexture',
    config: {
      magFilter: TextureFilter.LINEAR,
      minFilter: TextureFilter.LINEAR_MIPMAP_LINEAR,
      width: 512, height: 512,
      numFloors: 8,
      floorMargin: 20,
      bottomHeight: 30,
      roomWidth: 40,
      lightness: 50,
      busyFloorPercent: 0.6,
      busyRoomPercent: 0.7,
      hue: 56,
      saturation: 10,
      darkColor: '#212320',
      draw: generateLiveBuildingSide
    }
  }),
  new Resource('liveBuildingSideMap3', {
    type : 'canvastexture',
    config: {
      magFilter: TextureFilter.LINEAR,
      minFilter: TextureFilter.LINEAR_MIPMAP_LINEAR,
      width: 512, height: 512,
      numFloors: 9,
      floorMargin: 14,
      roomMargin: 8,
      bottomHeight: 10,
      roomWidth: 50,
      lightness: 70,
      busyFloorPercent: 0.8,
      busyRoomPercent: 0.5,
      hue: 60,
      saturation: 10,
      darkColor: 'rgb(15,15,15)',
      draw: generateLiveBuildingSide
    }
  }),
  new Resource('liveBuildingSideMap4', {
    type : 'canvastexture',
    config: {
      magFilter: TextureFilter.LINEAR,
      minFilter: TextureFilter.LINEAR_MIPMAP_LINEAR,
      width: 512, height: 512,
      numFloors: 12,
      floorMargin: 22,
      roomMargin: 12,
      bottomHeight: 10,
      roomWidth: 40,
      lightness: 50,
      busyFloorPercent: 0.7,
      busyRoomPercent: 0.5,
      hue: 36,
      saturation: 12,
      darkColor: 'rgb(10,15,16)',
      draw: generateLiveBuildingSide
    }
  }),

  // again --
  new Resource('liveBuildingSideMap11', {
    type : 'canvastexture',
    config: {
      magFilter: TextureFilter.LINEAR,
      minFilter: TextureFilter.LINEAR_MIPMAP_LINEAR,
      width: 512, height: 512,
      numFloors: 8,
      floorMargin: 20,
      bottomHeight: 10,
      roomWidth: 50,
      roomMargin: 10,
      lightness: 70,
      busyFloorPercent: 0.8,
      busyRoomPercent: 0.5,
      withLightRing: true,
      hue: 26,
      saturation: 20,
      darkColor: '#202030',
      draw: generateLiveBuildingSide
    }
  }),
  new Resource('liveBuildingSideMap22', {
    type : 'canvastexture',
    config: {
      magFilter: TextureFilter.LINEAR,
      minFilter: TextureFilter.LINEAR_MIPMAP_LINEAR,
      width: 512, height: 512,
      numFloors: 8,
      floorMargin: 20,
      bottomHeight: 30,
      roomWidth: 40,
      lightness: 50,
      withLightRing: true,
      busyFloorPercent: 0.7,
      busyRoomPercent: 0.6,
      hue: 56,
      saturation: 20,
      darkColor: 'rgb(52,54,55)',
      draw: generateLiveBuildingSide
    }
  }),
  new Resource('liveBuildingSideMap33', {
    type : 'canvastexture',
    config: {
      magFilter: TextureFilter.LINEAR,
      minFilter: TextureFilter.LINEAR_MIPMAP_LINEAR,
      width: 512, height: 512,
      numFloors: 9,
      floorMargin: 24,
      roomMargin: 8,
      bottomHeight: 10,
      roomWidth: 40,
      lightness: 70,
      busyFloorPercent: 0.6,
      busyRoomPercent: 0.5,
      hue: 60,
      saturation: 10,
      darkColor: 'rgb(7,5,8)',
      draw: generateLiveBuildingSide
    }
  }),
  new Resource('liveBuildingSideMap44', {
    type : 'canvastexture',
    config: {
      magFilter: TextureFilter.LINEAR,
      minFilter: TextureFilter.LINEAR_MIPMAP_LINEAR,
      width: 512, height: 512,
      numFloors: 12,
      floorMargin: 26,
      roomMargin: 6,
      bottomHeight: 10,
      roomWidth: 52,
      lightness: 50,
      busyFloorPercent: 0.8,
      busyRoomPercent: 0.45,
      hue: 26,
      saturation: 20,
      darkColor: 'rgb(13,12,15)',
      draw: generateLiveBuildingSide
    }
  }),
];
console.assert(liveBuildingSideMapRes.length==NUM_LIVE_BUILDING_MAT);

let planeMtl = new BlinnPhongMaterial('plane_mtl', false);
planeMtl.ambient = vec4.fromValues(1.0, 1.0, 1.0, 1.0);
planeMtl.diffuse = vec4.fromValues(1.0, 1.0, 1.0, 1.0);
//planeMtl.emission = rippleRT.texture;
planeMtl.specular = vec4.fromValues(0.0, 0.0, 0.0, 0.0);
planeMtl.shininess = 0;

let skyMtl = new SkyMaterial();
let skyCubeMapRes = new Resource('sky', {
  type: 'cubemap',
  urls: [
    './textures/1.bmp',
    './textures/3.bmp',
    './textures/t.bmp',
    './textures/t.bmp',
    './textures/4.bmp',
    './textures/2.bmp',
  ]
});
// let cityCubemapRes = new Resource('sky', {
//   type: 'cubemap',
//   urls: [
//     './textures/Yokohama3/posx.jpg',
//     './textures/Yokohama3/negx.jpg',
//     './textures/Yokohama3/posy.jpg',
//     './textures/Yokohama3/negy.jpg',
//     './textures/Yokohama3/posz.jpg',
//     './textures/Yokohama3/negz.jpg',
//   ]
// });


resourceLoader.batchLoad([...bussinessBuildingSideMapRes, ...liveBuildingSideMapRes, skyCubeMapRes], (err, res) => {
  const postProcess = scene.findFeature(PostProcessFeature);
  postProcess.initRT();
  const bloom = new BloomEffect(postProcess);
  bloom.brightThreshold = 0.2;
  bloom.smoothWidth = 0.8;
  postProcess.addEffect(bloom);

  const cubemap = res[NUM_BUSSINESS_BUILDING_MAT+NUM_LIVE_BUILDING_MAT].assets[0];
  // const cityCubemap = res[NUM_BUSSINESS_BUILDING_MAT+NUM_LIVE_BUILDING_MAT+1].assets[0];

  //-- assign the texture to mtl
  for (let i=0; i<NUM_BUSSINESS_BUILDING_MAT; ++i) {
    bussinessBuildingMatArr[i].diffuseMap = res[i].assets[0];
    bussinessBuildingMatArr[i].cubemap = cubemap;
    bussinessBuildingMatArr[i].glossiness = 0.8;
    bussinessBuildingMatArr[i].highlightMap = rippleRT.texture;
  }
  for (let i=0; i<NUM_LIVE_BUILDING_MAT; ++i) {
    liveBuildingMatArr[i].diffuseMap = res[i+NUM_BUSSINESS_BUILDING_MAT].assets[0];
    liveBuildingMatArr[i].cubemap = cubemap;
    liveBuildingMatArr[i].glossiness = 0.0;
    liveBuildingMatArr[i].highlightMap = rippleRT.texture;
  }
  skyMtl.cubemap = cubemap;

  // add sky
  let sky = rootNode.createChild('sky');
  sky.position = [0,0,0];
  let skyRender = sky.createAbility(AGeometryRenderer);
  skyRender.geometry = new SphereGeometry(600, 32, 32);
  // skyRender.geometry = new CuboidGeometry(1200, 1200, 1200);
  skyRender.setMaterial(skyMtl);

  topMtl.renderStates = {
    disable: [RenderState.CULL_FACE]
  };

  let sideGeometryList = [];
  let topGeometryList = [];
  let billboardGeometryList = [];

  if (GeometryChooser == 0 || GeometryChooser == 2) {
    //-- setup the geometry
    for (let i = 0; i < buildingNumber; ++i) {
      sideGeometryList.push(createSideGeometry(cityMapAfter.features[i]));
      topGeometryList.push(createTopGeometry(cityMapAfter.features[i]));

      const billboardGeo = createBillboardGeometry(cityMapAfter.features[i]);
      if (billboardGeo!=null && Math.random()<0.4) {
        billboardGeometryList.push(billboardGeo);
      }

      const numFloors = cityMapAfter.features[i].properties.floor;
      sideGeometryList[sideGeometryList.length-1].primitive.material = (numFloors>10? bussinessBuildingMatArr[i%3]: liveBuildingMatArr[Math.min(Math.floor(numFloors*4/10)+(Math.floor(Math.random()*1.99)*4), NUM_LIVE_BUILDING_MAT-1)]);
    }

    let sideMerged = new GeometryMerger(sideGeometryList).merge();
    let topMerged = new GeometryMerger(topGeometryList).merge()[0];
    let billboardMerged = new GeometryMerger(billboardGeometryList).merge()[0];

    for (let s of sideMerged) {
      let sideRenderer = rootNode.createChild('side').createAbility(AGeometryRenderer);
      sideRenderer.geometry = s;
      sideRenderer.setMaterial(s.primitive.material);
    }

    let topRenderer = rootNode.createChild('top').createAbility(AGeometryRenderer);
    topRenderer.geometry = topMerged;
    topRenderer.setMaterial(topMtl);

    let billboardRenderer = rootNode.createChild('billboard').createAbility(AGeometryRenderer);
    billboardRenderer.geometry = billboardMerged;
    billboardRenderer.setMaterial(billboardMat);
  }

  // planeMtl.emission = rippleRT.texture;

  let roadRender = rootNode.createChild('road').createAbility(AGeometryRenderer);
  roadRender.geometry = createRoadGeometry(roadVertices);
  roadMat.highlightMap = rippleRT.texture;
  roadRender.setMaterial(roadMat);
});
//-- main process

//-- create a light
let light = rootNode.createChild("light");
light.createAbility(ADirectLight, {
  color: vec3.fromValues(0.01, 0.01, 0.05),
  intensity: 0.8
});
light.position = [0, 1, 1];
light.lookAt([0,0,0], [0,1,0]);
console.log(light.getModelMatrix());

//-- data process
let cityMapAfter = dataProcessing(cityMap, CENTER, SCALE);
let roadVertices = processRoadData(rawRoadData, CENTER, SCALE);
let buildingNumber = cityMapAfter.features.length;

// add the bottom plane
if(true || GeometryChooser == 1 || GeometryChooser == 2){
    let obj2 = rootNode.createChild('bottom_plane');
    obj2.position = [0,-8,0];
    obj2.setRotationAngles(0, 0, 0);
    let planeRender = obj2.createAbility(AGeometryRenderer);
  planeRender.geometry = new CuboidGeometry(1200,0.5,1200);
    planeRender.setMaterial(planeMtl);
}


//-- create camera
let cameraNode = rootNode.createChild('camera_node');
var camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'r3-demo', position: [0, 40, 50], near: 3, far: 2000,
  attributes: {antialias:true}
});
cameraNode.lookAt(vec3.fromValues(0,8,0), vec3.fromValues(0, 1, 0));

// add ripple pass
const ripplePass = new RipplePass(rippleRT, engine);
camera.sceneRenderer.addRenderPass(ripplePass);

let controler = cameraNode.createAbility(AOrbitControls, { canvas: document.getElementById('r3-demo') });
controler.target = vec3.fromValues(0,10,0);
controler.autoRotate = true;
controler.autoRotateSpeed = 360.0;

engine.run();
