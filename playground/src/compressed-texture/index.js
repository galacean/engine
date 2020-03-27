import { Engine } from "@alipay/o3-core";
import { ADefaultCamera } from "@alipay/o3-default-camera";
import { AGeometryRenderer } from "@alipay/o3-geometry";
import { PlaneGeometry } from "@alipay/o3-geometry-shape";
import { ResourceLoader, Resource } from "@alipay/o3-loader";
import { AAmbientLight } from "@alipay/o3-lighting";
import { TextureMaterial } from "@alipay/o3-mobile-material";
import { AOrbitControls } from "@alipay/o3-orbit-controls";
import { AHUDLabel } from "../common/AHUDLabel";
import { vec3 } from "@alipay/o3-math";

import "@alipay/o3-compressed-texture";

import "@alipay/o3-engine-stats";

import { Logger, GLCapabilityType } from "@alipay/o3-base";

Logger.enable();

//-- create engine object
let engine = new Engine();
const originUrl = "https://gw.alipayobjects.com/mdn/rms_45d093/afts/img/A*6Pe0TK41flYAAAAAAAAAAABkARQnAQ";
const originTexture = new Resource("origin", {
  type: "texture",
  url: originUrl
});

const resourceLoader = new ResourceLoader(engine);
let scene = engine.currentScene;
let rootNode = scene.root;

//-- create light
let light = rootNode.createChild("light1");
light.createAbility(AAmbientLight);

//-- create camera
let cameraNode = rootNode.createChild("camera_node");
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: "o3-demo",
  position: [0, 0, 5],
  near: 0.1,
  far: 100
});
cameraNode.createAbility(AOrbitControls, { canvas: document.getElementById("o3-demo") });

const rhi = engine.getRHI("o3-demo");

resourceLoader.load(originTexture, (err, res) => {
  renderTextures([res.asset], 1.5, "png");
});

if (rhi.canIUse(GLCapabilityType.s3tc)) {
  const dxt1MipmapUrl = "https://gw.alipayobjects.com/os/bmw-prod/b38cb09e-154c-430e-98c8-81dc19d4fb8e.ktx";
  const dxt1aMipmapUrl = "https://gw.alipayobjects.com/os/bmw-prod/05d5fbfe-44e7-4348-a0ec-37a46ddc94d1.ktx";
  const dxt3MipmapUrl = "https://gw.alipayobjects.com/os/bmw-prod/1fdf3bee-dcf6-4a7e-b7ed-311e637de8bb.ktx";
  const dxt5MipmapUrl = "https://gw.alipayobjects.com/os/bmw-prod/269eae01-13d9-43fc-80a5-cc5a784eae7a.ktx";
  resourceLoader.batchLoad(
    [dxt1MipmapUrl, dxt1aMipmapUrl, dxt3MipmapUrl, dxt5MipmapUrl].map(url => new Resource("dxt", { type: "ktx", url })),
    (err, resources) => {
      renderTextures(
        resources.map(res => res.asset),
        1,
        "s3tc"
      );
    }
  );
} else {
  renderNotSupport(1, "s3tc");
}

if (rhi.canIUse(GLCapabilityType.etc1)) {
  const etc1Url = "https://gw.alipayobjects.com/os/bmw-prod/a704b7a6-b9b1-48ed-a215-04745a90b003.ktx";
  resourceLoader.batchLoad(
    [etc1Url].map(url => new Resource("etc1", { type: "ktx", url })),
    (err, resources) => {
      renderTextures(
        resources.map(res => res.asset),
        0.5,
        "etc1"
      );
    }
  );
} else {
  renderNotSupport(0.5, "etc1");
}

if (rhi.canIUse(GLCapabilityType.etc)) {
  const etc2rgbaUrl = "https://gw.alipayobjects.com/os/bmw-prod/24406406-bfa4-4e08-b5da-b26056fdea62.ktx";
  const etc2rgbUrl = "https://gw.alipayobjects.com/os/bmw-prod/e03d0d5f-be29-412c-b412-2d8e583b7a5a.ktx";

  resourceLoader.batchLoad(
    [etc2rgbaUrl, etc2rgbUrl].map(url => new Resource("etc2", { type: "ktx", url })),
    (err, resources) => {
      renderTextures(
        resources.map(res => res.asset),
        0,
        "etc2"
      );
    }
  );
} else {
  renderNotSupport(0, "etc2");
}

if (rhi.canIUse(GLCapabilityType.astc)) {
  const astc44Url = "https://gw.alipayobjects.com/os/bmw-prod/3fb9b745-e02b-425b-98e5-df6a0a058b47.ktx";
  const astc1212Url = "https://gw.alipayobjects.com/os/bmw-prod/6465388f-81b4-45d1-86a4-731344af220b.ktx";

  resourceLoader.batchLoad(
    [astc44Url, astc1212Url].map(url => new Resource("astc", { type: "ktx", url })),
    (err, resources) => {
      renderTextures(
        resources.map(res => res.asset),
        -0.5,
        "astc"
      );
    }
  );
} else {
  renderNotSupport(-0.5, "astc");
}

if (rhi.canIUse(GLCapabilityType.pvrtc)) {
  const pvrtc12Url = "https://gw.alipayobjects.com/os/bmw-prod/7955549e-ee62-4982-a810-d118e2fce6dd.ktx";
  const pvrtc14Url = "https://gw.alipayobjects.com/os/bmw-prod/dc02693a-f416-4b2e-bf7b-9553c4038ce8.ktx";
  const pvrtc12rgbUrl = "https://gw.alipayobjects.com/os/bmw-prod/c8883997-3616-4811-a9bf-4d4c07015fb7.ktx";
  const pvrtc14rgbUrl = "https://gw.alipayobjects.com/os/bmw-prod/3de8467b-f626-48e3-8dd4-8cb4e7acbe4f.ktx";
  resourceLoader.batchLoad(
    [pvrtc12Url, pvrtc14Url, pvrtc12rgbUrl, pvrtc14rgbUrl].map(url => new Resource("pvrtc", { type: "ktx", url })),
    (err, resources) => {
      renderTextures(
        resources.map(res => res.asset),
        -1,
        "pvrtc"
      );
    }
  );
} else {
  renderNotSupport(-1, "pvrtc");
}

//-- run
engine.run();

function renderTextures(textures, y, type) {
  const w = 0.5;
  const labelNode = rootNode.createChild("label-" + type);
  labelNode.position = vec3.fromValues(-1.5, y, 0);
  const label = labelNode.createAbility(AHUDLabel, {
    spriteID: type + "Label",
    textureSize: [100, 100],
    renderMode: "2D",
    screenSize: [100, 100]
  });
  label.text = type;
  textures.forEach((texture, index) => {
    let mtl = new TextureMaterial(texture.name);
    mtl.texture = texture;
    let obj = rootNode.createChild("node-" + texture.name);
    obj.position = [index / 2 - 1, y, 0];
    let cubeRenderer = obj.createAbility(AGeometryRenderer);
    cubeRenderer.geometry = new PlaneGeometry(w, w);
    cubeRenderer.setMaterial(mtl);
  });
}

function renderNotSupport(y, type) {
  const labelNode = rootNode.createChild("label-" + type);
  labelNode.position = vec3.fromValues(0, y, 0);
  const label = labelNode.createAbility(AHUDLabel, {
    spriteID: type + "Label",
    textureSize: [300, 100],
    renderMode: "2D",
    screenSize: [300, 100]
  });
  label.text = type + " not support";
}