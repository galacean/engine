/**
 * @title Outline post-process
 * @category Toolkit
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*bSgLQqSgilcAAAAAAAAAAAAADiR2AQ/original
 */
import * as dat from "dat.gui";
import {
  AmbientLight,
  Animator,
  AssetType,
  Camera,
  GLTFResource,
  MeshRenderer,
  PBRMaterial,
  PointerButton,
  PrimitiveMesh,
  Script,
  WebGLEngine,
} from "@galacean/engine";
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import { FramebufferPicker } from "@galacean/engine-toolkit-framebuffer-picker";
import { OutlineManager } from "@galacean/engine-toolkit-outline";

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.run();
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();
  scene.background.solidColor.set(1, 1, 1, 1);

  const cameraEntity = rootEntity.createChild("camera_entity");
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.transform.setPosition(1, 1.3, 10);
  cameraEntity.addComponent(OrbitControl).target.set(1, 1.3, 0);

  const outlineManager = cameraEntity.addComponent(OutlineManager);
  outlineManager.isChildrenIncluded = true;
  addDebugGUI(outlineManager);

  const framebufferPicker = cameraEntity.addComponent(FramebufferPicker);

  class ClickScript extends Script {
    onUpdate(): void {
      const inputManager = this.engine.inputManager;
      const { pointers } = inputManager;
      if (pointers && inputManager.isPointerDown(PointerButton.Primary)) {
        const pointerPosition = pointers[0].position;
        framebufferPicker
          .pick(pointerPosition.x, pointerPosition.y)
          .then((renderElement) => {
            if (renderElement) {
              outlineManager.addEntity(renderElement.entity);
            } else {
              outlineManager.clear();
            }
          });
      }
    }
  }

  cameraEntity.addComponent(ClickScript);

  engine.resourceManager
    .load<AmbientLight>({
      type: AssetType.Env,
      url: "https://gw.alipayobjects.com/os/bmw-prod/89c54544-1184-45a1-b0f5-c0b17e5c3e68.bin",
    })
    .then((ambientLight) => {
      scene.ambientLight = ambientLight;
      ambientLight.specularIntensity = ambientLight.diffuseIntensity = 2;
    });

  engine.resourceManager
    .load<GLTFResource>({
      type: AssetType.GLTF,
      url: "https://gw.alipayobjects.com/os/bmw-prod/5e3c1e4e-496e-45f8-8e05-f89f2bd5e4a4.glb",
    })
    .then((gltf) => {
      const parentEntity = rootEntity.createChild();
      const renderer = parentEntity.addComponent(MeshRenderer);
      renderer.setMaterial(new PBRMaterial(engine));
      renderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);

      const otherEntity = rootEntity.createChild();
      otherEntity.transform.setPosition(2, 0, 0);
      const otherRenderer = otherEntity.addComponent(MeshRenderer);
      otherRenderer.setMaterial(new PBRMaterial(engine));
      otherRenderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);

      const { defaultSceneRoot, animations } = gltf;
      parentEntity.addChild(defaultSceneRoot);
      const animator = defaultSceneRoot.getComponent(Animator);
      animator.play(animations[0].name);
    });

  function addDebugGUI(outlineManager: OutlineManager) {
    const debugInfo = {
      mainColor: [
        outlineManager.mainColor.r * 255,
        outlineManager.mainColor.g * 255,
        outlineManager.mainColor.b * 255,
      ],
      subColor: [
        outlineManager.subColor.r * 255,
        outlineManager.subColor.g * 255,
        outlineManager.subColor.b * 255,
      ],
    };
    const gui = new dat.GUI();

    gui.add(outlineManager, "size", 1, 6, 0.1);
    gui.addColor(debugInfo, "mainColor").onChange((v) => {
      outlineManager.mainColor.set(v[0] / 255, v[1] / 255, v[2] / 255, 1);
    });
    gui.addColor(debugInfo, "subColor").onChange((v) => {
      outlineManager.subColor.set(v[0] / 255, v[1] / 255, v[2] / 255, 1);
    });
  }
});
