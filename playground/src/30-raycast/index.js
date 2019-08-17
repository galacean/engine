import {vec3, vec4} from '@alipay/o3-math';
import {Engine} from '@alipay/o3-core';
import {ADefaultCamera} from '@alipay/o3-default-camera';
import {AGeometryRenderer} from '@alipay/o3-geometry';
import {SphereGeometry, CuboidGeometry} from '@alipay/o3-geometry-shape';
import {ConstantMaterial} from '@alipay/o3-mobile-material';
import {ASphereCollider, ABoxCollider} from '@alipay/o3-collider';
import '@alipay/o3-raycast';
import {MaskList} from '@alipay/o3-base'

const COLOR_GRAY = vec4.fromValues(0.75, 0.75, 0.75, 1);
const COLOR_RED = vec4.fromValues(0.95, 0.05, 0.05, 1)

//-- create engine
let engine = new Engine();
let scene = engine.currentScene;
let rootNode = scene.root;

//-- create sphere test node
let sphereMtl = new ConstantMaterial('SphereMtl', false);
sphereMtl.emission = COLOR_GRAY;

let sphereObj = rootNode.createChild('SphereNode');
sphereObj.position = [-1.5, 0, 0];

let radius = 1.25;
let sphereRenderer = sphereObj.createAbility(AGeometryRenderer);
sphereRenderer.geometry = new SphereGeometry(radius, 32, 32);
sphereRenderer.setMaterial(sphereMtl);

let sphereCollider = sphereObj.createAbility(ASphereCollider, {
  tag: MaskList.MASK1
});
sphereCollider.setSphere([0, 0, 0], radius);

//-- create box test node
let boxMtl = new ConstantMaterial('BoxMtl', false);
boxMtl.emission = COLOR_GRAY;

let cubeSize = 2.0;
let boxNode = rootNode.createChild('BoxNode');
boxNode.position = [1.5, 0, 0];

let boxRenderer = boxNode.createAbility(AGeometryRenderer);
boxRenderer.geometry = new CuboidGeometry(cubeSize, cubeSize, cubeSize);
boxRenderer.setMaterial(boxMtl);

let boxCollider = boxNode.createAbility(ABoxCollider, {
  tag: MaskList.MASK2
});
boxCollider.setBoxCenterSize([0, 0, 0], [cubeSize, cubeSize, cubeSize]);

//-- create camera
let cameraNode = rootNode.createChild('CameraNode');
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'o3-demo', position: [0, 5, 17], target: [0, 0, 0]
});

//-- input
document.getElementById('o3-demo').addEventListener('click', (e) => {

  let ray = camera.screenPointToRay(e.offsetX, e.offsetY);
  let pos = vec3.create();
  let collider = scene.raycast(ray, pos, MaskList.MASK1 | MaskList.MASK2);

  // change color of pick node
  sphereMtl.emission = COLOR_GRAY;
  boxMtl.emission = COLOR_GRAY;

  if (collider) {
    if (collider.node.name === 'BoxNode') {
      boxMtl.emission = COLOR_RED;
    }

    if (collider.node.name === 'SphereNode') {
      sphereMtl.emission = COLOR_RED;
    }

    console.log(pos);
  }
});

//-- run
engine.run();

