import { Logger } from '@alipay/r3-base';
import { vec3, vec4 } from '@alipay/r3-math';
import { Engine, NodeAbility } from '@alipay/r3-core';
import { ADefaultCamera } from '@alipay/r3-default-camera';
import { AGeometryRenderer } from '@alipay/r3-geometry';
import { SphereGeometry, CuboidGeometry } from '@alipay/r3-geometry-shape';
import '@alipay/r3-engine-stats';
import { ResourceLoader, Resource } from '@alipay/r3-loader';
import { AAnimation } from '@alipay/r3-animation';
import '@alipay/r3-shadow';
import '@alipay/r3-loader-gltf';

import { ConstantMaterial, BlinnPhongMaterial } from '@alipay/r3-mobile-material';
import { ASpotLight } from '@alipay/r3-lighting';
import AMove from '../common/AMove';

// Logger.enable();

let mtl = new BlinnPhongMaterial('TestMaterial', false);
mtl.diffuse = vec4.fromValues(0.1, 0.9, 0.8, 1);
mtl.shininess = 10;

function createCuboidGeometry(name, position,rotation, w, h, d) {
  let obj = rootNode.createChild(name);
  obj.position = position;
  obj.setRotationAngles(rotation[0], rotation[0], rotation[0]);
  let cubeRenderer = obj.createAbility(AGeometryRenderer);
  cubeRenderer.geometry = new CuboidGeometry(w, h, d);
  cubeRenderer.setMaterial(mtl);
  cubeRenderer.recieveShadow = true;
}

//-- create engine object
let engine = new Engine();
const resourceLoader = new ResourceLoader(engine);

let scene = engine.currentScene;
let rootNode = scene.root;

//-- create light
let lighthouse = rootNode.createChild("lighthouse");
let light1 = lighthouse.createChild("light1");
light1.createAbility(AMove, {range:5, y:2});
light1.position = [-5, 0, -5];
light1.lookAt([0, -3, 0], [0, 1, 0]);

// 控制 node 始终看向固定点
class ALookAtFocus extends NodeAbility {
  update(deltaTime) {
    light1.lookAt([0, -3, 0], [0, 1, 0]);
  }
}
light1.createAbility(ALookAtFocus);

let spotLight = light1.createAbility(ASpotLight, {
  color: vec3.fromValues(1, 1, 1),
  intensity: 1.0,
  distance: 80,
  decay: 0,
  angle: Math.PI / 12,
  penumbra: 0.2
});
spotLight.enableShadow = true;
spotLight.shadow.bias = 0.0001;
spotLight.shadow.intensity = 0.2;

let lgtMtl = new ConstantMaterial('test_mtl1', false);
lgtMtl.emission = vec4.fromValues(0.85, 0.85, 0.85, 1);

let sphereRenderer3 = light1.createAbility(AGeometryRenderer);
sphereRenderer3.geometry = new SphereGeometry(0.1);
sphereRenderer3.setMaterial(lgtMtl);

//-- create geometry
createCuboidGeometry('cubiod1', [0, -3, 0],[0, 0, 0],10, 0.1, 10);
createCuboidGeometry('cubiod2', [5, -2, 0],[0, 0, 0],0.1, 2, 10);
createCuboidGeometry('cubiod3', [-5, -2, 0],[0, 0, 0],0.1, 2, 10);
createCuboidGeometry('cubiod4', [0, -2, -5],[0, 0, 0],10, 2, 0.1);

//-- create camera
let cameraNode = rootNode.createChild('camera_node');
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'r3-demo', position: [0, 5, 17], near: 0.1, far: 100
});

//-- load resource
const animationRes = new Resource('pig_glb', {
  type: 'gltf',
  url: 'https://gw.alipayobjects.com/os/r3/43bf0cbe-17c8-4835-88ff-f28636dd2b14/pig.gltf',
});

resourceLoader.batchLoad([animationRes], (err, res) => {

  //-- create test materials
  let mtl = new BlinnPhongMaterial('TestMaterial', false);
  mtl.diffuse = res[0].assets[0];
  mtl.ambient = vec4.fromValues(0.25, 0.25, 0.25, 1);

  //-- create pig
  let gltf = res[0].assets[0];

  let pigMtl = [];

  pigMtl[0] = new ConstantMaterial('PigMaterial0', true);
  pigMtl[0].emission = gltf.textures[0];

  pigMtl[1] = new BlinnPhongMaterial('PigMaterial1', true, true);
  pigMtl[1].emission = gltf.textures[1];
  //pigMtl[1].diffuse = gltf.textures[1];

  pigMtl[2] = pigMtl[1];

  let meshes = gltf.meshes;
  let mtlIndex = 0;
  for (let i = 0; i < meshes.length; i++) {
    let mesh = meshes[i];
    for (let j = 0; j < mesh.primitives.length; j++) {
      mesh.primitives[j].material = pigMtl[i];
      mtlIndex++;
    }
  }

  const pigPrefab = gltf.rootScene.nodes[0];
  const animations = gltf.animations;

  const pig = pigPrefab.clone();
  rootNode.addChild(pig);
  pig.position = [0, -3, 0];
  pig.rotateByAngles(0, 180, 0);
  pig.castShadow = true;

  let book = pig.findChildByName('book_one');
  book.isActive = false;

  const animator = pig.createAbility(AAnimation);
  animations.forEach(clip => {
    animator.addAnimationClip(clip, clip.name);
  });

  animator.playAnimationClip('walk');

});

//-- run
engine.run();
