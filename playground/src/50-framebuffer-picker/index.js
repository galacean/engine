import { Logger } from '@alipay/r3-base';
import { Engine } from '@alipay/r3-core';
import { ResourceLoader } from '@alipay/r3-loader';
import { RegistExtension } from '@alipay/r3-loader-gltf';
import { ADefaultCamera } from '@alipay/r3-default-camera';
import { AOrbitControls } from '@alipay/r3-orbit-controls';
import { AEnvironmentMapLight, PBRMaterial } from '@alipay/r3-pbr';
import { AMeshRenderer } from '@alipay/r3-mesh';
import { AFramebufferPicker } from '@alipay/r3-framebuffer-picker';

import '@alipay/r3-engine-stats';
import { ResourceList } from './ResourceList';

Logger.enable();
RegistExtension({ PBRMaterial });
//-- create engine object
let engine = new Engine();

let scene = engine.currentScene;
let rootNode = scene.root;

let envLightNode = rootNode.createChild('env_light');
let envLight = envLightNode.createAbility(AEnvironmentMapLight);

let resourceLoader = new ResourceLoader(engine);

//-- create camera
let cameraNode = rootNode.createChild('camera_node');
let cameraProps = {
  canvas: 'r3-demo', position: [0, 0, 40], near: 1, far: 100,
  clearParam: [0.1, 0.2, 0.4, 1]
};
let camera = cameraNode.createAbility(ADefaultCamera, cameraProps);
let controler = cameraNode.createAbility(AOrbitControls, { canvas: document.getElementById('r3-demo') });

resourceLoader.batchLoad(ResourceList, (err, res) => {
  const gltf = res[0];

  let mesh = gltf.asset.meshes[0];
  for (let x = 0; x < 5; x++) {
    for (let y = 0; y < 5; y++) {
      let testNode = rootNode.createChild('test_mesh' + x + y);
      testNode.position = [(x - 2) * 5, (y - 2) * 5, 0];
      testNode.setRotationAngles( 90, 0, 0 );

      testNode.createAbility(AMeshRenderer,{mesh});
    }
  }

  const lut = res[1].asset;
  envLight.brdfMap = lut;
  envLight.diffuseMap = res[2].asset;
  envLight.specularMap = res[3].asset;

  // framebuffer picker
  let lastMaterial;
  let laseBaseColor;
  let framebufferPicker = rootNode.createAbility( AFramebufferPicker, { camera, onPick: (obj) => {

    if(lastMaterial)
      lastMaterial.baseColorFactor = laseBaseColor;

    if(obj){
      const { primitive, component } = obj;
      const idx = component.mesh.primitives.indexOf( primitive );
      let material = component.getInstanceMaterial( idx );
      if(!material){
        material = primitive.material.clone();
        component.setMaterial( idx, material );
      }

      lastMaterial = material;
      laseBaseColor = material.baseColorFactor;
      material.baseColorFactor = [1, 0, 0, 1];
    }

  } } );

  camera.renderHardware.canvas.addEventListener('mousedown', (e)=>{
      console.log(e.offsetX, e.offsetY);
      framebufferPicker.pick( e.offsetX, e.offsetY );
    })

});

//-- run
engine.run();
