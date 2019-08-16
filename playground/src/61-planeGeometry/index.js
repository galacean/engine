
import { Engine } from '@alipay/r3-core';
import { Logger } from '@alipay/r3-base';
import { ADefaultCamera } from '@alipay/r3-default-camera';
import { AGeometryRenderer } from '@alipay/r3-geometry';
import { PlaneGeometry } from '@alipay/r3-geometry-shape';
import '@alipay/r3-engine-stats';
import ARotation from '../common/ARotation';
import createShapeMaterial from './PlaneMaterial';
import { ResourceLoader, Resource } from '@alipay/r3-loader';
import AIndexUpdate from './AIndexUpdate';

Logger.enable();
//-- create engine object
let engine = new Engine();
let scene = engine.currentScene;
let rootNode = scene.root;

function createPlaneGeometry(name, position,rotation, w, h, hs,vs, texture, flag) {
  let obj = rootNode.createChild(name);
  obj.position = position;
  obj.setRotationAngles(rotation[0], rotation[1], rotation[2]);
  let cubeRenderer = obj.createAbility(AGeometryRenderer);
  //obj.createAbility(ARotation);
  const geometry = new PlaneGeometry(w, h, hs,vs);
  cubeRenderer.geometry = geometry;
  if(flag) {
    obj.createAbility(AIndexUpdate, {geometry});
  }

  let mtl = createShapeMaterial();
  mtl.setValue('s_diffuse', texture);
  cubeRenderer.setMaterial(mtl);

  return obj;
}

// 创建资源对象，参数分别为对象名，资源类型，资源路径
const res = [];
res.push(new Resource( 'img', {
  type: 'texture',
  url: 'https://gw.alipayobjects.com/zos/rmsportal/AKuhiDgDtfzRWaqOLTdL.png',
} ));
res.push(new Resource( 'img', {
  type: 'texture',
  url: 'https://gw.alipayobjects.com/zos/rmsportal/SidJZXAsXqrfOIBLsfNm.jpg',
} ));
const resourceLoader = new ResourceLoader(engine);
resourceLoader.batchLoad( res, ( err, res ) => {

  if ( err ) return console.error( err );

 let letter = createPlaneGeometry('obj1', [-2, -3, 0],[0, 0, 0], 4, 5.5, 16, 19, res[0].asset, true);
 let bg = createPlaneGeometry('obj1', [-2.5, -4, -0.1],[0, 0, 0], 5, 8, 1, 1, res[1].asset);
} );

let cameraNode = rootNode.createChild('camera_node');
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'r3-demo', position: [0, 0, 10],
  pixelRatio :2
});

engine.run();

