import World from './World.js';
import AssetsLoader from './AssetsLoader.js';
import { vec3 } from '@alipay/o3-math';
import { ADirectLight } from '@alipay/o3-lighting';
import { AOrbitControls } from '@alipay/o3-orbit-controls';
import { AGeometryRenderer } from '@alipay/o3-geometry';
import { CuboidGeometry, CylinderGeometry } from '@alipay/o3-geometry-shape';
import { LambertMaterial } from '@alipay/o3-mobile-material';
import { Texture2D } from '@alipay/o3-material';
import {
  DecalGeometry,
  DecalMaterial,
  Caster,
  transformDirection,
} from '@alipay/o3-decal';


let point;
let normal;
let decalMtl;
let targetIntersection;
let moved = false;

const canvas = document.getElementById('o3-demo');
const world = new World(canvas);
world.camera.createAbility(AOrbitControls, { canvas });
world.camera.position = [0, 0, 100];
world.camera.lookAt([0, 0, 0], [0, 1, 0]);

const mouseHelper = world.createChild('mouseHelper');
const renderer = mouseHelper.createAbility(AGeometryRenderer);
renderer.geometry = new CuboidGeometry(0.5, 0.5, 5);
const mtl = new LambertMaterial('mouseHelper_mtl', false); 
mtl.diffuse = [1, 0, 0, 1];
renderer.setMaterial(mtl);
mouseHelper.isActive = false;

mouseHelper.position = [1, 0, 0];


const caster = new Caster();

const loader = new AssetsLoader();
loader.addAsset('model', {
  type: 'gltf',
  // url: 'https://gw.alipayobjects.com/os/loanprod/ebf98a79-9d49-4fa9-8b6e-2f29fc4255d2/5d763a1ef807291669cc70bd/69d608a2f253cec0b13447886a0ba123.gltf',
  // url: 'https://gw.alipayobjects.com/os/loanprod/4e270abd-1d3d-4c7b-afea-31068083d5fa/5dad69c7bdf825066f54cb52/67dc763d0152ddfa0ba3c4f89cbf6a83.gltf',
  // url: 'https://gw.alipayobjects.com/os/loanprod/b29ee1bf-c8e8-42f5-bb88-30c43fd63b67/5dad69c7bdf825066f54cb52/382105b38b3c1ac62a60dedc13008d7c.gltf',
  url: 'https://gw.alipayobjects.com/os/basement_prod/4974b5b8-b2ba-4767-86e6-e3e61416c88f.gltf',
});

loader.addAsset('decal_texture', {
  type: 'texture',
  url: 'https://gw.alicdn.com/tfs/TB1JsjnIBLoK1RjSZFuXXXn0XXa-300-300.png',
});

loader.load().then((res) => {
  const gltf = res[0];
  // const texture = res[1].asset;
  const model = gltf.asset.rootScene.nodes[0];
  console.log(model);
  decalMtl = new DecalMaterial('decal_mtl');
  const textCanvas = createText();
  const texture = new Texture2D('text', textCanvas);
  console.log(texture);
  decalMtl.texture = texture;
  addShip(model);
  addLight();
  rayCastEvent(model);
  addGeometryEvent(model);
  world.start();
});

function addShip(model) {
  world.addChild(model);
}

function addLight() {
  const light = world.createChild('light');
  light.position = [3, 3, 5];
  light.setRotationAngles(30, 200, 0);
  light.createAbility(ADirectLight, {
    color: vec3.fromValues(1, 1, 1),
    intensity: 1.2,
  });
  const light2 = world.createChild('light');
  light2.position = [3, 3, -5];
  light2.createAbility(ADirectLight, {
    color: vec3.fromValues(1, 1, 1),
    intensity: 1.2,
  });
}

function rayCastEvent(model) {
  console.log(model);
  caster.setTarget(model);
  document.getElementById('o3-demo').addEventListener('mousemove', () => {
    moved = true;
  });
  document.getElementById('o3-demo').addEventListener('mousedown', () => {
    moved = false;
  });
  document.getElementById('o3-demo').addEventListener('mousemove', (e) => {
    const ray = world.cameraAb.screenPointToRay(e.clientX, e.clientY);
    caster.setRay(ray);

    let intersection;
    if (moved) {
      intersection = caster.intersect();
    }
    let mostCloseIntersection;
    if (intersection.length > 0) {
      const sorted = intersection.sort((a, b) => {
        return a.distance - b.distance;
      });
      mostCloseIntersection = sorted[0];
    }
    if (mostCloseIntersection) {
      console.log(mostCloseIntersection.node.name);
      mouseHelper.isActive = true;
      point = mostCloseIntersection.point.slice(0);
      normal = mostCloseIntersection.normal.slice(0);
      targetIntersection = mostCloseIntersection;
      
      mouseHelper.position = point.slice(0);

      const temp = vec3.create();
      const local = transformDirection(temp, normal, model.getModelMatrix());
      const n = [
        local[0] * 10 + point[0],
        local[1] * 10 + point[1],
        local[2] * 10 + point[2],
      ];
      mouseHelper.lookAt(n, [0, 1, 0]);
    } else {
      mouseHelper.isActive = false;
      point = null;
      normal = null;
    }
  });
}

function addGeometryEvent() {
  document.getElementById('o3-demo').addEventListener('mouseup', (e) => {
    const orientation = mouseHelper.rotation;
    if (point && normal && !moved) {
      const decal = world.createChild('decal');
      const renderer = decal.createAbility(AGeometryRenderer);
      console.log(targetIntersection);
      renderer.geometry = new DecalGeometry(
        targetIntersection,
        point,
        orientation,
        [10, 10, 10],
      );
      renderer.setMaterial(decalMtl);
    }
  });
}


function createText() {
  const c = document.createElement('canvas');
  c.width = 300;
  c.height = 300;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0,0,300,300);
  ctx.fillStyle = '#000';
  ctx.font="60px Arial";
  ctx.fillText("Oasis贴花", 10, 100);
  return c;
}
