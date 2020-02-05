import { Logger } from '@alipay/o3-base';
import { Engine } from '@alipay/o3-core';
import { ADefaultCamera } from '@alipay/o3-default-camera';
import { AGeometryRenderer } from '@alipay/o3-geometry';
import { SphereGeometry } from '@alipay/o3-geometry-shape';
import { PlaneGeometry } from '../common/PlaneGeometry';
import '@alipay/o3-engine-stats';
import { ResourceLoader, Resource } from '@alipay/o3-loader';
import { AOrbitControls } from '@alipay/o3-orbit-controls';
import { ASkyBox } from '@alipay/o3-skybox';

import { StarMaterial } from './StarMaterial';
import { HaloMaterial } from './HaloMaterial';
import { CoronaMaterial } from './CoronaMaterial';
import * as dat from 'dat.gui';

Logger.enable();

let engine = new Engine();
const resourceLoader = new ResourceLoader(engine);
let scene = engine.currentScene;
let rootNode = scene.root;

let cameraNode = rootNode.createChild('camera_node');
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'o3-demo', position: [0, 0, 17], target: [0, 0, 0],
});
let controler = cameraNode.createAbility(AOrbitControls, { mainElement: document.getElementById('o3-demo') });
controler.minDistance = 4;
controler.maxDistance = 50;

let starMaterial = new StarMaterial('star');
let haloMaterial = new HaloMaterial('halo');
let coronaMaterial = new CoronaMaterial('corona');

let radius = 3;
createSphereGeometry('obj1', [0, 0, 0], starMaterial, radius, 50, 50);
let haloNode = createPlaneGeometry('halo', [0, 0, 0], haloMaterial, radius * Math.PI, radius * Math.PI);
let coronaNode = createPlaneGeometry('corona', [0, 0, 0], coronaMaterial, 3 * radius * Math.PI, 3 * radius * Math.PI);

addControls();

const r1 = new Resource('image1', { type: 'texture', url: '/static/texture/effect-star/corona.png' });
const r2 = new Resource('image2', { type: 'texture', url: '/static/texture/effect-star/halo_colorshift.png' });
const r3 = new Resource('image3', { type: 'texture', url: '/static/texture/effect-star/star_color_modified.png' });
const r4 = new Resource('image4', { type: 'texture', url: '/static/texture/effect-star/star_colorshift.png' });
const r5 = new Resource('image5', { type: 'texture', url: '/static/texture/effect-star/sun_halo.png' });
const r6 = new Resource('image6', { type: 'texture', url: '/static/texture/effect-star/sun_surface.png' });

let cubeMapRes = new Resource('env', {
  type: 'cubemap',
  urls: [
    '/static/texture/effect-star/s_px.jpg',
    '/static/texture/effect-star/s_nx.jpg',
    '/static/texture/effect-star/s_py.jpg',
    '/static/texture/effect-star/s_ny.jpg',
    '/static/texture/effect-star/s_pz.jpg',
    '/static/texture/effect-star/s_nz.jpg',
  ],
});

resourceLoader.batchLoad([r1, r2, r3, r4, r5, r6, cubeMapRes], (err, res) => {

  starMaterial.setValue('texturePrimary', res[5].asset);
  starMaterial.setValue('textureColor', res[3].asset);
  starMaterial.setValue('textureSpectral', res[2].asset);

  haloMaterial.setValue('texturePrimary', res[4].asset);
  haloMaterial.setValue('textureColor', res[1].asset);
  haloMaterial.setValue('textureSpectral', res[2].asset);

  coronaMaterial.setValue('texturePrimary', res[0].asset);
  coronaMaterial.setValue('textureSpectral', res[2].asset);

  let cubeMap = res[6].asset;
  let skybox = rootNode.createAbility(ASkyBox, { skyBoxMap: cubeMap });


});

//-- run
engine.run();

function createSphereGeometry(name, position, mtl, r, h, v, as, ae, ts, te) {
  let obj = rootNode.createChild(name);
  obj.position = position;
  let sphereRenderer = obj.createAbility(AGeometryRenderer);
  sphereRenderer.geometry = new SphereGeometry(r, h, v, as, ae, ts, te);

  sphereRenderer.setMaterial(mtl);
  return obj;
}

function createPlaneGeometry(name, position, mtl, w, h) {
  let obj = rootNode.createChild(name);
  obj.position = position;
  let planeRenderer = obj.createAbility(AGeometryRenderer);
  planeRenderer.geometry = new PlaneGeometry(w, h);

  planeRenderer.setMaterial(mtl);

  return obj;
}

function addControls() {
  var controls = new function() {
    this.star_color = 0.01;
    this.rotate_speed = 1.0;
    this.burn = 1.0;

    this.halo_intensity = 1.0;

    this.corona_scale = 2.2;
    this.corona_intensity = 1.4;
    this.back_decay = 0.01;
  };

  var gui = new dat.GUI();
  var f1 = gui.addFolder('Star');
  f1.add(controls, 'star_color', 0, 1.0);
  f1.add(controls, 'rotate_speed', 0, 5.0);
  f1.add(controls, 'burn', 0, 10.0);

  var f2 = gui.addFolder('Halo');
  f2.add(controls, 'halo_intensity', 0, 5.0);

  var f3 = gui.addFolder('Corona');
  f3.add(controls, 'corona_scale', 0, 5.0);
  f3.add(controls, 'corona_intensity', 0, 5.0);
  f3.add(controls, 'back_decay', 0, 1.0);

  f1.open();
  f2.open();
  f3.open();

  gui.domElement.style = 'position:absolute;top:0px;right:300px';

  rootNode.onUpdate = () => {
    starMaterial.setValue('spectralLookup', controls.star_color);
    starMaterial.setValue('u_rotate_speed', controls.rotate_speed);
    starMaterial.setValue('u_burn', controls.burn);

    haloMaterial.setValue('spectralLookup', controls.star_color);
    haloMaterial.setValue('u_intensity', controls.halo_intensity);

    coronaMaterial.setValue('spectralLookup', controls.star_color);
    coronaMaterial.setValue('u_intensity', controls.corona_intensity);
    coronaMaterial.setValue('u_backDecay', controls.back_decay);

    haloNode.lookAt(camera.eyePos, [0, 1, 0]);
    coronaNode.lookAt(camera.eyePos, [0, 1, 0]);
    //
    coronaNode.scale = [controls.corona_scale, controls.corona_scale, controls.corona_scale];
  };
}
