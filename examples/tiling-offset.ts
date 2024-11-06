/**
 * @title Tiling Offset
 * @category Material
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*M8yOQJfewiQAAAAAAAAAAAAADiR2AQ/original
 */
import {
  AssetType,
  Camera,
  MeshRenderer,
  PrimitiveMesh,
  RenderFace,
  Script,
  Texture2D,
  UnlitMaterial,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import * as dat from "dat.gui";

main();

async function main() {
  // Create engine object
  const engine = await WebGLEngine.create({ canvas: "canvas" });
  engine.canvas.resizeByClientSize();

  // Load texture
  engine.resourceManager
    .load<Texture2D>({
      url: "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*Umw_RJGiZLYAAAAAAAAAAAAAARQnAQ",
      type: AssetType.Texture2D
    })
    .then((texture) => {
      const scene = engine.sceneManager.activeScene;
      const rootEntity = scene.createRootEntity();

      // Create camera
      const cameraEntity = rootEntity.createChild("Camera");
      cameraEntity.transform.position = new Vector3(0, 0, 20);
      cameraEntity.addComponent(Camera);
      cameraEntity.addComponent(OrbitControl);

      // Create plane
      const entity = rootEntity.createChild();
      entity.transform.setRotation(90, 0, 0);
      const renderer = entity.addComponent(MeshRenderer);
      const mesh = PrimitiveMesh.createPlane(engine, 10, 10);
      const material = new UnlitMaterial(engine);

      texture.anisoLevel = 16;
      material.renderFace = RenderFace.Double;
      material.baseTexture = texture;

      renderer.mesh = mesh;
      renderer.setMaterial(material);

      // Add animation script
      const animationScript = rootEntity.addComponent(AnimateScript);

      // Add data GUI
      const guiData = addDataGUI(material, animationScript);
      animationScript.guiData = guiData;
      animationScript.material = material;

      // Run engine
      engine.run();
    });
}

/**
 * Add data GUI.
 */
function addDataGUI(material: UnlitMaterial, animationScript: AnimateScript): any {
  const gui = new dat.GUI();
  const guiData = {
    tilingX: 1,
    tilingY: 1,
    offsetX: 0,
    offsetY: 0,
    reset: function () {
      guiData.tilingX = 1;
      guiData.tilingY = 1;
      guiData.offsetX = 0;
      guiData.offsetY = 0;
      material.tilingOffset.set(1, 1, 0, 0);
    },
    pause: function () {
      animationScript.enabled = false;
    },
    resume: function () {
      animationScript.enabled = true;
    }
  };

  gui
    .add(guiData, "tilingX", 0, 10)
    .onChange((value: number) => {
      material.tilingOffset.x = value;
    })
    .listen();
  gui
    .add(guiData, "tilingY", 0, 10)
    .onChange((value: number) => {
      material.tilingOffset.y = value;
    })
    .listen();
  gui
    .add(guiData, "offsetX", 0, 1)
    .onChange((value: number) => {
      material.tilingOffset.z = value;
    })
    .listen();
  gui
    .add(guiData, "offsetY", 0, 1)
    .onChange((value: number) => {
      material.tilingOffset.w = value;
    })
    .listen();
  gui.add(guiData, "reset").name("重置");
  gui.add(guiData, "pause").name("暂停动画");
  gui.add(guiData, "resume").name("继续动画");

  return guiData;
}

/**
 * Animation script.
 */
class AnimateScript extends Script {
  guiData: any;
  material: UnlitMaterial;

  /**
   * The main loop, called frame by frame.
   * @param deltaTime - The deltaTime when the script update.
   */
  onUpdate(deltaTime: number): void {
    const { material, guiData } = this;
    material.tilingOffset.x = guiData.tilingX = ((guiData.tilingX - 1 + deltaTime) % 9) + 1;
    material.tilingOffset.y = guiData.tilingY = ((guiData.tilingY - 1 + deltaTime) % 9) + 1;
  }
}
