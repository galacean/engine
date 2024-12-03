/**
 * @title Mipmap
 * @category Texture
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*feqhQrfN1XIAAAAAAAAAAAAADiR2AQ/original
 */
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import * as dat from "dat.gui";
import {
  Camera,
  MeshRenderer,
  PrimitiveMesh,
  RenderFace,
  Texture2D,
  UnlitMaterial,
  WebGLEngine,
} from "@galacean/engine";
const gui = new dat.GUI();

// Create engine object
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // Create camera
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.setPosition(0, 0, 1);
  cameraEntity.addComponent(Camera);
  cameraEntity.addComponent(OrbitControl);

  // Create Plane
  const mesh = PrimitiveMesh.createPlane(engine, 2, 2);
  const material = new UnlitMaterial(engine);
  material.renderFace = RenderFace.Double;
  material.tilingOffset.set(30, 30, 0, 0);
  const planeEntity = rootEntity.createChild("ground");
  planeEntity.transform.setRotation(5, 0, 0);
  const planeRenderer = planeEntity.addComponent(MeshRenderer);
  planeRenderer.mesh = mesh;
  planeRenderer.setMaterial(material);

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src =
    "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*_CtuR7LW4C0AAAAAAAAAAAAAARQnAQ";
  img.onload = () => {
    const { width, height } = img;
    const texture = new Texture2D(engine, width, height);
    texture.setImageSource(img);
    texture.generateMipmaps();

    const textureNoMipmap = new Texture2D(
      engine,
      width,
      height,
      undefined,
      false
    );
    textureNoMipmap.setImageSource(img);

    material.baseTexture = texture;
    addGUI(texture, textureNoMipmap);
    engine.run();
  };

  function addGUI(texture: Texture2D, textureNoMipmap: Texture2D) {
    gui.add({ mipmap: true }, "mipmap").onChange((v) => {
      if (v) {
        material.baseTexture = texture;
      } else {
        material.baseTexture = textureNoMipmap;
      }
    });
  }
});
