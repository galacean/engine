import { vec3, vec4 } from "@alipay/o3-math";
import { Engine } from "@alipay/o3-core";
import { ADefaultCamera } from "@alipay/o3-default-camera";
import { AGeometryRenderer } from "@alipay/o3-geometry";
import { SphereGeometry } from "@alipay/o3-geometry-shape";
import { AAmbientLight, ADirectLight } from "@alipay/o3-lighting";
import { ConstantMaterial, LambertMaterial, BlinnPhongMaterial } from "@alipay/o3-mobile-material";
import { RenderState } from "@alipay/o3-base";

let engine = new Engine();
let scene = engine.currentScene;
let rootNode = scene.root;

//-- create camera
let cameraNode = rootNode.createChild("camera_node");
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: "o3-demo",
  position: [0, 0, -8],
  target: [0, 0, 0]
});

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

//-- Create ConstantMaterial
let mtl1 = new ConstantMaterial("TestMaterial");
mtl1.emission = vec4.fromValues(0.5, 0.5, 0.5, 1);
mtl1.ambient = vec4.fromValues(1, 0.25, 0.25, 1);
mtl1.renderStates = {
  disable: [RenderState.CULL_FACE]
};

let sphere1 = createSphere(mtl1, [1.5, 0, 0]);
sphere1.cullDistance = 10.1;

//-- Create LambertMaterial
let mtl2 = new LambertMaterial("TestMaterial");
mtl2.ambient = vec4.fromValues(0.25, 0.25, 0.25, 1);
createSphere(mtl2, [0, 0, 0]);

//-- Create BlinnPhongMaterial
let mtl3 = new BlinnPhongMaterial("TestMaterial");
mtl3.diffuse = vec4.fromValues(0.85, 0.85, 0.85, 1);
createSphere(mtl3, [-1.5, 0, 0]);

//-- run
engine.run();

function createSphere(mtl, pos) {
  //-- create geometry
  let sphereNode = rootNode.createChild("TestSphere");
  sphereNode.position = pos;

  let sphereRenderer = sphereNode.createAbility(AGeometryRenderer);
  sphereRenderer.geometry = new SphereGeometry(0.6, 32, 32);
  sphereRenderer.setMaterial(mtl);

  return sphereRenderer;
}
