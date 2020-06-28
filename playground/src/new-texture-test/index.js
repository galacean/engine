import { Engine } from "@alipay/o3-core";
import { Logger, DrawMode, Side, ClearMode, MaskList, TextureCubeFace, GLCapabilityType } from "@alipay/o3-base";
import { ResourceLoader, Resource } from "@alipay/o3-loader";
import { AGeometryRenderer } from "@alipay/o3-geometry";
import { ADefaultCamera } from "@alipay/o3-default-camera";
import { AOrbitControls } from "@alipay/o3-orbit-controls";
import { PBRMaterial } from "@alipay/o3-pbr";
import { SphereGeometry } from "@alipay/o3-geometry-shape";
import { ASkyBox } from "@alipay/o3-skybox";
import { AAmbientLight, ADirectLight, APointLight, ASpotLight, AEnvironmentMapLight } from "@alipay/o3-lighting";
import * as dat from "dat.gui";
import "@alipay/o3-engine-stats";
import { Mesh, AMeshRenderer } from "@alipay/o3-mesh";
import { RegistExtension } from "@alipay/o3-loader-gltf";
import { RenderTarget, Texture2D } from "@alipay/o3-material";
import { RenderPass } from "@alipay/o3-renderer-basic";
import { Sprite, ASpriteRenderer } from "@alipay/o3-2d";
import { PerturbationProbe } from "@alipay/o3-env-probe";
import "@alipay/o3-compressed-texture";

function log(msg) {
  console.log(`%c ${msg}`, "color:orange");
}

const DEBUG_scene = true;
const DEBUG_envLight = true;
const DEBUG_material = true;
const DEBUG_WEBGL2 = false;
const DEBUG_texturePixelFetch = true;
const DEBUG_cubeTexturePixelFetch = true;
const DEBUG_compressedTexture = true;
const DEBUG_commpressedCubeTexture = true;

RegistExtension({ PBRMaterial });
Logger.enable();
let engine = new Engine();
let scene = engine.currentScene;

/**node*/
let rootNode = scene.root;
let directLightNode = rootNode.createChild("dir_light");
let directLightNode2 = rootNode.createChild("dir_light");
let envLightNode = rootNode.createChild("env_light");
let cameraNode = rootNode.createChild("camera_node");
let modelNode = rootNode.createChild("modelNode");

/**ability*/
const skybox = rootNode.createAbility(ASkyBox);

// light
let directLight = directLightNode.createAbility(ADirectLight, {
  color: [1, 1, 1],
  intensity: 0.5
});
let directLight2 = directLightNode2.createAbility(ADirectLight, {
  color: [1, 1, 1],
  intensity: 0.5
});
directLightNode.setRotationAngles(180, 0, 0);
directLightNode2.setRotationAngles(45, 0, 0);
let envLight = envLightNode.createAbility(AEnvironmentMapLight, {});

let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: "o3-demo",
  position: [0, 0.2, 30],
  clearParam: [0.9, 0.9, 0.9, 1],
  attributes: {
    disableWebGL2: !DEBUG_WEBGL2 // debug webgl1/2
  }
});
let controler = cameraNode.createAbility(AOrbitControls, { mainElement: document.getElementById("o3-demo") });
let meshes = [];
let materials = [];

/**
 * 向下兼容，新 loader 必须加载完 rhi
 *
 */
const rhi = engine.getRHI("o3-demo");
const resourceLoader = new ResourceLoader(engine, null, rhi);

/** debug Texture2D/TextureCube */
const cubeTextureList = ["sky", "house", "sunnyDay", "minisampler"];
const textureList = ["luminance.jpg", "FxColorRamp.png", "opacity_grid.png", "test.jpg"];
const cubeTextureRes = cubeTextureList.map(
  name =>
    new Resource(name, {
      type: "cubemapNew",
      urls: [
        `/static/skybox/${name}/px.jpg`,
        `/static/skybox/${name}/nx.jpg`,
        `/static/skybox/${name}/py.jpg`,
        `/static/skybox/${name}/ny.jpg`,
        `/static/skybox/${name}/pz.jpg`,
        `/static/skybox/${name}/nz.jpg`
      ]
    })
);
const textureRes = textureList.map(
  name =>
    new Resource(name, {
      type: "textureNew",
      url: `/static/texture/${name}`
    })
);
const cubeTextures = {};
const textures = {};

resourceLoader.batchLoad(cubeTextureRes, (err, reses) => {
  cubeTextureList.forEach((name, index) => {
    cubeTextures[name] = reses[index].asset;

    // debug set/get pixel
    if (DEBUG_cubeTexturePixelFetch) {
      log("debug cube set/get pixel");
      const buffer = new Uint8Array(100 * 4);
      cubeTextures[name].setPixelBuffer(TextureCubeFace.PositiveY, new Uint8Array([1, 2, 3, 4]), 0, 0, 0, 1, 1);
      cubeTextures[name].getPixelBuffer(TextureCubeFace.PositiveY, 0, 0, 10, 10, buffer);
      console.log(buffer);
    }
  });
});

resourceLoader.batchLoad(textureRes, (err, reses) => {
  textureList.forEach((name, index) => {
    textures[name] = reses[index].asset;

    // debug set/get pixel
    if (DEBUG_texturePixelFetch) {
      log("debug texture set/get pixel");
      const buffer = new Uint8Array(100 * 4);
      textures[name].setPixelBuffer(new Uint8Array([1, 2, 3, 4]), 0, 0, 0, 1, 1);
      // textures[name].setPixelBuffer(new Uint8Array(200 * 200 * 4), 1, 0, 0, 127, 15);
      textures[name].getPixelBuffer(0, 0, 10, 10, buffer);
      console.log(buffer);
    }
  });
});

/**debug gui*/
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
let materialFolder = null;

function debugSceneGUI() {
  const state = {
    // display
    background: "None",
    wireframe: false,
    autoRotate: false,
    bgColor: unNormalRGB([0.25, 0.25, 0.25]),
    // Lights
    textureEncoding: "Linear",
    gammaOutput: false,
    envTexture: "minisampler",
    envIntensity: 1,
    ambientColor: unNormalRGB([0.3, 0.3, 0.3]),
    ambientIntensity: 1,
    addLights: true,
    lightColor: unNormalRGB([1, 1, 1]),
    lightIntensity: 0.8
  };
  // Display controls.
  const dispFolder = gui.addFolder("Display");
  dispFolder.add(state, "background", ["None", ...cubeTextureList]).onChange(v => {
    if (v === "None") {
      skybox.skyBoxMap = null;
    } else {
      skybox && (skybox.skyBoxMap = cubeTextures[v]);
    }
  });
  dispFolder.add(state, "wireframe").onChange(v => {
    meshes.forEach(mesh => (mesh.primitives[0].mode = v ? DrawMode.LINE_STRIP : DrawMode.TRIANGLES));
  });
  dispFolder.add(state, "autoRotate").onChange(v => {
    controler.autoRotate = v;
  });
  dispFolder.addColor(state, "bgColor").onChange(v => {
    camera.sceneRenderer.defaultRenderPass.clearParam = [...normalRGB(v), 1];
  });

  // Lighting controls.
  const lightFolder = gui.addFolder("Lighting");
  lightFolder.add(state, "textureEncoding", ["sRGB", "Linear"]).onChange(v => {
    materials.forEach(m => (m.srgb = v === "sRGB"));
  });
  lightFolder.add(state, "gammaOutput").onChange(v => {
    materials.forEach(m => (m.gamma = v));
  });
  lightFolder.add(state, "envTexture", ["None", ...cubeTextureList]).onChange(v => {
    envLight.specularMap = v === "None" ? null : cubeTextures[v];
  });
  lightFolder.add(state, "envIntensity", 0, 2).onChange(v => {
    envLight.specularIntensity = v;
  });
  lightFolder.addColor(state, "ambientColor").onChange(v => {
    envLight.diffuse = normalRGB(v);
  });
  lightFolder.add(state, "ambientIntensity", 0, 2).onChange(v => {
    envLight.diffuseIntensity = v;
  });
  lightFolder
    .add(state, "addLights")
    .onChange(v => {
      directLight.enabled = v;
      directLight2.enabled = v;
    })
    .name("光源组合");
  lightFolder.addColor(state, "lightColor").onChange(v => {
    directLight.color = normalRGB(v);
    directLight2.color = normalRGB(v);
  });
  lightFolder.add(state, "lightIntensity", 0, 2).onChange(v => {
    directLight.intensity = v;
    directLight2.intensity = v;
  });

  // dispFolder.open();
  // lightFolder.open();
}

function addTextureDebug(parentFolder, textureType, state, material) {
  const folder = parentFolder.addFolder(textureType);
  folder
    .add(state, textureType, ["None", ...textureList])
    .onChange(v => {
      if (v === "None") {
        material[textureType] = null;
      } else {
        material[textureType] = textures[v];
      }
    })
    .name("纹理");
  if (material[textureType] && material[textureType] instanceof Texture2D) {
  }
}

function debugMatGUI() {
  if (materialFolder) {
    gui.removeFolder(materialFolder);
    materialFolder = null;
  }
  materialFolder = gui.addFolder("materialDebug");
  const folderName = {};

  materials.forEach(m => {
    const state = {
      baseColorFactor: unNormalRGB(m.baseColorFactor),
      emissiveFactor: unNormalRGB(m.emissiveFactor),
      baseColorTexture: (m.baseColorTexture && m.baseColorTexture.name) || "",
      metallicTexture: (m.metallicTexture && m.metallicTexture.name) || "",
      roughnessTexture: (m.roughnessTexture && m.roughnessTexture.name) || "",
      metallicRoughnessTexture: (m.metallicRoughnessTexture && m.metallicRoughnessTexture.name) || "",
      normalTexture: (m.normalTexture && m.normalTexture.name) || "",
      emissiveTexture: (m.emissiveTexture && m.emissiveTexture.name) || "",
      occlusionTexture: (m.occlusionTexture && m.occlusionTexture.name) || "",
      opacityTexture: (m.opacityTexture && m.opacityTexture.name) || "",
      specularGlossinessTexture: (m.specularGlossinessTexture && m.specularGlossinessTexture.name) || "",
      specularFactor: unNormalRGB(m.specularFactor)
    };
    const f = materialFolder.addFolder(folderName[m.name] ? `${m.name}_${folderName[m.name] + 1}` : m.name);
    folderName[m.name] = folderName[m.name] == null ? 1 : folderName[m.name] + 1;

    // specular
    let mode1 = f.addFolder("高光模式");
    mode1.add(m, "isMetallicWorkflow");
    mode1.add(m, "glossinessFactor", 0, 1);
    mode1.addColor(state, "specularFactor").onChange(v => {
      m.specularFactor = normalRGB(v);
    });
    addTextureDebug(mode1, "specularGlossinessTexture", state, m);

    // metallic
    let mode2 = f.addFolder("金属模式");
    mode2.add(m, "metallicFactor", 0, 1);
    mode2.add(m, "roughnessFactor", 0, 1);
    addTextureDebug(mode2, "metallicTexture", state, m);
    addTextureDebug(mode2, "roughnessTexture", state, m);
    addTextureDebug(mode2, "metallicRoughnessTexture", state, m);
    // common
    let common = f.addFolder("通用");

    common.add(m, "envMapModeRefract").name("折射模式");
    common.add(m, "envMapIntensity", 0, 2).step(0.01);
    common
      .add(m, "refractionRatio", 0, 2)
      .step(0.01)
      .name("折射率");
    common.add(m, "opacity", 0, 1).onChange(v => {
      state.baseColorFactor[3] = v;
    });
    common.add(m, "alphaMode", ["OPAQUE", "BLEND", "MASK"]);
    common.add(m, "alphaCutoff", 0, 1);
    common.add(m, "clearCoat", 0, 1);
    common.add(m, "clearCoatRoughness", 0, 1);
    common.add(m, "getOpacityFromRGB");
    common.add(m, "unlit");

    common
      .addColor(state, "baseColorFactor")
      .onChange(v => {
        m.baseColorFactor = normalRGB(v);
      })
      .listen();
    common.addColor(state, "emissiveFactor").onChange(v => {
      m.emissiveFactor = normalRGB(v);
    });
    addTextureDebug(common, "baseColorTexture", state, m);
    addTextureDebug(common, "normalTexture", state, m);
    addTextureDebug(common, "emissiveTexture", state, m);
    addTextureDebug(common, "occlusionTexture", state, m);
    addTextureDebug(common, "opacityTexture", state, m);

    // f.open();
    mode1.open();
    mode2.open();
    common.open();
  });

  materialFolder.open();
}

function initShape() {
  const geometry = new SphereGeometry(5, 64, 64);
  const { primitive } = geometry;
  const material = new PBRMaterial("pbr", {
    roughnessFactor: 0,
    metallicFactor: 1
  });
  const mesh = new Mesh("defaultMesh");
  primitive.material = material;
  mesh.primitives.push(primitive);
  modelNode.createAbility(AMeshRenderer, { mesh });

  meshes = [mesh];
  materials = [material];
}

function debugEnvLight(envLightNode) {
  const folder = gui.addFolder("IBL 旋转");
  const debugInfo = {
    x: 0,
    y: 0,
    z: 0,
    reset: function() {
      debugInfo.x = debugInfo.y = debugInfo.z = 0;

      envLightNode.setRotationAngles(0, 0, 0);
    }
  };
  folder
    .add(debugInfo, "x", -180, 180, 1)
    .onChange(v => {
      envLightNode.setRotationAngles(v, debugInfo.y, debugInfo.z);
    })
    .listen();
  folder
    .add(debugInfo, "y", -180, 180, 1)
    .onChange(v => {
      envLightNode.setRotationAngles(debugInfo.x, v, debugInfo.z);
    })
    .listen();
  folder
    .add(debugInfo, "z", -180, 180, 1)
    .onChange(v => {
      envLightNode.setRotationAngles(debugInfo.x, debugInfo.y, v);
    })
    .listen();
  folder.add(debugInfo, "reset");
}

function debugCompressedTexture() {
  if (rhi.canIUse(GLCapabilityType.s3tc)) {
    const dxt5MipmapUrl = "https://gw.alipayobjects.com/os/bmw-prod/269eae01-13d9-43fc-80a5-cc5a784eae7a.ktx";
    resourceLoader.batchLoad(
      [dxt5MipmapUrl].map(url => new Resource("dxt", { type: "ktxNew", url })),
      (err, resources) => {
        if (err) {
          console.error(err);
        } else {
          log("压缩纹理加载成功");
          console.log(resources);
          materials[0].baseColorTexture = resources[0].asset;
        }
      }
    );
  }
}

function debugCompressedCube() {
  const res = new Resource("env", {
    type: "ktxNew",
    urls: [
      "https://gw.alipayobjects.com/os/bmw-prod/60a492d3-f22e-4b74-ae89-f9f022889846.ktx",
      "https://gw.alipayobjects.com/os/bmw-prod/6ec5a407-2ef8-42ea-b0c0-33cd1b58df46.ktx",
      "https://gw.alipayobjects.com/os/bmw-prod/7ea007d3-65b1-4555-90d7-088a35476def.ktx",
      "https://gw.alipayobjects.com/os/bmw-prod/1f678f0d-db1c-436e-8087-2206ea56c4c4.ktx",
      "https://gw.alipayobjects.com/os/bmw-prod/36ca08f6-0dc0-44dd-82fd-92a705b78e45.ktx",
      "https://gw.alipayobjects.com/os/bmw-prod/fbd31bc7-d04d-460b-9620-39bd1648a79f.ktx"
    ]
  });
  resourceLoader.load(res, (err, res) => {
    if (err) {
      console.error(err);
    } else {
      log("压缩立方体纹理加载成功");
      console.log(res);
      skybox.skyBoxMap = res.asset;
      envLight.specularMap = res.asset;
    }
  });
}

//-- run
engine.run();

initShape();
DEBUG_scene && debugSceneGUI();
DEBUG_material && debugMatGUI();
DEBUG_envLight && debugEnvLight(envLightNode);
DEBUG_compressedTexture && debugCompressedTexture();
DEBUG_commpressedCubeTexture && debugCompressedCube();
