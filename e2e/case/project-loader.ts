/**
 * @title Project loader
 * @category Advance
 */
import { Logger, WebGLEngine, AssetType, Camera } from "@galacean/engine";
import { ShaderLab } from "@galacean/engine-shaderlab";
import { registerIncludes } from "@galacean/engine-shader-shaderlab";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

// Create ShaderLab
const shaderLab = new ShaderLab();
registerIncludes();

Logger.enable();
WebGLEngine.create({ canvas: "canvas", shaderLab }).then((engine) => {
  engine.canvas.resizeByClientSize(2);
  engine.resourceManager
    .load({
      type: AssetType.Project,
      url: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*CbucQ5pF7wEAAAAAAAAAAAAAekp5AQ/project.json"
    })
    .then(() => {
      const cameraEntity = engine.sceneManager.activeScene.findEntityByName("Camera");
      const camera = cameraEntity.getComponent(Camera);

      updateForE2E(engine);
      initScreenshot(engine, camera);
    });
});
