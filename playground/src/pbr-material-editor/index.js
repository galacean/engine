import {Engine} from '@alipay/o3-core';
import {DrawMode} from "@alipay/o3-base";
import {ResourceLoader, Resource} from '@alipay/o3-loader';
import {AGeometryRenderer} from '@alipay/o3-geometry';
import {ADefaultCamera} from '@alipay/o3-default-camera';
import {AOrbitControls} from '@alipay/o3-orbit-controls';
import {AEnvironmentMapLight, PBRMaterial} from '@alipay/o3-pbr';
import {SphereGeometry} from '@alipay/o3-geometry-shape';
import {ASkyBox} from '@alipay/o3-skybox';
import {AAmbientLight, ADirectLight, APointLight, ASpotLight} from '@alipay/o3-lighting';
import * as dat from 'dat.gui';
import '@alipay/o3-engine-stats';

let engine = new Engine();
let scene = engine.currentScene;
const resourceLoader = new ResourceLoader(engine);

/**node*/
let rootNode = scene.root;
let directLightNode = rootNode.createChild('dir_light');
let envLightNode = rootNode.createChild('env_light');
let cameraNode = rootNode.createChild('camera_node');
let ballNode = rootNode.createChild('ball');

/**ability*/
let skybox = null;
// light
let directLight = directLightNode.createAbility(ADirectLight, {
  color: [1, 1, 1],
  intensity: 1
});
directLightNode.setRotationAngles(180, 0, 0);
let envLight = envLightNode.createAbility(AEnvironmentMapLight, {});

let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'o3-demo', position: [0, 10, 20]
});
let controler = cameraNode.createAbility(AOrbitControls, {canvas: document.getElementById('o3-demo')});


let renderer = ballNode.createAbility(AGeometryRenderer);
let geometry = new SphereGeometry(5, 64, 64);
let material = new PBRMaterial('pbr', {
  roughnessFactor: 0,
  alphaMode: "BLEND",
});
renderer.geometry = geometry;
renderer.material = material;
let g = window.g = geometry;
let m = window.m = material;

/**resources*/
const cubeTextureList = ['sky', 'house', 'sunnyDay'];
const textureList = ['luminance.jpg', 'opacity_grid.png'];
const cubeTextureRes = cubeTextureList.map(name => new Resource(name, {
  type: 'cubemap',
  urls: [
    `/static/skybox/${name}/px.jpg`,
    `/static/skybox/${name}/nx.jpg`,
    `/static/skybox/${name}/py.jpg`,
    `/static/skybox/${name}/ny.jpg`,
    `/static/skybox/${name}/pz.jpg`,
    `/static/skybox/${name}/nz.jpg`,
  ]
}));
const textureRes = textureList.map(name => new Resource(name, {
  type: 'texture',
  url: `/static/texture/${name}`
}));
const cubeTextures = {};
const textures = {};

resourceLoader.batchLoad(cubeTextureRes, (err, reses) => {
  cubeTextureList.forEach((name, index) => {
    cubeTextures[name] = reses[index].asset;
  });
  skybox = rootNode.createAbility(ASkyBox, {skyBoxMap: cubeTextures.sky});
  envLight.specularMap = cubeTextures.sky
});

resourceLoader.batchLoad(textureRes, (err, reses) => {
  textureList.forEach((name, index) => {
    textures[name] = reses[index].asset;
  })
});

/**debug*/
function normalRGB(color) {
  const v = color.slice();
  v[0] /= 255;
  v[1] /= 255;
  v[2] /= 255;
  return v;
}

function unNormalRGB(color) {
  const v = color.slice();
  v[0] *= 255;
  v[1] *= 255;
  v[2] *= 255;
  return v;
}

const gui = new dat.GUI();

function addSceneGUI() {
  const state = {
    // display
    background: 'sky',
    wireframe: false,
    autoRotate: false,
    bgColor: unNormalRGB([0.25, 0.25, 0.25]),
    // Lights
    textureEncoding: 'Linear',
    gammaOutput: false,
    envTexture: 'sky',
    envIntensity: 1,
    ambientColor: unNormalRGB([0.3, 0.3, 0.3]),
    ambientIntensity: 1,
    addLights: true,
    lightColor: unNormalRGB([1, 1, 1]),
    lightIntensity: .8
  };
  // Display controls.
  const dispFolder = gui.addFolder('Display');
  dispFolder.add(state, 'background', ['None', ...cubeTextureList]).onChange(v => {
    if (v === 'None') {
      skybox && (skybox.enabled = false);
    } else {
      skybox && (skybox.enabled = true);
      skybox && (skybox.skyBoxMap = cubeTextures[v]);
    }
  })
  dispFolder.add(state, 'wireframe').onChange(v => {
    g.primitive.mode = v ? DrawMode.LINE_STRIP : DrawMode.TRIANGLES;
  });
  dispFolder.add(state, 'autoRotate').onChange(v => {
    controler.autoRotate = v;
  });
  dispFolder.addColor(state, 'bgColor').onChange(v => {
    camera.sceneRenderer.defaultRenderPass.clearParam = [...normalRGB(v), 1];
  });

  // Lighting controls.
  const lightFolder = gui.addFolder('Lighting');
  lightFolder.add(state, 'textureEncoding', ['sRGB', 'Linear']).onChange(v => {
    m.srgb = v === 'sRGB'
  });
  lightFolder.add(state, 'gammaOutput').onChange(v => {
    m.gamma = v;
  });
  lightFolder.add(state, 'envTexture', ['None', ...cubeTextureList]).onChange(v => {
    envLight.specularMap = v === 'None' ? null : cubeTextures[v];
  });
  lightFolder.add(state, 'envIntensity', 0, 2).onChange(v => {
    envLight.specularIntensity = v;
  });
  lightFolder.addColor(state, 'ambientColor').onChange(v => {
    envLight.diffuse = normalRGB(v);
  });
  lightFolder.add(state, 'ambientIntensity', 0, 2).onChange(v => {
    envLight.diffuseIntensity = v;
  });
  lightFolder.add(state, 'addLights').onChange(v => {
    directLight.enabled = v;
  }).name('光源组合');
  lightFolder.addColor(state, 'lightColor').onChange(v => {
    directLight.color = normalRGB(v);
  });
  lightFolder.add(state, 'lightIntensity', 0, 2).onChange(v => {
    directLight.intensity = v;
  });

  dispFolder.open();
  lightFolder.open();
}

function addMatGUI() {
  const f = gui.addFolder('materialDebug');
  const state = {
    baseColorFactor: unNormalRGB(m.baseColorFactor),
    emissiveFactor: unNormalRGB(m.emissiveFactor),
    baseColorTexture: m.baseColorTexture && m.baseColorTexture.name || '',
    metallicRoughnessTexture: m.metallicRoughnessTexture && m.metallicRoughnessTexture.name || '',
    normalTexture: m.normalTexture && m.normalTexture.name || '',
    emissiveTexture: m.emissiveTexture && m.emissiveTexture.name || '',
    occlusionTexture: m.occlusionTexture && m.occlusionTexture.name || '',
    opacityTexture: m.opacityTexture && m.opacityTexture.name || '',
    specularGlossinessTexture: m.specularGlossinessTexture && m.specularGlossinessTexture.name || '',
    specularFactor: unNormalRGB(m.specularFactor),
  };

  // specular
  let mode1 = f.addFolder('高光模式');
  mode1.add(m, 'isMetallicWorkflow');
  mode1.add(m, 'glossinessFactor', 0, 1);
  mode1.addColor(state, 'specularFactor').onChange(v => {
    m.specularFactor = normalRGB(v);
  });
  mode1.add(state, 'specularGlossinessTexture', ['None', ...textureList]).onChange(v => {
    m.specularGlossinessTexture = v === 'None' ? null : textures[v];
  })

  // metallic
  let mode2 = f.addFolder('金属模式')
  mode2.add(m, 'metallicFactor', 0, 1);
  mode2.add(m, 'roughnessFactor', 0, 1);
  // common
  let common = f.addFolder('通用');

  common.add(m, 'opacity', 0, 1);
  common.add(m, 'alphaMode', ['OPAQUE', 'BLEND', 'MASK']);
  common.add(m, 'alphaCutoff', 0, 1);
  common.add(m, 'clearCoat', 0, 1);
  common.add(m, 'clearCoatRoughness', 0, 1);
  common.add(m, 'getOpacityFromRGB');
  common.add(m, 'unlit');

  common.addColor(state, 'baseColorFactor').onChange(v => {
    m.baseColorFactor = normalRGB(v);
  });
  common.addColor(state, 'emissiveFactor').onChange(v => {
    m.emissiveFactor = normalRGB(v);
  });
  common.add(state, 'baseColorTexture', ['None', ...textureList]).onChange(v => {
    m.baseColorTexture = v === 'None' ? null : textures[v];
  })
  common.add(state, 'metallicRoughnessTexture', ['None', ...textureList]).onChange(v => {
    m.metallicRoughnessTexture = v === 'None' ? null : textures[v];
  })
  common.add(state, 'normalTexture', ['None', ...textureList]).onChange(v => {
    m.normalTexture = v === 'None' ? null : textures[v];
  })
  common.add(state, 'emissiveTexture', ['None', ...textureList]).onChange(v => {
    m.emissiveTexture = v === 'None' ? null : textures[v];
  })
  common.add(state, 'occlusionTexture', ['None', ...textureList]).onChange(v => {
    m.occlusionTexture = v === 'None' ? null : textures[v];
  })
  common.add(state, 'opacityTexture', ['None', ...textureList]).onChange(v => {
    m.opacityTexture = v === 'None' ? null : textures[v];
  })

  f.open();
  mode1.open();
  mode2.open();
  common.open();

}

addSceneGUI();
addMatGUI();
//-- run
engine.run();