/**
 * @title Project loader
 * @category Advance
 */
import { Logger, WebGLEngine, AssetType, Entity, Camera } from "@galacean/engine";
import { ShaderLab } from "@galacean/engine-shader-lab";
import { registerIncludes } from "@galacean/engine-toolkit";
import { initScreenshot, updateForE2E } from './.mockForE2E';

// Create ShaderLab
const shaderLab = new ShaderLab();
registerIncludes();

Logger.enable();
WebGLEngine.create({ canvas: "canvas", shaderLab }).then( (engine) => {
  engine.resourceManager
    .load({
      type: AssetType.Project,
      url: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*6tHUQ4pAug0AAAAAAAAAAAAADkp5AQ/project.json"
    }).then(() => {
      updateForE2E(engine);

      const cameraEntity =
        engine.sceneManager.activeScene.findEntityByName('Camera');
      const camera = cameraEntity.getComponent(Camera)
      initScreenshot(engine, camera)
    })
  engine.run();

  engine.canvas.resizeByClientSize();
});
