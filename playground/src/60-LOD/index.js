import { vec3, vec4 } from '@alipay/r3-math';
import { Engine } from '@alipay/r3-core';
import { ADefaultCamera } from '@alipay/r3-default-camera';
import { AGeometryRenderer } from '@alipay/r3-geometry';
import { SphereGeometry, CuboidGeometry } from '@alipay/r3-geometry-shape';
import { AAmbientLight, ADirectLight } from '@alipay/r3-lighting';
import { LambertMaterial } from '@alipay/r3-mobile-material';
import { ALODGroup } from '@alipay/r3-mesh';
import { AOrbitControls } from '@alipay/r3-orbit-controls';


let engine = new Engine();
let scene = engine.currentScene;
let rootNode = scene.root;

//-- create camera
let cameraNode = rootNode.createChild('camera_node');
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'r3-demo', position: [0, 0, -8], target: [0, 0, 0]
});

let controler = cameraNode.createAbility(AOrbitControls, { canvas: document.getElementById('r3-demo') });


//-- create lights
let light1 = rootNode.createChild("light1");
let ambientLgt = light1.createAbility(AAmbientLight);
ambientLgt.intensity = 0.2;

let light2 = rootNode.createChild("light2");
light2.createAbility(ADirectLight, {
  color: vec3.fromValues(1, 1, 1),
  intensity: 0.8
});
light2.position = [-15, 20, -15];
light2.lookAt([0, 0, 0], [0, 1, 0]);


//-- Create LambertMaterial
let mtl1 = new LambertMaterial('TestMaterial1', false);
mtl1.ambient = vec4.fromValues(1, 0, 0, 1);

let mtl2 = new LambertMaterial('TestMaterial2', false);
mtl2.ambient = vec4.fromValues(0, 1, 0, 1);

let mtl3 = new LambertMaterial('TestMaterial3', false);
mtl3.ambient = vec4.fromValues(0, 0, 1, 1);

let mtl4 = new LambertMaterial('TestMaterial3', false);
mtl4.ambient = vec4.fromValues(0, 0, 1, 1);

//--
let testNode = rootNode.createChild('TestSphere');
let lodGroup = testNode.createAbility(ALODGroup);

const SIZE = 0.618;
let sphereRenderer1 = testNode.createAbility(AGeometryRenderer);
sphereRenderer1.geometry = new SphereGeometry(SIZE, 48, 48);
sphereRenderer1.setMaterial(mtl1);

let sphereRenderer2 = testNode.createAbility(AGeometryRenderer);
sphereRenderer2.geometry = new SphereGeometry(SIZE, 16, 16);
sphereRenderer2.setMaterial(mtl2);

let sphereRenderer3 = testNode.createAbility(AGeometryRenderer);
sphereRenderer3.geometry = new SphereGeometry(SIZE, 8, 8);
sphereRenderer3.setMaterial(mtl3);

let sphereRenderer4 = testNode.createAbility(AGeometryRenderer);
sphereRenderer4.geometry = new SphereGeometry(SIZE, 4, 4);
sphereRenderer4.setMaterial(mtl4);

lodGroup.addLod(4, sphereRenderer1);
lodGroup.addLod(8, sphereRenderer2);
lodGroup.addLod(16, sphereRenderer3);
lodGroup.addLod(64, sphereRenderer4);



//-- run
engine.run();
