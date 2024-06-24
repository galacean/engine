/**
 * @title Box Selection Controls
 * @category Toolkit
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*MnsLTotWN2IAAAAAAAAAAAAADiR2AQ/original
 */
 import {
  Camera,
  MeshRenderer,
  PrimitiveMesh,
  UnlitMaterial,
  WebGLEngine
} from "@galacean/engine";
import { OutlineManager } from "@galacean/engine-toolkit-outline";
import { BoxSelectionComponent, BoxSelectionControls } from "@galacean/engine-toolkit-controls";

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();
  engine.run();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  const cameraEntity = rootEntity.createChild("camera_entity");
  cameraEntity.addComponent(Camera);
  // add BoxSelectionControls to camera entity
  cameraEntity.addComponent(BoxSelectionControls);
  cameraEntity.transform.setPosition(0, 0, 15);

  const outlineManager = cameraEntity.addComponent(OutlineManager);
  outlineManager.size = 2;

  const mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
  const material = new UnlitMaterial(engine);
  for (let i = 0; i < 25; i++) {
    const entity = rootEntity.createChild('e' + i);
    // Entity with BoxSelectionComponent can be selected by controls.
    const select = entity.addComponent(BoxSelectionComponent);
    entity.transform.setPosition(-4 + (i % 5) * 2, -4 + Math.floor(i / 5) * 2, 0);
    const renderer = entity.addComponent(MeshRenderer);
    renderer.setMaterial(material);
    renderer.mesh = mesh;

    select.onSelect = () => {
      outlineManager.addEntity(entity);
    }
    select.onUnselect = () => {
      outlineManager.removeEntity(entity);
    }
  }
});
