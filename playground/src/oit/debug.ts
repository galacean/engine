import { DrawMode } from "@alipay/o3-base";
import { Texture2D } from "@alipay/o3-material";
import * as dat from "dat.gui";
import { cubeTextureList, textureList, cubeTextureRes, textureRes, cubeTextures, textures } from "./asset";

const gui = new dat.GUI();
let materialFolder = null;

/**debug*/
function normalRGB(color) {
  const v = color.slice();
  v[0] /= 255;
  v[1] /= 255;
  v[2] /= 255;
  return v;
}

function unNormalRGB(color) {
  const v = [].slice.call(color);
  v[0] *= 255;
  v[1] *= 255;
  v[2] *= 255;
  return v;
}

function addSceneGUI({ envLight, lights, skybox, meshes, materials }) {
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
    lightIntensity: 0.5
  };
  // Display controls.
  const dispFolder = gui.addFolder("Display");
  dispFolder.add(state, "background", ["None", ...cubeTextureList]).onChange(v => {
    if (v === "None") {
      skybox && (skybox.enabled = false);
    } else {
      skybox && (skybox.enabled = true);
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
      lights.forEach(light => (light.enabled = v));
    })
    .name("光源组合");
  lightFolder.addColor(state, "lightColor").onChange(v => {
    lights.forEach(light => (light.color = normalRGB(v)));
  });
  lightFolder.add(state, "lightIntensity", 0, 2).onChange(v => {
    lights.forEach(light => (light.intensity = v));
  });

  // dispFolder.open();
  // lightFolder.open();
}

function addTextureDebug(parentFolder, textureType, state, material) {
  const step = 0.01;
  let uvControlers = [];
  function showUVDebug() {
    hideUVDebug();
    uvControlers.push(folder.add(material[textureType], "flipY"));
    uvControlers.push(folder.add(material[textureType], "premultiplyAlpha"));
    uvControlers.push(folder.add(material[textureType], "uOffset", -1, 1, step));
    uvControlers.push(folder.add(material[textureType], "vOffset", -1, 1, step));
    uvControlers.push(folder.add(material[textureType], "uScale", 0, 100, step));
    uvControlers.push(folder.add(material[textureType], "vScale", 0, 100, step));
    uvControlers.push(folder.add(material[textureType], "uvRotation", 0, Math.PI * 2, step));
    uvControlers.push(folder.add(material[textureType].uvCenter, "0", -1, 1, step).name("centerX"));
    uvControlers.push(folder.add(material[textureType].uvCenter, "1", -1, 1, step).name("centerY"));
  }
  function hideUVDebug() {
    uvControlers.forEach(controler => controler.remove());
    uvControlers = [];
  }
  const folder = parentFolder.addFolder(textureType);
  folder
    .add(state, textureType, ["None", ...textureList])
    .onChange(v => {
      if (v === "None") {
        material[textureType] = null;
        hideUVDebug();
      } else {
        material[textureType] = textures[v];
        showUVDebug();
      }
    })
    .name("纹理");
  if (material[textureType] && material[textureType] instanceof Texture2D) {
    showUVDebug();
  }
}

function addMobileGUI(materials) {
  if (materialFolder) {
    gui.removeFolder(materialFolder);
    materialFolder = null;
  }
  materialFolder = gui.addFolder("materialDebug");
  const folderName = {};

  materials.forEach(m => {
    const state = {
      diffuse: (m.diffuse && m.diffuse.name) || "",
      specular: (m.specular && m.specular.name) || ""
      // texture: (m.texture && m.texture.name) || ""
    };
    const f = materialFolder.addFolder(folderName[m.name] ? `${m.name}_${folderName[m.name] + 1}` : m.name);
    folderName[m.name] = folderName[m.name] == null ? 1 : folderName[m.name] + 1;

    // common
    let common = f.addFolder("通用");

    common.add(m, "shininess", 0, 100);
    addTextureDebug(common, "diffuse", state, m);
    addTextureDebug(common, "specular", state, m);
    // addTextureDebug(common, "texture", state, m);

    common.open();
  });

  materialFolder.open();
}

function addPBRGUI(materials) {
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
    mode2.add(m, "metallicFactor", 0, 1, 0.1);
    mode2.add(m, "roughnessFactor", 0, 1, 0.1);
    addTextureDebug(mode2, "metallicRoughnessTexture", state, m);
    // common
    let common = f.addFolder("通用");

    common.add(m, "envMapModeRefract").name("折射模式");
    common.add(m, "envMapIntensity", 0, 2, 0.01);
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
    common.add(m, "doubleSided");

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

    f.open();
    // mode1.open();
    // mode2.open();
    common.open();
  });

  materialFolder.open();
}

function addOITDebug(camera, oitSceneRender) {
  const defaultSceneRender = camera.sceneRenderer;
  camera.sceneRenderer = oitSceneRender;
  gui.add({ OIT: true }, "OIT").onChange(v => {
    camera.sceneRenderer = v ? oitSceneRender : defaultSceneRender;
  });
}

export { addSceneGUI, addMobileGUI, addPBRGUI, addOITDebug };
