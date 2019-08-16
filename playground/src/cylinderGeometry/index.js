
import { Engine } from '@alipay/r3-core';
import { Logger, BlendFunc, RenderState, FrontFace} from '@alipay/r3-base';
import { ADefaultCamera } from '@alipay/r3-default-camera';
import { AGeometryRenderer } from '@alipay/r3-geometry';
import { CylinderGeometry } from '@alipay/r3-geometry-shape';
import '@alipay/r3-engine-stats';
import { vec4 } from '@alipay/r3-math'
import ARotation from '../common/ARotation';
import createShapeMaterial from './material';
import { ResourceLoader, Resource } from '@alipay/r3-loader';

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
  obj.createAbility(ARotation);
  const geometry = new CylinderGeometry(5,5,10 , 20 ,1);
  cubeRenderer.geometry = geometry;

  let mtl = createShapeMaterial();
  mtl.setValue('s_diffuse', texture);
 
  cubeRenderer.setMaterial(mtl);

  return obj;
}

// 创建资源对象，参数分别为对象名，资源类型，资源路径
const res = [];

res.push(new Resource( 'img', {
  type: 'texture',
  url: 'https://gw.alipayobjects.com/zos/rmsportal/hxiMCvMgGJBnPxMpMEHC.jpeg',
} ));
const resourceLoader = new ResourceLoader(engine);
resourceLoader.batchLoad( res, ( err, res ) => {

  if ( err ) return console.error( err );

 let letter = createPlaneGeometry('obj1', [0, 0, 0],[0, 0, 0], 4, 5.5, 16, 19, res[0].asset, true);
} );

let cameraNode = rootNode.createChild('camera_node');
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'r3-demo', position: [0, 15, 40],
  pixelRatio :2
});

engine.run();

