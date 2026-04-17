/**
 * @title Project Loader
 * @category Advance
 */
import { AssetType, Logger, WebGLEngine } from "@galacean/engine";
import { ShaderLab } from "@galacean/engine-shaderlab";

Logger.enable();

const shaderLab = new ShaderLab();

WebGLEngine.create({
  canvas: document.getElementById("canvas") as HTMLCanvasElement,
  shaderLab
}).then((engine) => {
  engine.canvas.resizeByClientSize();

  engine.resourceManager
    .load({
      url: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*aE8_QotPNL4AAAAAQNAAAAgAekp5AQ/project.json",
      type: AssetType.Project
    })
    .then(() => {
      console.log("Project loaded");
      engine.run();
    })
    .catch((e) => {
      console.error("Failed to load project", e);
    });
});
