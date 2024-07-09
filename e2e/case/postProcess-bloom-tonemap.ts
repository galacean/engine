/**
 * @title Bloom + Tonemap
 * @category PostProcess
 */
import {
  AmbientLight,
  AssetType,
  BackgroundMode,
  BloomEffect,
  Camera,
  GLTFResource,
  PostProcessPass,
  PrimitiveMesh,
  SkyBoxMaterial,
  Texture2D,
  TonemappingEffect,
  TonemappingMode,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  //Create camera
  const cameraNode = rootEntity.createChild("camera_node");
  cameraNode.transform.position = new Vector3(6, 0, 6);
  cameraNode.transform.lookAt(new Vector3(0, 0, 0));
  const camera = cameraNode.addComponent(Camera);

  Promise.all([
    engine.resourceManager
      .load<GLTFResource>("https://gw.alipayobjects.com/os/bmw-prod/a1da72a4-023e-4bb1-9629-0f4b0f6b6fc4.glb")
      .then((glTF) => {
        const defaultSceneRoot = glTF.instantiateSceneRoot();
        rootEntity.addChild(defaultSceneRoot);
      }),
    engine.resourceManager
      .load<AmbientLight>({
        type: AssetType.Env,
        url: "https://gw.alipayobjects.com/os/bmw-prod/89c54544-1184-45a1-b0f5-c0b17e5c3e68.bin"
      })
      .then((ambientLight) => {
        scene.ambientLight = ambientLight;
        const sky = scene.background.sky;
        const skyMaterial = new SkyBoxMaterial(engine);
        scene.background.mode = BackgroundMode.Sky;

        sky.material = skyMaterial;
        sky.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
        skyMaterial.texture = ambientLight.specularTexture;
        skyMaterial.textureDecodeRGBM = true;
      }),
    engine.resourceManager.load<Texture2D>({
      type: AssetType.Texture2D,
      url: "https://mdn.alipayobjects.com/huamei_dmxymu/afts/img/A*tMeTQ4Mx60oAAAAAAAAAAAAADuuHAQ/original"
    })
  ]).then(([_, __, dirtTexture]) => {
    camera.enablePostProcess = true;
    camera.enableHDR = true;
    // @ts-ignore
    const bloomEffect = scene._postProcessManager._bloomEffect;
    // @ts-ignore
    const tonemappingEffect = scene._postProcessManager._tonemappingEffect;

    bloomEffect.enabled = true;
    tonemappingEffect.enabled = true;

    bloomEffect.dirtTexture = dirtTexture;
    bloomEffect.threshold = 0.5;
    tonemappingEffect.mode = TonemappingMode.ACES;

    updateForE2E(engine);

    initScreenshot(engine, camera);
  });
});
