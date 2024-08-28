/**
 * @title Filter Mode
 * @category Texture
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*EC0zSI4-gC8AAAAAAAAAAAAADiR2AQ/original
 */
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import * as dat from "dat.gui";
import {
  AssetType,
  Camera,
  MeshRenderer,
  PrimitiveMesh,
  RenderFace,
  Texture2D,
  TextureFilterMode,
  UnlitMaterial,
  WebGLEngine,
} from "@galacean/engine";
const gui = new dat.GUI();

// Create engine
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
  const planeEntity = rootEntity.createChild("ground");
  planeEntity.transform.setRotation(5, 0, 0);
  const planeRenderer = planeEntity.addComponent(MeshRenderer);
  planeRenderer.mesh = mesh;
  planeRenderer.setMaterial(material);

  engine.resourceManager
    .load<Texture2D>({
      url: "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*_CtuR7LW4C0AAAAAAAAAAAAAARQnAQ",
      type: AssetType.Texture2D,
    })
    .then((texture) => {
      material.baseTexture = texture;
      material.tilingOffset.set(30, 30, 0, 0);
      addGUI(texture);
      engine.run();
    });

  function addGUI(texture: Texture2D) {
    const filterMap: Record<TextureFilterMode, string> = {
      [TextureFilterMode.Point]: "Point",
      [TextureFilterMode.Bilinear]: "Bilinear",
      [TextureFilterMode.Trilinear]: "Trilinear",
    };
    const state = {
      filterMode: filterMap[texture.filterMode],
    };
    gui.add(state, "filterMode", Object.values(filterMap)).onChange((v) => {
      for (let key in filterMap) {
        const value = filterMap[key];
        if (v === value) {
          texture.filterMode = Number(key);
        }
      }
    });
  }
});
