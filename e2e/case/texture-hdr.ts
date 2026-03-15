/**
 * @title HDR Texture
 * @category Texture
 */
import {
  AssetType,
  BackgroundMode,
  Camera,
  Logger,
  PrimitiveMesh,
  SkyBoxMaterial,
  TextureCube,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

Logger.enable();

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize(2);
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  const cameraEntity = rootEntity.createChild("camera_node");
  cameraEntity.transform.position = new Vector3(0, 0, 0);
  const camera = cameraEntity.addComponent(Camera);

  engine.resourceManager
    .load<TextureCube>({
      type: AssetType.TextureCube,
      url: "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_48d_partly_cloudy_puresky_1k.hdr"
    })
    .then((textureCube) => {
      const sky = scene.background.sky;
      const skyMaterial = new SkyBoxMaterial(engine);
      scene.background.mode = BackgroundMode.Sky;

      sky.material = skyMaterial;
      sky.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
      skyMaterial.texture = textureCube;

      updateForE2E(engine);
      initScreenshot(engine, camera);
    });
});
