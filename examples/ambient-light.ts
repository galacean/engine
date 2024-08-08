/**
 * @title AmbientLight
 * @category Light
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*7LKBQ4bsMiEAAAAAAAAAAAAADiR2AQ/original
 */
import * as dat from "dat.gui";
import {
  AmbientLight,
  AssetType,
  BackgroundMode,
  Camera,
  DiffuseMode,
  DirectLight,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  SkyBoxMaterial,
  Vector3,
  WebGLEngine,
  Logger,
} from "@galacean/engine";
import { OrbitControl } from "@galacean/engine-toolkit-controls";

Logger.enable();
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();
  const gui = new dat.GUI();

  // Create camera
  const cameraNode = rootEntity.createChild("camera_node");
  cameraNode.transform.position = new Vector3(-3, 0, 3);
  cameraNode.addComponent(Camera);
  cameraNode.addComponent(OrbitControl);

  // Create sky
  const sky = scene.background.sky;
  const skyMaterial = new SkyBoxMaterial(engine);
  scene.background.mode = BackgroundMode.Sky;
  sky.material = skyMaterial;
  sky.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);

  const lightEntity = rootEntity.createChild();
  lightEntity.addComponent(DirectLight).intensity = 0.5;
  lightEntity.transform.setPosition(-5, 5, 5);
  lightEntity.transform.lookAt(new Vector3(0, 0, 0));

  // material ball
  const ball = rootEntity.createChild("ball");
  const ballRender = ball.addComponent(MeshRenderer);
  const material = new PBRMaterial(engine);
  material.metallic = 0;
  material.roughness = 0;
  ballRender.mesh = PrimitiveMesh.createSphere(engine, 1, 64);
  ballRender.setMaterial(material);

  engine.resourceManager
    .load<AmbientLight>({
      type: AssetType.Env,
      url: "https://gw.alipayobjects.com/os/bmw-prod/6470ea5e-094b-4a77-a05f-4945bf81e318.bin",
    })
    .then((ambientLight) => {
      scene.ambientLight = ambientLight;
      skyMaterial.texture = ambientLight.specularTexture;
      skyMaterial.textureDecodeRGBM = true;
      openDebug(ambientLight.specularTexture);
      engine.run();
    });

  function openDebug(specularTexture) {
    const info = {
      diffuseMode: "SphericalHarmonics",
      diffuseSolidColor: [0.212 * 255, 0.227 * 255, 0.259 * 255],
      specularTexture: true,
    };

    gui
      .add(info, "diffuseMode", ["SolidColor", "SphericalHarmonics"])
      .onChange((v) => {
        if (v === "SphericalHarmonics") {
          scene.ambientLight.diffuseMode = DiffuseMode.SphericalHarmonics;
        } else if (v === "SolidColor") {
          scene.ambientLight.diffuseMode = DiffuseMode.SolidColor;
        }
      });

    gui.addColor(info, "diffuseSolidColor").onChange((v) => {
      scene.ambientLight.diffuseSolidColor.set(
        v[0] / 255,
        v[1] / 255,
        v[2] / 255,
        1
      );
    });

    gui.add(info, "specularTexture").onChange((v) => {
      if (v) {
        scene.ambientLight.specularTexture = specularTexture;
      } else {
        scene.ambientLight.specularTexture = null;
      }
    });

    // env light debug
    gui.add(scene.ambientLight, "specularIntensity", 0, 1);
    gui.add(scene.ambientLight, "diffuseIntensity", 0, 1);
  }
});
