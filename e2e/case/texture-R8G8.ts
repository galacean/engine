/**
 * @title PrimitiveMesh
 * @category Primitive
 */
import {
  Camera,
  Logger,
  MeshRenderer,
  PrimitiveMesh,
  Texture2D,
  TextureFormat,
  UnlitMaterial,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

Logger.enable();
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize(2);

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // Create camera
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.setPosition(0, 0, 1);
  const camera = cameraEntity.addComponent(Camera);

  // Create Plane
  const material = new UnlitMaterial(engine);
  const planeEntity = rootEntity.createChild("ground");
  planeEntity.transform.setRotation(5, 0, 0);

  const planeRenderer = planeEntity.addComponent(MeshRenderer);
  planeRenderer.mesh = PrimitiveMesh.createPlane(engine, 2, 2);
  planeRenderer.setMaterial(material);

  const width = 1024;
  const height = 1024;
  const r8Texture = new Texture2D(engine, width, height, TextureFormat.R8G8, false);
  const pixels = new Uint8Array(width * height * 2); // 2 bytes per pixel (R and G)
  for (let i = 0; i < width * height; i++) {
    pixels[i * 2] = 200; // R
    pixels[i * 2 + 1] = 128; // G
  }
  r8Texture.setPixelBuffer(pixels);
  r8Texture.generateMipmaps();

  material.baseTexture = r8Texture;

  updateForE2E(engine);
  initScreenshot(engine, camera);
});
